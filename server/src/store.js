import { SubjectModel } from "./models/Subject.js";
import {
  createAttemptLogs,
  createDefaultSubjects,
  createQuestions,
  slugify,
} from "./lib/defaultData.js";

let memorySubjects = createDefaultSubjects();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export async function ensureSeedData(dbConnected) {
  if (!dbConnected) return;

  const count = await SubjectModel.countDocuments();
  if (count > 0) return;

  await SubjectModel.insertMany(createDefaultSubjects());
}

export async function listSubjects(dbConnected) {
  if (!dbConnected) return clone(memorySubjects);

  const subjects = await SubjectModel.find().sort({ createdAt: 1 }).lean();
  return subjects.map((subject) => {
    const plainSubject = { ...subject };
    plainSubject.chapters = (plainSubject.chapters ?? []).filter(
      (chapter) => !chapter.deletedAt,
    );
    delete plainSubject._id;
    delete plainSubject.__v;
    return plainSubject;
  });
}

export async function createSubject(dbConnected, payload) {
  const id = payload.id || slugify(payload.name);
  const subject = {
    id,
    name: payload.name,
    subtitle: payload.subtitle || `${payload.exam || "SSC CGL"} ${payload.name}`,
    exam: payload.exam || "SSC CGL",
    courseName: payload.courseName || payload.name,
    course: {
      totalVideos: Number(payload.totalVideos || 0),
      completedVideos: 0,
      dailySpeed: Number(payload.dailySpeed || 1),
      startedAt: new Date().toISOString().slice(0, 10),
    },
    chapters: [],
  };

  if (!dbConnected) {
    if (memorySubjects.some((item) => item.id === id)) return null;
    memorySubjects.push(subject);
    return clone(subject);
  }

  const existing = await SubjectModel.exists({ id });
  if (existing) return null;
  return SubjectModel.create(subject).then((document) => document.toObject());
}

export async function createChapter(dbConnected, payload) {
  const subjectId = payload.subjectId || slugify(payload.subjectName);
  const chapterId = `${slugify(payload.chapterName)}-${Date.now()}`;
  const prompts = (payload.questions ?? [])
    .map((prompt) => String(prompt).trim())
    .filter(Boolean);
  const totalQuestions = prompts.length || Number(payload.totalQuestions || 0);
  const chapter = {
    id: chapterId,
    name: payload.chapterName,
    totalQuestions,
    sourcePdfName: payload.sourcePdfName,
    sourcePdfUrl: payload.sourcePdfUrl,
    questions: prompts.length
      ? prompts.map((prompt, index) => ({
          id: `${chapterId}-q-${index + 1}`,
          number: index + 1,
          prompt,
          attempts: createAttemptLogs(),
        }))
      : createQuestions(totalQuestions, payload.chapterName, chapterId),
  };

  if (!dbConnected) {
    let subject = memorySubjects.find((item) => item.id === subjectId);
    if (!subject) {
      subject = {
        id: subjectId,
        name: payload.subjectName,
        subtitle: payload.subjectName,
        exam: payload.exam || "SSC CGL",
        courseName: payload.subjectName,
        course: {
          totalVideos: Number(payload.totalVideos || 0),
          completedVideos: 0,
          dailySpeed: Number(payload.dailySpeed || 1),
          startedAt: new Date().toISOString().slice(0, 10),
        },
        chapters: [],
      };
      memorySubjects.push(subject);
    }

    subject.chapters.push(chapter);
    return clone({ subject, chapter });
  }

  const subject = await SubjectModel.findOneAndUpdate(
    { id: subjectId },
    {
      $setOnInsert: {
        id: subjectId,
        name: payload.subjectName,
        subtitle: payload.subjectName,
        exam: payload.exam || "SSC CGL",
        courseName: payload.subjectName,
        course: {
          totalVideos: Number(payload.totalVideos || 0),
          completedVideos: 0,
          dailySpeed: Number(payload.dailySpeed || 1),
          startedAt: new Date().toISOString().slice(0, 10),
        },
      },
      $push: { chapters: chapter },
    },
    { new: true, upsert: true },
  ).lean();

  return { subject, chapter };
}

