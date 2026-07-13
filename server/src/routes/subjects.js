import { Router } from "express";
import { z } from "zod";
import { createSubject, updateCourse } from "../store.js";

const subjectSchema = z.object({
  name: z.string().trim().min(1).max(100),
  exam: z.string().trim().min(1).max(100),
  courseName: z.string().trim().min(1).max(150),
  totalVideos: z.coerce.number().int().min(0).max(10000),
  dailySpeed: z.coerce.number().min(0).max(1000),
});

const courseSchema = z.object({
  totalVideos: z.coerce.number().int().min(0),
  completedVideos: z.coerce.number().int().min(0),
  dailySpeed: z.coerce.number().min(0),
  startedAt: z.string().optional(),
});

export const subjectsRouter = Router();

subjectsRouter.post("/", async (req, res, next) => {
  try {
    const payload = subjectSchema.parse(req.body);
    const subject = await createSubject(req.app.locals.dbConnected, payload);

    if (!subject) {
      return res.status(409).json({ message: "A subject with this name already exists." });
    }

    return res.status(201).json({ subject });
  } catch (error) {
    return next(error);
  }
});

subjectsRouter.patch("/:subjectId/course", async (req, res, next) => {
  try {
    const payload = courseSchema.parse(req.body);
    const subject = await updateCourse(
      req.app.locals.dbConnected,
      req.params.subjectId,
      payload,
    );

    if (!subject) {
      return res.status(404).json({ message: "Subject not found." });
    }

    return res.json({ subject });
  } catch (error) {
    return next(error);
  }
});
