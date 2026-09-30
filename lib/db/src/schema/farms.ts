import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import {
  index,
  numeric,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const farmsTable = pgTable(
  "farms",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    state: text("state"),
    district: text("district"),
    soilType: text("soil_type"),
    soilPh: numeric("soil_ph", { precision: 3, scale: 1, mode: "number" }),
    organicMatter: text("organic_matter"),
    irrigationMethod: text("irrigation_method"),
    farmSizeAcres: numeric("farm_size_acres", { precision: 10, scale: 2, mode: "number" }),
    primaryCrops: text("primary_crops").array().notNull().default(sql`ARRAY[]::text[]`),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("farms_user_id_idx").on(table.userId),
    pgPolicy("farms_isolation", {
      for: "all",
      to: "public",
      using: sql`user_id = current_setting('app.current_user_id', true)::uuid`,
      withCheck: sql`user_id = current_setting('app.current_user_id', true)::uuid`,
    }),
  ],
).enableRLS();

export const insertFarmSchema = createInsertSchema(farmsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertFarm = z.infer<typeof insertFarmSchema>;
export type Farm = typeof farmsTable.$inferSelect;