export async function softDeleteChapter(dbConnected, chapterId) {
  const deletedAt = new Date().toISOString();

  if (!dbConnected) {
    for (const subject of memorySubjects) {
      const chapter = subject.chapters.find(
        (item) => item.id === chapterId && !item.deletedAt,
      );
      if (!chapter) continue;
      chapter.deletedAt = deletedAt;
      return clone({ chapterId, deletedAt });
    }
    return null;
  }

  const result = await SubjectModel.findOneAndUpdate(
    { chapters: { $elemMatch: { id: chapterId, deletedAt: null } } },
    { $set: { "chapters.$.deletedAt": deletedAt } },
    { new: true },
  ).lean();

  return result ? { chapterId, deletedAt } : null;
}

function buildAppendedQuestions(chapter, prompts) {
  const maxNumber = chapter.questions.reduce(
    (currentMax, question) => Math.max(currentMax, Number(question.number || 0)),
    0,
  );

  return prompts.map((prompt, index) => {
    const number = maxNumber + index + 1;
    return {
      id: `${chapter.id}-q-${number}`,
      number,
      prompt,
      attempts: createAttemptLogs(),
    };
  });
}

export async function appendQuestionsToChapter(dbConnected, chapterId, prompts) {
  const cleanPrompts = prompts
    .map((prompt) => String(prompt).trim())
    .filter(Boolean);

  if (!cleanPrompts.length) return null;

  if (!dbConnected) {
    for (const subject of memorySubjects) {
      const chapter = subject.chapters.find((item) => item.id === chapterId);
      if (!chapter) continue;

      const questions = buildAppendedQuestions(chapter, cleanPrompts);
      chapter.questions.push(...questions);
      chapter.totalQuestions = chapter.questions.length;
      return clone({ chapter, questions });
    }
    return null;
  }

  const subject = await SubjectModel.findOne({ "chapters.id": chapterId });
  if (!subject) return null;

  const chapter = subject.chapters.find((item) => item.id === chapterId);
  if (!chapter) return null;

  const questions = buildAppendedQuestions(chapter, cleanPrompts);
  chapter.questions.push(...questions);
  chapter.totalQuestions = chapter.questions.length;
  await subject.save();

  return {
    chapter: chapter.toObject ? chapter.toObject() : chapter,
    questions: questions.map((question) => ({ ...question })),
  };
}

export async function updateAttempt(dbConnected, questionId, attemptNumber, payload) {
  const nextAttempt = {
    attemptNumber,
    status: payload.status,
    reason: payload.reason || "",
    learning: payload.learning || "",
    solvedIndependently: Boolean(payload.solvedIndependently),
    attemptedAt:
      payload.status === "not_attempted"
        ? undefined
        : payload.attemptedAt || new Date().toISOString(),
  };

  if (!dbConnected) {
    for (const subject of memorySubjects) {
      for (const chapter of subject.chapters) {
        const question = chapter.questions.find((item) => item.id === questionId);
        if (!question) continue;

        question.attempts = question.attempts.map((attempt) =>
          attempt.attemptNumber === attemptNumber ? nextAttempt : attempt,
        );
        return clone(question);
      }
    }
    return null;
  }

  const subject = await SubjectModel.findOne({ "chapters.questions.id": questionId });
  if (!subject) return null;

  let updatedQuestion = null;
  for (const chapter of subject.chapters) {
    const question = chapter.questions.find((item) => item.id === questionId);
    if (!question) continue;

    question.attempts = question.attempts.map((attempt) =>
      attempt.attemptNumber === attemptNumber ? nextAttempt : attempt,
    );
    updatedQuestion = question;
    break;
  }

  if (!updatedQuestion) return null;
  await subject.save();
  return updatedQuestion.toObject ? updatedQuestion.toObject() : updatedQuestion;
}

export async function updateCourse(dbConnected, subjectId, payload) {
  const course = {
    totalVideos: Number(payload.totalVideos || 0),
    completedVideos: Number(payload.completedVideos || 0),
    dailySpeed: Number(payload.dailySpeed || 0),
    startedAt: payload.startedAt || new Date().toISOString().slice(0, 10),
  };

  if (!dbConnected) {
    const subject = memorySubjects.find((item) => item.id === subjectId);
    if (!subject) return null;
    subject.course = course;
    return clone(subject);
  }

  return SubjectModel.findOneAndUpdate(
    { id: subjectId },
    { $set: { course } },
    { new: true },
  ).lean();
}
