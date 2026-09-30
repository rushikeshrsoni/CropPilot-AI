import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { farmsTable } from "./farms";
import { usersTable } from "./users";

export const diagnosesTable = pgTable(
  "diagnoses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    farmId: uuid("farm_id").references(() => farmsTable.id, { onDelete: "set null" }),
    cropName: text("crop_name").notNull(),
    symptomsText: text("symptoms_text"),
    requestPayload: jsonb("request_payload").$type<Record<string, unknown>>().notNull(),
    aiResponse: jsonb("ai_response").$type<Record<string, unknown>>().notNull(),
    confidenceScore: integer("confidence_score").notNull(),
    language: text("language").notNull().default("en"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("diagnoses_user_id_idx").on(table.userId),
    index("diagnoses_created_at_idx").on(table.createdAt),
    pgPolicy("diagnoses_isolation", {
      for: "all",
      to: "public",
      using: sql`user_id = current_setting('app.current_user_id', true)::uuid`,
      withCheck: sql`user_id = current_setting('app.current_user_id', true)::uuid`,
    }),
  ],
).enableRLS();

export const insertDiagnosisSchema = createInsertSchema(diagnosesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertDiagnosis = z.infer<typeof insertDiagnosisSchema>;
export type Diagnosis = typeof diagnosesTable.$inferSelect;