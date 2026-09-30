import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { and, desc, eq } from "drizzle-orm";
import {
  CreateChatSessionBody,
  CreateChatSessionResponse,
  ListChatMessagesParams,
  ListChatMessagesResponse,
  ListChatSessionsResponse,
  SendChatMessageBody,
  SendChatMessageParams,
  SendChatMessageResponse,
} from "@workspace/api-zod";
import {
  chatMessagesTable,
  chatSessionsTable,
  diagnosesTable,
  farmsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { generateAgronomistReply } from "../lib/ai";
import { withUserContext } from "../lib/userDb";

const router: IRouter = Router();
router.use(requireAuth);
const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "You have reached the chat limit. Please try again later." },
});

router.get("/chat/sessions", async (req, res): Promise<void> => {
  const result = await withUserContext(req.userId!, async (tx) => {
    const sessions = await tx
      .select()
      .from(chatSessionsTable)
      .where(eq(chatSessionsTable.userId, req.userId!))
      .orderBy(desc(chatSessionsTable.updatedAt))
      .limit(50);
    return Promise.all(
      sessions.map(async (session) => {
        const [message] = await tx
          .select({ content: chatMessagesTable.content })
          .from(chatMessagesTable)
          .where(
            and(
              eq(chatMessagesTable.sessionId, session.id),
              eq(chatMessagesTable.userId, req.userId!),
            ),
          )
          .orderBy(desc(chatMessagesTable.createdAt))
          .limit(1);
        return {
          id: session.id,
          title: session.title,
          language: session.language,
          updatedAt: session.updatedAt,
          lastMessage: message?.content ?? null,
        };
      }),
    );
  });
  res.json(ListChatSessionsResponse.parse(result));
});

router.post("/chat/sessions", async (req, res): Promise<void> => {
  const parsed = CreateChatSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose English or Hindi to start a conversation." });
    return;
  }
  const [session] = await withUserContext(req.userId!, (tx) =>
    tx
      .insert(chatSessionsTable)
      .values({
        userId: req.userId!,
        title: parsed.data.title?.trim() || "New conversation",
        language: parsed.data.language,
      })
      .returning(),
  );
  res.status(201).json(
    CreateChatSessionResponse.parse({
      id: session.id,
      title: session.title,
      language: session.language,
      updatedAt: session.updatedAt,
      lastMessage: null,
    }),
  );
});

router.get("/chat/sessions/:id/messages", async (req, res): Promise<void> => {
  const params = ListChatMessagesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid conversation identifier." });
    return;
  }
  const result = await withUserContext(req.userId!, async (tx) => {
    const [session] = await tx
      .select({ id: chatSessionsTable.id })
      .from(chatSessionsTable)
      .where(
        and(
          eq(chatSessionsTable.id, params.data.id),
          eq(chatSessionsTable.userId, req.userId!),
        ),
      )
      .limit(1);
    if (!session) return null;
    return tx
      .select()
      .from(chatMessagesTable)
      .where(
        and(
          eq(chatMessagesTable.sessionId, session.id),
          eq(chatMessagesTable.userId, req.userId!),
        ),
      )
      .orderBy(chatMessagesTable.createdAt);
  });
  if (!result) {
    res.status(404).json({ error: "Conversation not found." });
    return;
  }
  res.json(ListChatMessagesResponse.parse(result));
});

