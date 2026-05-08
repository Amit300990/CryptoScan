import { Router, type IRouter } from "express";
import healthRouter from "./health";
import environmentsRouter from "./environments";
import connectionsRouter from "./connections";
import scanJobsRouter from "./scanJobs";
import assetsRouter from "./assets";
import policiesRouter from "./policies";
import findingsRouter from "./findings";
import dashboardRouter from "./dashboard";
import logsRouter from "./logs";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(environmentsRouter);
router.use(connectionsRouter);
router.use(scanJobsRouter);
router.use(assetsRouter);
router.use(policiesRouter);
router.use(findingsRouter);
router.use(dashboardRouter);
router.use(logsRouter);
router.use(settingsRouter);

export default router;
