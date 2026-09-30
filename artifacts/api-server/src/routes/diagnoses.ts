import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { and, desc, eq } from "drizzle-orm";
import {
  CreateDiagnosisBody,
  CreateDiagnosisResponse,
  GetDiagnosisParams,
  GetDiagnosisResponse,
  ListDiagnosesResponse,
} from "@workspace/api-zod";
import { diagnosesTable, farmsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { diagnoseCrop } from "../lib/ai";
import { withUserContext } from "../lib/userDb";

const router: IRouter = Router();
router.use(requireAuth);
const diagnoseLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "You have reached the diagnosis limit. Please try again later." },
});

type FarmContext = Pick<
  typeof farmsTable.$inferSelect,
  | "name"
  | "state"
  | "district"
  | "soilType"
  | "soilPh"
  | "organicMatter"
  | "irrigationMethod"
  | "farmSizeAcres"
  | "primaryCrops"
>;

function diagnosisResponse(
  record: typeof diagnosesTable.$inferSelect,
  farmName: string | null,
) {
  return {
    id: record.id,
    farmId: record.farmId,
    farmName,
    cropName: record.cropName,
    symptomsText: record.symptomsText,
    result: record.aiResponse,
    language: record.language,
    createdAt: record.createdAt,
  };
}

function decodeImageData(imageData: string | undefined):
  | { mimeType: string; data: string }
  | undefined {
  if (!imageData) return undefined;
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(imageData);
  if (!match) {
    throw new Error("Choose a JPEG, PNG, or WebP image.");
  }
  const data = match[2];
  const bytes = Buffer.from(data, "base64");
  if (bytes.byteLength > 8 * 1024 * 1024) {
    throw new Error("Images must be 8 MB or smaller.");
  }
  if (bytes.toString("base64").replace(/=+$/, "") !== data.replace(/=+$/, "")) {
    throw new Error("The selected image could not be read. Please choose it again.");
  }
  return { mimeType: match[1], data };
}

function farmSummary(farm: FarmContext | undefined): string {
  if (!farm) return "No farm profile was selected.";
  return JSON.stringify({
    name: farm.name,
    state: farm.state,
    district: farm.district,
    soilType: farm.soilType,
    soilPh: farm.soilPh,
    organicMatter: farm.organicMatter,
    irrigationMethod: farm.irrigationMethod,
    farmSizeAcres: farm.farmSizeAcres,
    primaryCrops: farm.primaryCrops,
  });
}

router.get("/diagnoses", async (req, res): Promise<void> => {
  const rows = await withUserContext(req.userId!, async (tx) =>
    tx
      .select({ diagnosis: diagnosesTable, farmName: farmsTable.name })
      .from(diagnosesTable)
      .leftJoin(farmsTable, eq(diagnosesTable.farmId, farmsTable.id))
      .where(eq(diagnosesTable.userId, req.userId!))
      .orderBy(desc(diagnosesTable.createdAt))
      .limit(100),
  );
  res.json(
    ListDiagnosesResponse.parse(
      rows.map(({ diagnosis, farmName }) => diagnosisResponse(diagnosis, farmName ?? null)),
    ),
  );
});

router.post("/diagnoses", diagnoseLimiter, async (req, res): Promise<void> => {
  const parsed = CreateDiagnosisBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a crop name and symptoms, or add a crop photo." });
    return;
  }
  const input = parsed.data;
  let image: { mimeType: string; data: string } | undefined;
  try {
    image = decodeImageData(input.imageData);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid image." });
    return;
  }
  if (!image && !input.symptomsText?.trim()) {
    res.status(400).json({ error: "Add a photo or describe the crop symptoms." });
    return;
  }

  let farm: FarmContext | undefined;
  if (input.farmId) {
    const [selectedFarm] = await withUserContext(req.userId!, (tx) =>
      tx
        .select({
          name: farmsTable.name,
          state: farmsTable.state,
          district: farmsTable.district,
          soilType: farmsTable.soilType,
          soilPh: farmsTable.soilPh,
          organicMatter: farmsTable.organicMatter,
          irrigationMethod: farmsTable.irrigationMethod,
          farmSizeAcres: farmsTable.farmSizeAcres,
          primaryCrops: farmsTable.primaryCrops,
        })
        .from(farmsTable)
        .where(and(eq(farmsTable.id, input.farmId!), eq(farmsTable.userId, req.userId!)))
        .limit(1),
    );
    if (!selectedFarm) {
      res.status(404).json({ error: "Selected farm was not found." });
      return;
    }
    farm = selectedFarm;
  }

  const prompt = [
    "Analyze this crop issue. Respond only with the required JSON object.",
    `Crop: ${input.cropName}`,
    `Growth stage: ${input.growthStage || "not provided"}`,
    `When symptoms began: ${input.noticedWhen || "not provided"}`,
    `Observed symptoms: ${input.symptomsText?.trim() || "See the attached crop photo."}`,
    `Additional observation: ${input.notes?.trim() || "none"}`,
    `Farm context: ${farmSummary(farm)}`,
    `Response language: ${input.language === "hi" ? "Hindi" : "English"}`,
    "Use cautious confidence estimates. If evidence is insufficient, say so in the disease name and explain what additional observation would help. Never invent chemical application rates.",
  ].join("\n");

  let result;
  try {
    result = await diagnoseCrop({ prompt, image });
  } catch (error) {
    req.log.error(
      {
        userId: req.userId,
        operation: "diagnosis",
        errorName: error instanceof Error ? error.name : "unknown",
      },
      "AI diagnosis failed",
    );
    res.status(503).json({ error: "Diagnosis is temporarily unavailable. Please try again shortly." });
    return;
  }

  const [record] = await withUserContext(req.userId!, (tx) =>
    tx
      .insert(diagnosesTable)
      .values({
        userId: req.userId!,
        farmId: input.farmId ?? null,
        cropName: input.cropName.trim(),
        symptomsText: input.symptomsText?.trim() || null,
        requestPayload: {
          cropName: input.cropName.trim(),
          growthStage: input.growthStage ?? null,
          noticedWhen: input.noticedWhen ?? null,
          notes: input.notes ?? null,
          hasImage: Boolean(image),
        },
        aiResponse: result,
        confidenceScore: result.confidenceScore,
        language: input.language,
      })
      .returning(),
  );
  res.status(201).json(
    CreateDiagnosisResponse.parse(diagnosisResponse(record, farm?.name ?? null)),
  );
});

router.get("/diagnoses/:id", async (req, res): Promise<void> => {
  const params = GetDiagnosisParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid diagnosis identifier." });
    return;
  }
  const [row] = await withUserContext(req.userId!, (tx) =>
    tx
      .select({ diagnosis: diagnosesTable, farmName: farmsTable.name })
      .from(diagnosesTable)
      .leftJoin(farmsTable, eq(diagnosesTable.farmId, farmsTable.id))
      .where(and(eq(diagnosesTable.id, params.data.id), eq(diagnosesTable.userId, req.userId!)))
      .limit(1),
  );
  if (!row) {
    res.status(404).json({ error: "Diagnosis not found." });
    return;
  }
  res.json(
    GetDiagnosisResponse.parse(diagnosisResponse(row.diagnosis, row.farmName ?? null)),
  );
});

export default router;