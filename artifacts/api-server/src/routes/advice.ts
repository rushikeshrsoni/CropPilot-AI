import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { and, desc, eq } from "drizzle-orm";
import {
  CreateAdviceBody,
  CreateAdviceResponse,
  GetAdviceParams,
  GetAdviceResponse,
  ListAdviceResponse,
} from "@workspace/api-zod";
import { adviceReportsTable, farmsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { generateAdvice } from "../lib/ai";
import { withUserContext } from "../lib/userDb";

const router: IRouter = Router();
router.use(requireAuth);
const adviceLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "You have reached the advisory limit. Please try again later." },
});

function adviceResponse(
  report: typeof adviceReportsTable.$inferSelect,
  farmName: string | null,
) {
  return {
    id: report.id,
    farmId: report.farmId,
    farmName,
    goal: report.goal,
    season: report.season,
    currentCrops: report.currentCrops,
    specificQuestions: report.specificQuestions,
    result: report.aiResponse,
    language: report.language,
    createdAt: report.createdAt,
  };
}

router.get("/advice", async (req, res): Promise<void> => {
  const rows = await withUserContext(req.userId!, (tx) =>
    tx
      .select({ report: adviceReportsTable, farmName: farmsTable.name })
      .from(adviceReportsTable)
      .leftJoin(farmsTable, eq(adviceReportsTable.farmId, farmsTable.id))
      .where(eq(adviceReportsTable.userId, req.userId!))
      .orderBy(desc(adviceReportsTable.createdAt))
      .limit(100),
  );
  res.json(
    ListAdviceResponse.parse(
      rows.map(({ report, farmName }) => adviceResponse(report, farmName ?? null)),
    ),
  );
});

router.post("/advice", adviceLimiter, async (req, res): Promise<void> => {
  const parsed = CreateAdviceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Check the selected farm and advice details." });
    return;
  }
  const input = parsed.data;
  const [farm] = await withUserContext(req.userId!, (tx) =>
    tx
      .select()
      .from(farmsTable)
      .where(and(eq(farmsTable.id, input.farmId), eq(farmsTable.userId, req.userId!)))
      .limit(1),
  );
  if (!farm) {
    res.status(404).json({ error: "Farm not found. Select one of your farms to continue." });
    return;
  }
  const farmContext = {
    name: farm.name,
    state: farm.state,
    district: farm.district,
    soilType: farm.soilType,
    soilPh: farm.soilPh,
    organicMatter: farm.organicMatter,
    irrigationMethod: farm.irrigationMethod,
    farmSizeAcres: farm.farmSizeAcres,
    primaryCrops: farm.primaryCrops,
  };
  const prompt = [
    "Create a practical, personalized Indian farm plan. Respond only with the required JSON object.",
    `Farmer goal: ${input.goal}`,
    `Season: ${input.season}`,
    `Current crops: ${input.currentCrops?.trim() || farm.primaryCrops.join(", ") || "not specified"}`,
    `Specific questions: ${input.specificQuestions?.trim() || "none"}`,
    `Farm profile: ${JSON.stringify(farmContext)}`,
    `Response language: ${input.language === "hi" ? "Hindi" : "English"}`,
    "Do not assume laboratory soil results that were not provided. Explain uncertainty, avoid fabricated fertilizer or pesticide dosages, and recommend soil testing and local extension advice where needed.",
  ].join("\n");

  let result;
  try {
    result = await generateAdvice(prompt);
  } catch (error) {
    req.log.error(
      {
        userId: req.userId,
        operation: "advice",
        errorName: error instanceof Error ? error.name : "unknown",
      },
      "AI advice generation failed",
    );
    res.status(503).json({ error: "Personalized advice is temporarily unavailable. Please try again shortly." });
    return;
  }

  const [report] = await withUserContext(req.userId!, (tx) =>
    tx
      .insert(adviceReportsTable)
      .values({
        userId: req.userId!,
        farmId: farm.id,
        requestPayload: {
          goal: input.goal,
          season: input.season,
          currentCrops: input.currentCrops ?? null,
          specificQuestions: input.specificQuestions ?? null,
        },
        aiResponse: result,
        goal: input.goal,
        season: input.season,
        currentCrops: input.currentCrops ?? null,
        specificQuestions: input.specificQuestions ?? null,
        language: input.language,
      })
      .returning(),
  );
  res.status(201).json(
    CreateAdviceResponse.parse(adviceResponse(report, farm.name)),
  );
});

router.get("/advice/:id", async (req, res): Promise<void> => {
  const params = GetAdviceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid advice report identifier." });
    return;
  }
  const [row] = await withUserContext(req.userId!, (tx) =>
    tx
      .select({ report: adviceReportsTable, farmName: farmsTable.name })
      .from(adviceReportsTable)
      .leftJoin(farmsTable, eq(adviceReportsTable.farmId, farmsTable.id))
      .where(and(eq(adviceReportsTable.id, params.data.id), eq(adviceReportsTable.userId, req.userId!)))
      .limit(1),
  );
  if (!row) {
    res.status(404).json({ error: "Advice report not found." });
    return;
  }
  res.json(
    GetAdviceResponse.parse(adviceResponse(row.report, row.farmName ?? null)),
  );
});

export default router;