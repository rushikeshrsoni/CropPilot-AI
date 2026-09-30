import { GoogleGenAI, Type, type Part } from "@google/genai";
import { adviceResultSchema, diagnosisResultSchema } from "./domainSchemas";

const MODEL = "gemini-2.5-flash";
const SYSTEM_PROMPT =
  "You are CropPilot AI, a practical Agricultural Extension Officer and Plant Pathology advisor with deep knowledge of Indian farming, tropical and subtropical crops, soil science, and integrated pest management. Give concise, actionable, locally relevant advice in the language requested. Be transparent about uncertainty and never present an image-only assessment as a definitive lab diagnosis. For chemical pesticides, prefer integrated pest management and registered products; never invent a dosage. Direct farmers to the locally registered product label and protective-equipment instructions, and clearly warn about toxicity, pollinators, water, and pre-harvest intervals where relevant. Recommend local extension or plant-health experts for high-risk decisions. Include a farmer-friendly disclaimer in structured reports.";

function client(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Gemini is not configured.");
  }
  return new GoogleGenAI({ apiKey });
}

async function retry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const status = (error as { status?: number; code?: number }).status ??
        (error as { code?: number }).code;
      if (attempt === 2 || (status !== 429 && (!status || status < 500))) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 350 * 2 ** attempt));
    }
  }
  throw lastError;
}

function parseJson(text: string): unknown {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(normalized) as unknown;
}

export async function diagnoseCrop(input: {
  prompt: string;
  image?: { mimeType: string; data: string };
}): Promise<ReturnType<typeof diagnosisResultSchema.parse>> {
  const parts: Part[] = [{ text: input.prompt }];
  if (input.image) {
    parts.push({
      inlineData: input.image,
    });
  }
  const response = await retry(() =>
    client().models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts }],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: [
            "diseaseName",
            "scientificName",
            "confidenceScore",
            "severity",
            "matchedSymptoms",
            "possibleCauses",
            "immediateActions",
            "treatmentOrganic",
            "treatmentChemical",
            "preventionTips",
            "whenToSeekHelp",
            "disclaimer",
          ],
          properties: {
            diseaseName: { type: Type.STRING },
            scientificName: { type: Type.STRING, nullable: true },
            confidenceScore: { type: Type.INTEGER },
            severity: { type: Type.STRING, enum: ["low", "medium", "high", "critical"] },
            matchedSymptoms: { type: Type.ARRAY, items: { type: Type.STRING } },
            possibleCauses: { type: Type.ARRAY, items: { type: Type.STRING } },
            immediateActions: { type: Type.ARRAY, items: { type: Type.STRING } },
            treatmentOrganic: { type: Type.ARRAY, items: { type: Type.STRING } },
            treatmentChemical: { type: Type.ARRAY, items: { type: Type.STRING } },
            preventionTips: { type: Type.ARRAY, items: { type: Type.STRING } },
            whenToSeekHelp: { type: Type.STRING },
            disclaimer: { type: Type.STRING },
          },
        },
      },
    }),
  );
  if (!response.text) {
    throw new Error("The AI service returned an empty diagnosis.");
  }
  return diagnosisResultSchema.parse(parseJson(response.text));
}

export async function generateAdvice(prompt: string): Promise<ReturnType<typeof adviceResultSchema.parse>> {
  const response = await retry(() =>
    client().models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: [
            "cropRecommendations",
            "fertilizerPlan",
            "irrigationPlan",
            "soilActions",
            "riskNotes",
            "disclaimer",
          ],
          properties: {
            cropRecommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
            fertilizerPlan: { type: Type.ARRAY, items: { type: Type.STRING } },
            irrigationPlan: { type: Type.ARRAY, items: { type: Type.STRING } },
            soilActions: { type: Type.ARRAY, items: { type: Type.STRING } },
            riskNotes: { type: Type.ARRAY, items: { type: Type.STRING } },
            disclaimer: { type: Type.STRING },
          },
        },
      },
    }),
  );
  if (!response.text) {
    throw new Error("The AI service returned an empty advice report.");
  }
  return adviceResultSchema.parse(parseJson(response.text));
}

export async function generateAgronomistReply(input: {
  language: "en" | "hi";
  context: string;
  history: Array<{ role: "user" | "model"; text: string }>;
}): Promise<string> {
  const response = await retry(() =>
    client().models.generateContent({
      model: MODEL,
      contents: input.history.map((message) => ({
        role: message.role,
        parts: [{ text: message.text }],
      })),
      config: {
        systemInstruction: `${SYSTEM_PROMPT}\nReply in ${input.language === "hi" ? "Hindi" : "English"}.\n${input.context}`,
        maxOutputTokens: 8192,
      },
    }),
  );
  const answer = response.text?.trim();
  if (!answer) {
    throw new Error("The AI service returned an empty reply.");
  }
  return answer;
}