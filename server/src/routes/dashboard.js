import { Router } from "express";
import { listSubjects } from "../store.js";

export const dashboardRouter = Router();

dashboardRouter.get("/", async (req, res, next) => {
  try {
    const subjects = await listSubjects(req.app.locals.dbConnected);
    res.json({ subjects });
  } catch (error) {
    next(error);
  }
});
