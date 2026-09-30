import { z } from "zod/v4";

export const diagnosisResultSchema = z.object({
  diseaseName: z.string().min(1),
  scientificName: z.string().nullable(),
  confidenceScore: z.number().int().min(0).max(100),
  severity: z.enum(["low", "medium", "high", "critical"]),
  matchedSymptoms: z.array(z.string()),
  possibleCauses: z.array(z.string()),
  immediateActions: z.array(z.string()),
  treatmentOrganic: z.array(z.string()),
  treatmentChemical: z.array(z.string()),
  preventionTips: z.array(z.string()),
  whenToSeekHelp: z.string(),
  disclaimer: z.string(),
});

export const adviceResultSchema = z.object({
  cropRecommendations: z.array(z.string()),
  fertilizerPlan: z.array(z.string()),
  irrigationPlan: z.array(z.string()),
  soilActions: z.array(z.string()),
  riskNotes: z.array(z.string()),
  disclaimer: z.string(),
});

export type DiagnosisResult = z.infer<typeof diagnosisResultSchema>;
export type AdviceResult = z.infer<typeof adviceResultSchema>;