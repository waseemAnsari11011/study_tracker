import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { deleteAttemptImage, uploadAttemptImage } from "../lib/cloudinary.js";
import { findAttempt, updateAttempt } from "../store.js";

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    callback(
      allowedImageTypes.has(file.mimetype)
        ? null
        : new Error("Only JPEG, PNG, and WebP images are allowed."),
      allowedImageTypes.has(file.mimetype),
    );
  },
});

const attachmentSchema = z.object({
  id: z.string(),
  publicId: z.string(),
  url: z.string().url(),
  filename: z.string(),
  mimeType: z.string(),
  size: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
  caption: z.string().max(4000).optional(),
  createdAt: z.string(),
});

const editorDocumentSchema = z.object({
  type: z.literal("doc"),
  content: z.array(z.unknown()).max(500),
});

const attemptSchema = z.object({
  status: z.enum(["not_attempted", "solved", "struggled", "unsolved"]),
  reason: z.string().optional(),
  learning: z.string().optional(),
  solvedIndependently: z.boolean().optional(),
  attemptedAt: z.string().optional(),
  blockedImages: z.array(attachmentSchema).optional(),
  learningImages: z.array(attachmentSchema).optional(),
  blockedContent: editorDocumentSchema.optional(),
  learningContent: editorDocumentSchema.optional(),
});

function replacePendingImages(node, uploadedByPendingId) {
  if (!node || typeof node !== "object") return node;
  const nextNode = { ...node };
  if (nextNode.type === "image" && nextNode.attrs?.pendingId) {
    const attachment = uploadedByPendingId.get(nextNode.attrs.pendingId);
    if (!attachment) throw new Error("An editor image was missing from the upload.");
    nextNode.attrs = {
      ...nextNode.attrs,
      src: attachment.url,
      attachmentId: attachment.id,
      publicId: attachment.publicId,
      pendingId: null,
    };
  }
  if (Array.isArray(nextNode.content)) {
    nextNode.content = nextNode.content.map((child) =>
      replacePendingImages(child, uploadedByPendingId),
    );
  }
  return nextNode;
}

function collectAttachmentIds(node, ids = new Set()) {
  if (!node || typeof node !== "object") return ids;
  if (node.type === "image" && node.attrs?.attachmentId) {
    ids.add(node.attrs.attachmentId);
  }
  if (Array.isArray(node.content)) {
    node.content.forEach((child) => collectAttachmentIds(child, ids));
  }
  return ids;
}

export const questionsRouter = Router();

questionsRouter.patch("/:questionId/attempts/:attemptNumber", async (req, res, next) => {
  try {
    const attemptNumber = Number(req.params.attemptNumber);
    if (![1, 2, 3].includes(attemptNumber)) {
      return res.status(400).json({ message: "Attempt number must be 1, 2, or 3." });
    }

    const payload = attemptSchema.parse(req.body);
    const previousAttempt = await findAttempt(
      req.app.locals.dbConnected,
      req.params.questionId,
      attemptNumber,
    );
    const question = await updateAttempt(
      req.app.locals.dbConnected,
      req.params.questionId,
      attemptNumber,
      {
        ...payload,
        blockedImages: payload.blockedImages ?? previousAttempt?.blockedImages ?? [],
        learningImages: payload.learningImages ?? previousAttempt?.learningImages ?? [],
        blockedContent: payload.blockedContent ?? previousAttempt?.blockedContent,
        learningContent: payload.learningContent ?? previousAttempt?.learningContent,
      },
    );

    if (!question) {
      return res.status(404).json({ message: "Question not found." });
    }

    return res.json({ question });
  } catch (error) {
    return next(error);
  }
});

