import { Router } from "express";
import { z } from "zod";
import { updateAttempt } from "../store.js";

const attemptSchema = z.object({
  status: z.enum(["not_attempted", "solved", "struggled", "unsolved"]),
  reason: z.string().optional(),
  learning: z.string().optional(),
  solvedIndependently: z.boolean().optional(),
  attemptedAt: z.string().optional(),
});

export const questionsRouter = Router();

questionsRouter.patch("/:questionId/attempts/:attemptNumber", async (req, res, next) => {
  try {
    const attemptNumber = Number(req.params.attemptNumber);
    if (![1, 2, 3].includes(attemptNumber)) {
      return res.status(400).json({ message: "Attempt number must be 1, 2, or 3." });
    }

    const payload = attemptSchema.parse(req.body);
    const question = await updateAttempt(
      req.app.locals.dbConnected,
      req.params.questionId,
      attemptNumber,
      payload,
    );

    if (!question) {
      return res.status(404).json({ message: "Question not found." });
    }

    return res.json({ question });
  } catch (error) {
    return next(error);
  }
});
