import mongoose from "mongoose";

const attemptAttachmentSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    publicId: { type: String, required: true },
    url: { type: String, required: true },
    filename: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    width: { type: Number },
    height: { type: Number },
    caption: { type: String, default: "" },
    createdAt: { type: String, required: true },
  },
  { _id: false },
);

const attemptSchema = new mongoose.Schema(
  {
    attemptNumber: { type: Number, required: true, min: 1, max: 3 },
    status: {
      type: String,
      enum: ["not_attempted", "solved", "struggled", "unsolved"],
      default: "not_attempted",
    },
    reason: { type: String, default: "" },
    learning: { type: String, default: "" },
    solvedIndependently: { type: Boolean, default: false },
    attemptedAt: { type: String },
    blockedImages: { type: [attemptAttachmentSchema], default: [] },
    learningImages: { type: [attemptAttachmentSchema], default: [] },
    blockedContent: { type: mongoose.Schema.Types.Mixed },
    learningContent: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false },
);

const questionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    number: { type: Number, required: true },
    prompt: { type: String, required: true },
    attempts: { type: [attemptSchema], default: [] },
  },
  { _id: false },
);

const chapterNoteSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    text: { type: String, required: true },
    createdAt: { type: String, required: true },
  },
  { _id: false },
);

const chapterSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    totalQuestions: { type: Number, required: true, min: 0 },
    sourcePdfName: { type: String },
    sourcePdfUrl: { type: String },
    deletedAt: { type: String, default: null },
    notes: { type: [chapterNoteSchema], default: [] },
    questions: { type: [questionSchema], default: [] },
  },
  { _id: false },
);

const courseSchema = new mongoose.Schema(
  {
    totalVideos: { type: Number, default: 0, min: 0 },
    completedVideos: { type: Number, default: 0, min: 0 },
    dailySpeed: { type: Number, default: 1, min: 0 },
    startedAt: { type: String },
  },
  { _id: false },
);

const subjectSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    subtitle: { type: String, required: true },
    exam: { type: String, default: "SSC CGL" },
    courseName: { type: String, required: true },
    sortOrder: { type: Number, default: 0 },
    course: { type: courseSchema, default: () => ({}) },
    chapters: { type: [chapterSchema], default: [] },
  },
  { timestamps: true },
);

export const SubjectModel =
  mongoose.models.Subject || mongoose.model("Subject", subjectSchema);
