import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  CreateFarmBody,
  CreateFarmResponse,
  DeleteFarmParams,
  GetFarmParams,
  GetFarmResponse,
  ListFarmsResponse,
  UpdateFarmBody,
  UpdateFarmParams,
  UpdateFarmResponse,
} from "@workspace/api-zod";
import { farmsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { withUserContext } from "../lib/userDb";

const router: IRouter = Router();
router.use(requireAuth);

function farmResponse(farm: typeof farmsTable.$inferSelect) {
  return {
    ...farm,
    soilPh: farm.soilPh ?? null,
    farmSizeAcres: farm.farmSizeAcres ?? null,
    primaryCrops: farm.primaryCrops ?? [],
    state: farm.state ?? null,
    district: farm.district ?? null,
    soilType: farm.soilType ?? null,
    organicMatter: farm.organicMatter ?? null,
    irrigationMethod: farm.irrigationMethod ?? null,
    notes: farm.notes ?? null,
  };
}

router.get("/farms", async (req, res): Promise<void> => {
  const farms = await withUserContext(req.userId!, (tx) =>
    tx
      .select()
      .from(farmsTable)
      .where(eq(farmsTable.userId, req.userId!))
      .orderBy(desc(farmsTable.updatedAt)),
  );
  res.json(ListFarmsResponse.parse(farms.map(farmResponse)));
});

router.post("/farms", async (req, res): Promise<void> => {
  const parsed = CreateFarmBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Check the farm details and try again." });
    return;
  }
  const [farm] = await withUserContext(req.userId!, (tx) =>
    tx
      .insert(farmsTable)
      .values({
        userId: req.userId!,
        ...parsed.data,
        name: parsed.data.name.trim(),
        primaryCrops: parsed.data.primaryCrops ?? [],
      })
      .returning(),
  );
  res.status(201).json(CreateFarmResponse.parse(farmResponse(farm)));
});

router.get("/farms/:id", async (req, res): Promise<void> => {
  const params = GetFarmParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid farm identifier." });
    return;
  }
  const [farm] = await withUserContext(req.userId!, (tx) =>
    tx
      .select()
      .from(farmsTable)
      .where(and(eq(farmsTable.id, params.data.id), eq(farmsTable.userId, req.userId!)))
      .limit(1),
  );
  if (!farm) {
    res.status(404).json({ error: "Farm not found." });
    return;
  }
  res.json(GetFarmResponse.parse(farmResponse(farm)));
});

router.patch("/farms/:id", async (req, res): Promise<void> => {
  const params = UpdateFarmParams.safeParse(req.params);
  const parsed = UpdateFarmBody.safeParse(req.body);
  if (!params.success || !parsed.success || Object.keys(parsed.data ?? {}).length === 0) {
    res.status(400).json({ error: "Check the farm details and try again." });
    return;
  }
  const [farm] = await withUserContext(req.userId!, (tx) =>
    tx
      .update(farmsTable)
      .set({
        ...parsed.data,
        ...(typeof parsed.data.name === "string" && { name: parsed.data.name.trim() }),
      })
      .where(and(eq(farmsTable.id, params.data.id), eq(farmsTable.userId, req.userId!)))
      .returning(),
  );
  if (!farm) {
    res.status(404).json({ error: "Farm not found." });
    return;
  }
  res.json(UpdateFarmResponse.parse(farmResponse(farm)));
});

router.delete("/farms/:id", async (req, res): Promise<void> => {
  const params = DeleteFarmParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid farm identifier." });
    return;
  }
  const deleted = await withUserContext(req.userId!, (tx) =>
    tx
      .delete(farmsTable)
      .where(and(eq(farmsTable.id, params.data.id), eq(farmsTable.userId, req.userId!)))
      .returning({ id: farmsTable.id }),
  );
  if (deleted.length === 0) {
    res.status(404).json({ error: "Farm not found." });
    return;
  }
  res.status(204).end();
});

export default router;