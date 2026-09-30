import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { UpdateProfileBody, UpdateProfileResponse } from "@workspace/api-zod";
import { usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { withUserContext } from "../lib/userDb";

const router: IRouter = Router();
router.use(requireAuth);

router.patch("/profile", async (req, res): Promise<void> => {
  const parsed = UpdateProfileBody.safeParse(req.body);
  if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0) {
    res.status(400).json({ error: "Enter at least one valid profile detail." });
    return;
  }

  const updates = {
    ...parsed.data,
    ...(typeof parsed.data.fullName === "string" && { fullName: parsed.data.fullName.trim() }),
    ...(typeof parsed.data.regionState === "string" && { regionState: parsed.data.regionState.trim() || null }),
  };
  const [user] = await withUserContext(req.userId!, (tx) =>
    tx
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, req.userId!))
      .returning(),
  );
  if (!user) {
    res.status(404).json({ error: "Profile not found." });
    return;
  }
  res.json(
    UpdateProfileResponse.parse({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      preferredLanguage: user.preferredLanguage,
      regionState: user.regionState,
      createdAt: user.createdAt,
    }),
  );
});

export default router;