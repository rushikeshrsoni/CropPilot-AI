import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  GetDashboardResponse,
  ListHistoryQueryParams,
  ListHistoryResponse,
} from "@workspace/api-zod";
import {
  adviceReportsTable,
  chatMessagesTable,
  chatSessionsTable,
  diagnosesTable,
  farmsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { withUserContext, type UserTransaction } from "../lib/userDb";

const router: IRouter = Router();
router.use(requireAuth);

type HistoryKind = "diagnosis" | "advice" | "chat";
type Activity = {
  id: string;
  kind: HistoryKind;
  title: string;
  summary: string;
  createdAt: Date;
  path: string;
};

function resultField(value: unknown, field: string): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const fieldValue = (value as Record<string, unknown>)[field];
  return typeof fieldValue === "string" ? fieldValue : undefined;
}

async function activityForUser(
  tx: UserTransaction,
  userId: string,
  kind?: HistoryKind,
): Promise<Activity[]> {
  const items: Activity[] = [];
  if (!kind || kind === "diagnosis") {
    const rows = await tx
      .select()
      .from(diagnosesTable)
      .where(eq(diagnosesTable.userId, userId))
      .orderBy(desc(diagnosesTable.createdAt))
      .limit(50);
    for (const row of rows) {
      items.push({
        id: row.id,
        kind: "diagnosis",
        title: `${row.cropName} diagnosis`,
        summary: resultField(row.aiResponse, "diseaseName") ?? "Crop health assessment",
        createdAt: row.createdAt,
        path: `/diagnose/${row.id}`,
      });
    }
  }
  if (!kind || kind === "advice") {
    const rows = await tx
      .select()
      .from(adviceReportsTable)
      .where(eq(adviceReportsTable.userId, userId))
      .orderBy(desc(adviceReportsTable.createdAt))
      .limit(50);
    for (const row of rows) {
      items.push({
        id: row.id,
        kind: "advice",
        title: `Farm plan · ${row.season}`,
        summary: resultField(row.aiResponse, "cropRecommendations")
          ? "Personalized crop and soil plan"
          : "Saved farm advisory",
        createdAt: row.createdAt,
        path: `/advice/${row.id}`,
      });
    }
  }
  if (!kind || kind === "chat") {
    const sessions = await tx
      .select()
      .from(chatSessionsTable)
      .where(eq(chatSessionsTable.userId, userId))
      .orderBy(desc(chatSessionsTable.updatedAt))
      .limit(50);
    for (const session of sessions) {
      const [latest] = await tx
        .select({ content: chatMessagesTable.content })
        .from(chatMessagesTable)
        .where(
          and(
            eq(chatMessagesTable.sessionId, session.id),
            eq(chatMessagesTable.userId, userId),
          ),
        )
        .orderBy(desc(chatMessagesTable.createdAt))
        .limit(1);
      items.push({
        id: session.id,
        kind: "chat",
        title: session.title,
        summary: latest?.content ?? "Conversation started",
        createdAt: session.updatedAt,
        path: `/chat/${session.id}`,
      });
    }
  }
  return items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 100);
}

router.get("/dashboard", async (req, res): Promise<void> => {
  const result = await withUserContext(req.userId!, async (tx) => {
    const [
      [farmCount],
      [diagnosisCount],
      [adviceCount],
      [chatCount],
      latestDiagnosisRows,
      latestAdviceRows,
      recentActivity,
    ] = await Promise.all([
      tx.select({ count: sql<number>`count(*)::int` }).from(farmsTable).where(eq(farmsTable.userId, req.userId!)),
      tx.select({ count: sql<number>`count(*)::int` }).from(diagnosesTable).where(eq(diagnosesTable.userId, req.userId!)),
      tx.select({ count: sql<number>`count(*)::int` }).from(adviceReportsTable).where(eq(adviceReportsTable.userId, req.userId!)),
      tx.select({ count: sql<number>`count(*)::int` }).from(chatSessionsTable).where(eq(chatSessionsTable.userId, req.userId!)),
      tx
        .select({ diagnosis: diagnosesTable, farmName: farmsTable.name })
        .from(diagnosesTable)
        .leftJoin(farmsTable, eq(diagnosesTable.farmId, farmsTable.id))
        .where(eq(diagnosesTable.userId, req.userId!))
        .orderBy(desc(diagnosesTable.createdAt))
        .limit(1),
      tx
        .select({ report: adviceReportsTable, farmName: farmsTable.name })
        .from(adviceReportsTable)
        .leftJoin(farmsTable, eq(adviceReportsTable.farmId, farmsTable.id))
        .where(eq(adviceReportsTable.userId, req.userId!))
        .orderBy(desc(adviceReportsTable.createdAt))
        .limit(1),
      activityForUser(tx, req.userId!),
    ]);

    const latestDiagnosis = latestDiagnosisRows[0]
      ? {
          id: latestDiagnosisRows[0].diagnosis.id,
          farmId: latestDiagnosisRows[0].diagnosis.farmId,
          farmName: latestDiagnosisRows[0].farmName ?? null,
          cropName: latestDiagnosisRows[0].diagnosis.cropName,
          symptomsText: latestDiagnosisRows[0].diagnosis.symptomsText,
          result: latestDiagnosisRows[0].diagnosis.aiResponse,
          language: latestDiagnosisRows[0].diagnosis.language,
          createdAt: latestDiagnosisRows[0].diagnosis.createdAt,
        }
      : undefined;
    const latestAdvice = latestAdviceRows[0]
      ? {
          id: latestAdviceRows[0].report.id,
          farmId: latestAdviceRows[0].report.farmId,
          farmName: latestAdviceRows[0].farmName ?? null,
          goal: latestAdviceRows[0].report.goal,
          season: latestAdviceRows[0].report.season,
          currentCrops: latestAdviceRows[0].report.currentCrops,
          specificQuestions: latestAdviceRows[0].report.specificQuestions,
          result: latestAdviceRows[0].report.aiResponse,
          language: latestAdviceRows[0].report.language,
          createdAt: latestAdviceRows[0].report.createdAt,
        }
      : undefined;
    return {
      farmCount: farmCount?.count ?? 0,
      diagnosisCount: diagnosisCount?.count ?? 0,
      adviceCount: adviceCount?.count ?? 0,
      chatCount: chatCount?.count ?? 0,
      ...(latestDiagnosis && { latestDiagnosis }),
      ...(latestAdvice && { latestAdvice }),
      recentActivity,
    };
  });
  res.json(GetDashboardResponse.parse(result));
});

router.get("/history", async (req, res): Promise<void> => {
  const parsed = ListHistoryQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid history filter." });
    return;
  }
  const items = await withUserContext(req.userId!, (tx) =>
    activityForUser(tx, req.userId!, parsed.data.kind),
  );
  res.json(ListHistoryResponse.parse(items));
});

export default router;