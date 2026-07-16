import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import {
  addChapterNote,
  appendQuestionsToChapter,
  createChapter,
  deleteChapterNote,
  softDeleteChapter,
} from "../store.js";

const uploadDir = path.resolve(process.cwd(), "server/uploads");

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (_req, file, callback) => {
    const safeName = file.originalname
      .toLowerCase()
      .replace(/[^a-z0-9.]+/g, "-")
      .replace(/^-+|-+$/g, "");
    callback(null, `${Date.now()}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

const chapterSchema = z.object({
  subjectId: z.string().min(1),
  subjectName: z.string().min(1),
  chapterName: z.string().min(1),
  totalQuestions: z.coerce.number().int().min(1).max(5000),
  totalVideos: z.coerce.number().int().min(0).optional(),
  dailySpeed: z.coerce.number().min(0).optional(),
  exam: z.string().optional(),
  rawText: z.string().optional(),
});

const appendQuestionsSchema = z
  .object({
    questions: z.array(z.string().min(1)).optional(),
    rawText: z.string().optional(),
  })
  .refine((value) => value.questions?.length || value.rawText?.trim(), {
    message: "Add at least one question.",
  });

const chapterNoteSchema = z.object({
  id: z.string().min(1).optional(),
  text: z.string().trim().min(1).max(500),
});

export const chaptersRouter = Router();

function parseQuestionLines(rawText = "") {
  return rawText
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:Q\.?\s*)?\d+[\).:-]?\s*/i, "").trim())
    .filter(Boolean);
}

chaptersRouter.post("/", upload.single("sourceFile"), async (req, res, next) => {
  try {
    const body = chapterSchema.parse(req.body);
    const sourcePdfUrl = req.file
      ? `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`
      : undefined;

    const result = await createChapter(req.app.locals.dbConnected, {
      ...body,
      questions: parseQuestionLines(body.rawText),
      sourcePdfName: req.file?.originalname,
      sourcePdfUrl,
    });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

chaptersRouter.post("/:chapterId/questions", async (req, res, next) => {
  try {
    const body = appendQuestionsSchema.parse(req.body);
    const prompts =
      body.questions ??
      parseQuestionLines(body.rawText) ??
      [];

    const result = await appendQuestionsToChapter(
      req.app.locals.dbConnected,
      req.params.chapterId,
      prompts,
    );

    if (!result) {
      return res.status(404).json({ message: "Chapter not found." });
    }

    return res.status(201).json(result);
  } catch (error) {
    return next(error);
  }
});

chaptersRouter.post("/:chapterId/notes", async (req, res, next) => {
  try {
    const payload = chapterNoteSchema.parse(req.body);
    const note = await addChapterNote(
      req.app.locals.dbConnected,
      req.params.chapterId,
      payload,
    );
    if (!note) return res.status(404).json({ message: "Chapter not found." });
    return res.status(201).json({ note });
  } catch (error) {
    return next(error);
  }
});

chaptersRouter.delete("/:chapterId/notes/:noteId", async (req, res, next) => {
  try {
    const result = await deleteChapterNote(
      req.app.locals.dbConnected,
      req.params.chapterId,
      req.params.noteId,
    );
    if (!result) return res.status(404).json({ message: "Note not found." });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

chaptersRouter.delete("/:chapterId", async (req, res, next) => {
  try {
    const result = await softDeleteChapter(
      req.app.locals.dbConnected,
      req.params.chapterId,
    );

    if (!result) {
      return res.status(404).json({ message: "Chapter not found." });
    }

    return res.json(result);
  } catch (error) {
    return next(error);
  }
});
