import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import profileRouter from "./profile";
import farmsRouter from "./farms";
import diagnosesRouter from "./diagnoses";
import adviceRouter from "./advice";
import chatRouter from "./chat";
import activityRouter from "./activity";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(profileRouter);
router.use(farmsRouter);
router.use(diagnosesRouter);
router.use(adviceRouter);
router.use(chatRouter);
router.use(activityRouter);

export default router;
