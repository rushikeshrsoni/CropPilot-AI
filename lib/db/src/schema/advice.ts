import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import {
  index,
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

export const adviceReportsTable = pgTable(
  "advice_reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    farmId: uuid("farm_id").references(() => farmsTable.id, { onDelete: "set null" }),
    requestPayload: jsonb("request_payload").$type<Record<string, unknown>>().notNull(),
    aiResponse: jsonb("ai_response").$type<Record<string, unknown>>().notNull(),
    goal: text("goal").notNull(),
    season: text("season").notNull(),
    currentCrops: text("current_crops"),
    specificQuestions: text("specific_questions"),
    language: text("language").notNull().default("en"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("advice_reports_user_id_idx").on(table.userId),
    index("advice_reports_created_at_idx").on(table.createdAt),
    pgPolicy("advice_reports_isolation", {
      for: "all",
      to: "public",
      using: sql`user_id = current_setting('app.current_user_id', true)::uuid`,
      withCheck: sql`user_id = current_setting('app.current_user_id', true)::uuid`,
    }),
  ],
).enableRLS();

export const insertAdviceReportSchema = createInsertSchema(adviceReportsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAdviceReport = z.infer<typeof insertAdviceReportSchema>;
export type AdviceReport = typeof adviceReportsTable.$inferSelect;