router.post(
  "/chat/sessions/:id/messages",
  chatLimiter,
  async (req, res): Promise<void> => {
    const params = SendChatMessageParams.safeParse(req.params);
    const parsed = SendChatMessageBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({ error: "Enter a message before sending." });
      return;
    }

    const input = parsed.data;
    const prepared = await withUserContext(req.userId!, async (tx) => {
      const [session] = await tx
        .select()
        .from(chatSessionsTable)
        .where(
          and(
            eq(chatSessionsTable.id, params.data.id),
            eq(chatSessionsTable.userId, req.userId!),
          ),
        )
        .limit(1);
      if (!session) return null;

      const previous = await tx
        .select()
        .from(chatMessagesTable)
        .where(
          and(
            eq(chatMessagesTable.sessionId, session.id),
            eq(chatMessagesTable.userId, req.userId!),
          ),
        )
        .orderBy(desc(chatMessagesTable.createdAt))
        .limit(16);

      let context = "No farm or diagnosis context was requested.";
      if (input.useFarmContext) {
        const farms = await tx
          .select({
            name: farmsTable.name,
            state: farmsTable.state,
            district: farmsTable.district,
            soilType: farmsTable.soilType,
            soilPh: farmsTable.soilPh,
            irrigationMethod: farmsTable.irrigationMethod,
            primaryCrops: farmsTable.primaryCrops,
          })
          .from(farmsTable)
          .where(eq(farmsTable.userId, req.userId!))
          .limit(10);
        const diagnoses = await tx
          .select({
            cropName: diagnosesTable.cropName,
            aiResponse: diagnosesTable.aiResponse,
            createdAt: diagnosesTable.createdAt,
          })
          .from(diagnosesTable)
          .where(eq(diagnosesTable.userId, req.userId!))
          .orderBy(desc(diagnosesTable.createdAt))
          .limit(4);
        context = [
          `Farmer's farm profiles: ${JSON.stringify(farms)}`,
          `Recent saved crop diagnoses: ${JSON.stringify(
            diagnoses.map((diagnosis) => {
              const result = diagnosis.aiResponse as {
                diseaseName?: unknown;
                severity?: unknown;
              };
              return {
                crop: diagnosis.cropName,
                finding: result.diseaseName,
                severity: result.severity,
                date: diagnosis.createdAt,
              };
            }),
          )}`,
        ].join("\n");
      }

      const [userMessage] = await tx
        .insert(chatMessagesTable)
        .values({
          sessionId: session.id,
          userId: req.userId!,
          role: "user",
          content: input.content.trim(),
        })
        .returning();
      const title =
        session.title === "New conversation"
          ? input.content.trim().replace(/\s+/g, " ").slice(0, 72)
          : session.title;
      await tx
        .update(chatSessionsTable)
        .set({ title, updatedAt: new Date() })
        .where(eq(chatSessionsTable.id, session.id));

      const history: Array<{ role: "user" | "model"; text: string }> = previous
        .reverse()
        .map((message) => ({
          role: message.role === "assistant" ? "model" : "user",
          text: message.content,
        }));
      history.push({ role: "user", text: input.content.trim() });
      return { session, userMessage, context, history };
    });

    if (!prepared) {
      res.status(404).json({ error: "Conversation not found." });
      return;
    }

    let content: string;
    try {
      content = await generateAgronomistReply({
        language: prepared.session.language === "hi" ? "hi" : "en",
        context: prepared.context,
        history: prepared.history,
      });
    } catch (error) {
      req.log.error(
        {
          userId: req.userId,
          operation: "chat",
          errorName: error instanceof Error ? error.name : "unknown",
        },
        "AI chat request failed",
      );
      res.status(503).json({ error: "The agronomist is temporarily unavailable. Please try again shortly." });
      return;
    }

    const [reply] = await withUserContext(req.userId!, async (tx) => {
      const [message] = await tx
        .insert(chatMessagesTable)
        .values({
          sessionId: prepared.session.id,
          userId: req.userId!,
          role: "assistant",
          content,
        })
        .returning();
      await tx
        .update(chatSessionsTable)
        .set({ updatedAt: new Date() })
        .where(
          and(
            eq(chatSessionsTable.id, prepared.session.id),
            eq(chatSessionsTable.userId, req.userId!),
          ),
        );
      return [message];
    });
    res.status(201).json(SendChatMessageResponse.parse(reply));
  },
);

export default router;