questionsRouter.patch(
  "/:questionId/attempts/:attemptNumber/with-images",
  upload.any(),
  async (req, res, next) => {
    const uploaded = [];
    try {
      const attemptNumber = Number(req.params.attemptNumber);
      if (![1, 2, 3].includes(attemptNumber)) {
        return res.status(400).json({ message: "Attempt number must be 1, 2, or 3." });
      }

      const previousAttempt = await findAttempt(
        req.app.locals.dbConnected,
        req.params.questionId,
        attemptNumber,
      );
      if (!previousAttempt) {
        return res.status(404).json({ message: "Question not found." });
      }

      const requestedBlocked = attachmentSchema.array().parse(
        JSON.parse(req.body.existingBlockedImages || "[]"),
      );
      const requestedLearning = attachmentSchema.array().parse(
        JSON.parse(req.body.existingLearningImages || "[]"),
      );
      const blockedById = new Map(requestedBlocked.map((image) => [image.id, image]));
      const learningById = new Map(requestedLearning.map((image) => [image.id, image]));
      const existingBlocked = (previousAttempt.blockedImages || [])
        .filter((image) => blockedById.has(image.id))
        .map((image) => ({
          ...image,
          caption: blockedById.get(image.id)?.caption || "",
        }));
      const existingLearning = (previousAttempt.learningImages || [])
        .filter((image) => learningById.has(image.id))
        .map((image) => ({
          ...image,
          caption: learningById.get(image.id)?.caption || "",
        }));
      const receivedFiles = Array.isArray(req.files) ? req.files : [];
      const unexpectedFile = receivedFiles.find(
        (file) => !["blockedImages", "learningImages"].includes(file.fieldname),
      );
      if (unexpectedFile) {
        return res.status(400).json({
          message: `Unexpected image field: ${unexpectedFile.fieldname}.`,
        });
      }
      const files = {
        blockedImages: receivedFiles.filter(
          (file) => file.fieldname === "blockedImages",
        ),
        learningImages: receivedFiles.filter(
          (file) => file.fieldname === "learningImages",
        ),
      };
      const blockedUploads = [];
      for (const file of files.blockedImages || []) {
        const image = await uploadAttemptImage(file, req.params.questionId);
        blockedUploads.push(image);
        uploaded.push(image);
      }
      const learningUploads = [];
      for (const file of files.learningImages || []) {
        const image = await uploadAttemptImage(file, req.params.questionId);
        learningUploads.push(image);
        uploaded.push(image);
      }
      const blockedCaptions = z.string().array().parse(
        JSON.parse(req.body.pendingBlockedCaptions || "[]"),
      );
      const learningCaptions = z.string().array().parse(
        JSON.parse(req.body.pendingLearningCaptions || "[]"),
      );
      blockedUploads.forEach((image, index) => {
        image.caption = blockedCaptions[index] || "";
      });
      learningUploads.forEach((image, index) => {
        image.caption = learningCaptions[index] || "";
      });

      const blockedPendingIds = z.string().array().parse(
        JSON.parse(req.body.blockedPendingIds || "[]"),
      );
      const learningPendingIds = z.string().array().parse(
        JSON.parse(req.body.learningPendingIds || "[]"),
      );
      const uploadedByPendingId = new Map();
      blockedUploads.forEach((image, index) =>
        uploadedByPendingId.set(blockedPendingIds[index], image),
      );
      learningUploads.forEach((image, index) =>
        uploadedByPendingId.set(learningPendingIds[index], image),
      );
      const blockedContent = replacePendingImages(
        editorDocumentSchema.parse(JSON.parse(req.body.blockedContent)),
        uploadedByPendingId,
      );
      const learningContent = replacePendingImages(
        editorDocumentSchema.parse(JSON.parse(req.body.learningContent)),
        uploadedByPendingId,
      );
      const retainedBlockedIds = collectAttachmentIds(blockedContent);
      const retainedLearningIds = collectAttachmentIds(learningContent);
      const retainedExistingBlocked = existingBlocked.filter((image) =>
        retainedBlockedIds.has(image.id),
      );
      const retainedExistingLearning = existingLearning.filter((image) =>
        retainedLearningIds.has(image.id),
      );

      const payload = attemptSchema.parse({
        status: req.body.status,
        reason: req.body.reason,
        learning: req.body.learning,
        solvedIndependently: req.body.solvedIndependently === "true",
        attemptedAt: req.body.attemptedAt || undefined,
        blockedImages: [...retainedExistingBlocked, ...blockedUploads],
        learningImages: [...retainedExistingLearning, ...learningUploads],
        blockedContent,
        learningContent,
      });
      const question = await updateAttempt(
        req.app.locals.dbConnected,
        req.params.questionId,
        attemptNumber,
        payload,
      );
      if (!question) throw new Error("Question not found while saving the attempt.");

      const retainedIds = new Set(
        [...payload.blockedImages, ...payload.learningImages].map((image) => image.id),
      );
      const removed = [
        ...(previousAttempt.blockedImages || []),
        ...(previousAttempt.learningImages || []),
      ].filter((image) => !retainedIds.has(image.id));
      await Promise.allSettled(removed.map((image) => deleteAttemptImage(image.publicId)));
      return res.json({ question });
    } catch (error) {
      await Promise.allSettled(uploaded.map((image) => deleteAttemptImage(image.publicId)));
      return next(error);
    }
  },
);
