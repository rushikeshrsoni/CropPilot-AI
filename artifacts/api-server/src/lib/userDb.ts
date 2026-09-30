import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

export type UserTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function withUserContext<T>(
  userId: string,
  operation: (tx: UserTransaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.current_user_id', ${userId}, true)`,
    );
    return operation(tx);
  });
}