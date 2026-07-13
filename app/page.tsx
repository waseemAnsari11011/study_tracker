"use client";

import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  Edit3,
  FileText,
  Flame,
  GraduationCap,
  Minus,
  Moon,
  Pin,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Target,
  Trash2,
  TrendingUp,
  UploadCloud,
  Video,
  X,
  XCircle,
} from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AttemptLog,
  AttemptNumber,
  AttemptStatus,
  Chapter,
  CourseProgress,
  Question,
  Subject,
  attemptNumbers,
  createDefaultSubjects,
  createQuestions,
  slugify,
  statusLabels,
} from "./lib/study-data";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
const pageSize = 10;
const subjectOrderStorageKey = "studytrack-subject-order";

function orderSubjects(subjects: Subject[], preferredIds: string[]) {
  const positions = new Map(preferredIds.map((id, index) => [id, index]));
  return [...subjects].sort((left, right) => {
    const leftPosition = positions.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightPosition = positions.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    return leftPosition - rightPosition;
  });
}

function readSubjectOrder() {
  try {
    const value = JSON.parse(window.localStorage.getItem(subjectOrderStorageKey) ?? "[]");
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function saveSubjectOrder(subjects: Subject[]) {
  window.localStorage.setItem(
    subjectOrderStorageKey,
    JSON.stringify(subjects.map((subject) => subject.id)),
  );
}

type ChapterForm = {
  subjectId: string;
  chapterName: string;
  totalQuestions: string;
  questionText: string;
  sourceFile?: File;
};

type AddQuestionForm = {
  chapterId: string;
  rawText: string;
};

type SubjectForm = {
  name: string;
  exam: string;
  courseName: string;
  totalVideos: string;
  dailySpeed: string;
};

type DashboardView = "overview" | "review" | "performance";

type OutcomeDraft = {
  questionId: string;
  status: AttemptStatus;
  reasonCategory: string;
  blockedDetail: string;
  learning: string;
  attemptedAt: string;
};

const statusOptions: AttemptStatus[] = [
  "not_attempted",
  "solved",
  "struggled",
  "unsolved",
];

const modalStatusOptions: Array<{
  icon: React.ReactNode;
  label: string;
  status: AttemptStatus;
}> = [
  { icon: <CheckCircle2 size={24} />, label: "Solved", status: "solved" },
  {
    icon: <AlertCircle size={24} />,
    label: "Solved with difficulty",
    status: "struggled",
  },
  { icon: <XCircle size={24} />, label: "Couldn't solve", status: "unsolved" },
  { icon: <Clock size={24} />, label: "Clear attempt", status: "not_attempted" },
];

const struggleReasons = [
  "Concept gap",
  "Formula not remembered",
  "Calculation mistake",
  "Wrong approach",
  "Time pressure",
  "Language/wording confusion",
  "Other",
];

function getAttempt(question: Question, attemptNumber: AttemptNumber) {
  return (
    question.attempts.find((attempt) => attempt.attemptNumber === attemptNumber) ??
    question.attempts[0]
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function percent(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function formatDate(value?: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function toInputDate(value?: string) {
  if (!value) return new Date().toISOString().slice(0, 10);
  return new Date(value).toISOString().slice(0, 10);
}

function courseForecast(course: CourseProgress) {
  const remaining = Math.max(course.totalVideos - course.completedVideos, 0);
  const dailySpeed = Math.max(course.dailySpeed, 0);
  const daysLeft = dailySpeed > 0 ? Math.ceil(remaining / dailySpeed) : null;
  const finishDate =
    daysLeft === null
      ? null
      : new Date(Date.now() + daysLeft * 24 * 60 * 60 * 1000);

  return {
    remaining,
    daysLeft,
    finishDate,
    completion: percent(course.completedVideos, course.totalVideos),
  };
}

function chapterStats(chapter: Chapter | undefined, attemptNumber: AttemptNumber) {
  const questions = chapter?.questions ?? [];
  const total = chapter?.totalQuestions ?? 0;
  const attempted = questions.filter(
    (question) => getAttempt(question, attemptNumber).status !== "not_attempted",
  ).length;
  const mastered = questions.filter(
    (question) => getAttempt(question, attemptNumber).status === "solved",
  ).length;
  const review = questions.filter((question) =>
    ["struggled", "unsolved"].includes(getAttempt(question, attemptNumber).status),
  ).length;
  const accuracy = percent(mastered, attempted);

  return {
    total,
    attempted,
    mastered,
    review,
    accuracy,
  };
}

function masteryAcrossAllAttempts(chapters: Chapter[]) {
  const questions = chapters.flatMap((chapter) => chapter.questions);
  const mastered = questions.filter((question) =>
    question.attempts.some((attempt) => attempt.status === "solved"),
  ).length;
  const review = questions.filter((question) =>
    question.attempts.some((attempt) =>
      ["struggled", "unsolved"].includes(attempt.status),
    ),
  ).length;

  return {
    total: questions.length,
    mastered,
    review,
    percent: percent(mastered, questions.length),
  };
}

function buildTrend(chapter: Chapter | undefined) {
  return attemptNumbers.map((attemptNumber) => {
    const stats = chapterStats(chapter, attemptNumber);
    return {
      name: `Attempt ${attemptNumber}`,
      attemptNumber,
      mastery: percent(stats.mastered, stats.total),
      value: percent(stats.mastered, stats.total),
      attempted: stats.attempted,
      total: stats.total,
    };
  });
}

function buildConsistency(chapter: Chapter | undefined) {
  const labels = ["M", "T", "W", "T", "F", "S", "S"];
  const today = new Date();
  const dayIndex = (today.getDay() + 6) % 7;
  const monday = new Date(today);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(today.getDate() - dayIndex);

  const days = labels.map((label, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return {
      count: 0,
      date,
      day: label,
      key: date.toISOString().slice(0, 10),
    };
  });

  chapter?.questions.forEach((question) => {
    question.attempts.forEach((attempt) => {
      if (!attempt.attemptedAt || attempt.status === "not_attempted") return;
      const key = new Date(attempt.attemptedAt).toISOString().slice(0, 10);
      const day = days.find((item) => item.key === key);
      if (day) day.count += 1;
    });
  });

  const attemptedDates = new Set(
    (chapter?.questions ?? []).flatMap((question) =>
      question.attempts
        .filter((attempt) => attempt.attemptedAt && attempt.status !== "not_attempted")
        .map((attempt) => new Date(attempt.attemptedAt as string).toISOString().slice(0, 10)),
    ),
  );

  let streak = 0;
  const cursor = new Date(today);
  cursor.setHours(0, 0, 0, 0);
  while (attemptedDates.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return { days, streak };
}

function statusIcon(status: AttemptStatus) {
  if (status === "solved") return <CheckCircle2 size={16} />;
  if (status === "struggled") return <AlertTriangle size={16} />;
  if (status === "unsolved") return <XCircle size={16} />;
  return <Clock size={16} />;
}

export default function Home() {
  const [subjects, setSubjects] = useState<Subject[]>(() => createDefaultSubjects());
  const [activeSubjectId, setActiveSubjectId] = useState("mathematics");
  const [activeChapterId, setActiveChapterId] = useState("number-system");
  const [activeAttempt, setActiveAttempt] = useState<AttemptNumber>(1);
  const [activeView, setActiveView] = useState<DashboardView>("overview");
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<AttemptStatus | "all">("all");
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubjectModalOpen, setIsSubjectModalOpen] = useState(false);
  const [isQuestionModalOpen, setIsQuestionModalOpen] = useState(false);
  const [questionFileError, setQuestionFileError] = useState("");
  const [outcomeDraft, setOutcomeDraft] = useState<OutcomeDraft | null>(null);
  const [chapterForm, setChapterForm] = useState<ChapterForm>({
    subjectId: "mathematics",
    chapterName: "",
    totalQuestions: "",
    questionText: "",
  });
  const [addQuestionForm, setAddQuestionForm] = useState<AddQuestionForm>({
    chapterId: "number-system",
    rawText: "",
  });
  const [subjectForm, setSubjectForm] = useState<SubjectForm>({
    name: "",
    exam: "SSC CGL",
    courseName: "",
    totalVideos: "",
    dailySpeed: "1",
  });

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("studytrack-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const nextIsDark = storedTheme ? storedTheme === "dark" : prefersDark;
    window.setTimeout(() => setIsDarkMode(nextIsDark), 0);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = isDarkMode ? "dark" : "light";
  }, [isDarkMode]);

  function toggleTheme() {
    setIsDarkMode((current) => {
      const next = !current;
      document.documentElement.dataset.theme = next ? "dark" : "light";
      window.localStorage.setItem("studytrack-theme", next ? "dark" : "light");
      return next;
    });
  }

  useEffect(() => {
    let cancelled = false;
    const preferredSubjectOrder = readSubjectOrder();
    const restoreOrderTimer = window.setTimeout(
      () => setSubjects((current) => orderSubjects(current, preferredSubjectOrder)),
      0,
    );

    async function loadDashboard() {
      try {
        const response = await fetch(`${apiBase}/dashboard`);
        if (!response.ok) return;
        const data = (await response.json()) as { subjects: Subject[] };
        if (cancelled || !data.subjects?.length) return;

        const orderedSubjects = orderSubjects(data.subjects, preferredSubjectOrder);
        setSubjects(orderedSubjects);
        setActiveSubjectId((current) =>
          orderedSubjects.some((subject) => subject.id === current)
            ? current
            : orderedSubjects[0].id,
        );
        setActiveChapterId((current) => {
          const hasCurrent = orderedSubjects.some((subject) =>
            subject.chapters.some((chapter) => chapter.id === current),
          );
          return hasCurrent ? current : orderedSubjects[0].chapters[0]?.id ?? "";
        });
      } catch {
        // The UI remains fully usable with local seeded data when the API is off.
      }
    }

    loadDashboard();
    return () => {
      cancelled = true;
      window.clearTimeout(restoreOrderTimer);
    };
  }, []);

  const activeSubject = useMemo(
    () => subjects.find((subject) => subject.id === activeSubjectId) ?? subjects[0],
    [activeSubjectId, subjects],
  );

  const activeChapter = useMemo(() => {
    if (!activeSubject) return undefined;
    return (
      activeSubject.chapters.find((chapter) => chapter.id === activeChapterId) ??
      activeSubject.chapters[0]
    );
  }, [activeChapterId, activeSubject]);

  const stats = useMemo(
    () => chapterStats(activeChapter, activeAttempt),
    [activeAttempt, activeChapter],
  );

  const mastery = useMemo(
    () => masteryAcrossAllAttempts(activeSubject?.chapters ?? []),
    [activeSubject],
  );

  const trend = useMemo(() => buildTrend(activeChapter), [activeChapter]);
  const consistency = useMemo(() => buildConsistency(activeChapter), [activeChapter]);
  const forecast = useMemo(
    () =>
      activeSubject
        ? courseForecast(activeSubject.course)
        : { remaining: 0, daysLeft: null, finishDate: null, completion: 0 },
    [activeSubject],
  );

  const visibleQuestions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (activeChapter?.questions ?? []).filter((question) => {
      const attempt = getAttempt(question, activeAttempt);
      const matchesView =
        activeView !== "review" ||
        attempt.status === "struggled" ||
        attempt.status === "unsolved";
      const matchesSearch =
        !query ||
        `q.${String(question.number).padStart(3, "0")}`.includes(query) ||
        question.prompt.toLowerCase().includes(query) ||
        attempt.reason.toLowerCase().includes(query) ||
        attempt.learning.toLowerCase().includes(query);
      const matchesFilter = filter === "all" || attempt.status === filter;
      return matchesView && matchesSearch && matchesFilter;
    });
  }, [activeAttempt, activeChapter, activeView, filter, search]);

  const pageCount = Math.max(1, Math.ceil(visibleQuestions.length / pageSize));
  const safePage = clamp(currentPage, 1, pageCount);
  const paginatedQuestions = visibleQuestions.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );
  const showingStart = visibleQuestions.length ? (safePage - 1) * pageSize + 1 : 0;
  const showingEnd = Math.min(safePage * pageSize, visibleQuestions.length);
  const outcomeQuestion = useMemo(
    () =>
      outcomeDraft
        ? activeChapter?.questions.find((question) => question.id === outcomeDraft.questionId)
        : undefined,
    [activeChapter, outcomeDraft],
  );

  const reviewCount = stats.review;

  function updateAttemptLocal(
    questionId: string,
    updater: (attempt: AttemptLog) => AttemptLog,
  ) {
    let nextAttempt: AttemptLog | undefined;

    setSubjects((currentSubjects) =>
      currentSubjects.map((subject) => ({
        ...subject,
        chapters: subject.chapters.map((chapter) => ({
          ...chapter,
          questions: chapter.questions.map((question) => {
            if (question.id !== questionId) return question;

            return {
              ...question,
              attempts: question.attempts.map((attempt) => {
                if (attempt.attemptNumber !== activeAttempt) return attempt;
                nextAttempt = updater(attempt);
                return nextAttempt;
              }),
            };
          }),
        })),
      })),
    );

    return nextAttempt;
  }

  async function syncAttempt(questionId: string, attempt: AttemptLog) {
    try {
      await fetch(`${apiBase}/questions/${questionId}/attempts/${attempt.attemptNumber}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(attempt),
      });
    } catch {
      // Local edits stay visible even when the API is not running.
    }
  }

  function openOutcomeModal(question: Question) {
    const attempt = getAttempt(question, activeAttempt);
    const matchedReason = struggleReasons.includes(attempt.reason)
      ? attempt.reason
      : attempt.reason
        ? "Other"
        : "";

    setOutcomeDraft({
      questionId: question.id,
      status: attempt.status,
      reasonCategory: matchedReason,
      blockedDetail:
        matchedReason === "Other" || !matchedReason ? attempt.reason : "",
      learning: attempt.learning,
      attemptedAt: toInputDate(attempt.attemptedAt),
    });
  }

  function closeOutcomeModal() {
    setOutcomeDraft(null);
  }

  function saveOutcome() {
    if (!outcomeDraft) return;

    const reason =
      outcomeDraft.status === "not_attempted"
        ? ""
        : outcomeDraft.blockedDetail.trim() || outcomeDraft.reasonCategory;
    const learning =
      outcomeDraft.status === "not_attempted" ? "" : outcomeDraft.learning.trim();
    const nextAttempt = updateAttemptLocal(outcomeDraft.questionId, (attempt) => ({
      ...attempt,
      attemptedAt:
        outcomeDraft.status === "not_attempted"
          ? undefined
          : new Date(outcomeDraft.attemptedAt).toISOString(),
      learning,
      reason,
      solvedIndependently: outcomeDraft.status === "solved",
      status: outcomeDraft.status,
    }));

    if (nextAttempt) void syncAttempt(outcomeDraft.questionId, nextAttempt);
    setOutcomeDraft(null);
  }

  function updateCourse(field: keyof CourseProgress, value: number | string) {
    if (!activeSubject) return;
    let nextSubject: Subject | undefined;

    setSubjects((currentSubjects) =>
      currentSubjects.map((subject) => {
        if (subject.id !== activeSubject.id) return subject;

        const nextCourse = {
          ...subject.course,
          [field]: typeof value === "number" ? Math.max(value, 0) : value,
        };

        if (field === "completedVideos") {
          nextCourse.completedVideos = clamp(
            Number(nextCourse.completedVideos),
            0,
            Number(nextCourse.totalVideos),
          );
        }

        nextSubject = { ...subject, course: nextCourse };
        return nextSubject;
      }),
    );

    if (nextSubject) {
      void fetch(`${apiBase}/subjects/${nextSubject.id}/course`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextSubject.course),
      }).catch(() => undefined);
    }
  }

  function switchView(view: DashboardView) {
    setActiveView(view);
    setCurrentPage(1);
    if (view !== "review") {
      setFilter("all");
    }
  }

  function openAddModal(subjectId = activeSubject?.id ?? "mathematics") {
    setChapterForm({
      subjectId,
      chapterName: "",
      totalQuestions: "",
      questionText: "",
    });
    setQuestionFileError("");
    setIsModalOpen(true);
  }

  function openAddSubjectModal() {
    setSubjectForm({
      name: "",
      exam: "SSC CGL",
      courseName: "",
      totalVideos: "",
      dailySpeed: "1",
    });
    setIsSubjectModalOpen(true);
  }

  async function createSubjectFromForm() {
    const name = subjectForm.name.trim();
    const exam = subjectForm.exam.trim();
    const courseName = subjectForm.courseName.trim() || `${exam} ${name}`;
    const totalVideos = Number(subjectForm.totalVideos || 0);
    const dailySpeed = Number(subjectForm.dailySpeed || 0);
    if (!name || !exam || !Number.isFinite(totalVideos) || !Number.isFinite(dailySpeed)) {
      return;
    }

    const id = `${slugify(name)}-${Date.now()}`;
    const subject: Subject = {
      id,
      name,
      subtitle: `${exam} ${name}`,
      exam,
      courseName,
      course: {
        totalVideos,
        completedVideos: 0,
        dailySpeed,
        startedAt: new Date().toISOString().slice(0, 10),
      },
      chapters: [],
    };

    setSubjects((current) => [...current, subject]);
    setActiveSubjectId(id);
    setActiveChapterId("");
    setCurrentPage(1);
    setIsSubjectModalOpen(false);

    try {
      const response = await fetch(`${apiBase}/subjects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, exam, courseName, totalVideos, dailySpeed }),
      });
      if (!response.ok) return;
      const data = (await response.json()) as { subject: Subject };
      setSubjects((current) =>
        current.map((item) => (item.id === id ? data.subject : item)),
      );
      setActiveSubjectId(data.subject.id);
    } catch {
      // Keep the locally created subject usable while the API is offline.
    }
  }

  function extractJsonQuestions(value: unknown): string[] {
    const entries = Array.isArray(value)
      ? value
      : value && typeof value === "object" && "questions" in value
        ? (value as { questions?: unknown }).questions
        : [];

    if (!Array.isArray(entries)) return [];

    return entries
      .map((entry) => {
        if (typeof entry === "string") return entry.trim();
        if (!entry || typeof entry !== "object") return "";

        const record = entry as Record<string, unknown>;
        const prompt = record.prompt ?? record.question ?? record.text;
        return typeof prompt === "string" ? prompt.trim() : "";
      })
      .filter(Boolean);
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setQuestionFileError("");
    setChapterForm((current) => ({ ...current, sourceFile: file }));

    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension === "pdf") return;

    try {
      const fileText = await file.text();
      const prompts =
        extension === "json"
          ? extractJsonQuestions(JSON.parse(fileText) as unknown)
          : parseQuestionLines(fileText);

      if (prompts.length === 0) {
        setQuestionFileError(
          "No questions were found. JSON items should contain a prompt, question, or text field.",
        );
        return;
      }

      setChapterForm((current) => ({
        ...current,
        sourceFile: file,
        questionText: prompts.join("\n"),
        totalQuestions: String(prompts.length),
      }));
    } catch {
      setQuestionFileError("This question file could not be read. Check that it contains valid JSON or text.");
    }
  }

  function openAddQuestionModal(chapterId = activeChapter?.id ?? "") {
    setAddQuestionForm({
      chapterId,
      rawText: "",
    });
    setIsQuestionModalOpen(true);
  }

  function parseQuestionLines(rawText: string) {
    return rawText
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*(?:Q\.?\s*)?\d+[\).:-]?\s*/i, "").trim())
      .filter(Boolean);
  }

  async function createChapterFromForm() {
    const selectedSubject =
      subjects.find((subject) => subject.id === chapterForm.subjectId) ?? subjects[0];
    const pastedQuestions = parseQuestionLines(chapterForm.questionText);
    const totalQuestions = pastedQuestions.length || Number(chapterForm.totalQuestions);
    const chapterName = chapterForm.chapterName.trim();

    if (!selectedSubject || !chapterName || !Number.isFinite(totalQuestions)) return;

    const chapterId = `${slugify(chapterName)}-${Date.now()}`;
    const nextChapter: Chapter = {
      id: chapterId,
      name: chapterName,
      totalQuestions,
      sourcePdfName: chapterForm.sourceFile?.name,
      questions: pastedQuestions.length
        ? pastedQuestions.map((prompt, index) => ({
            id: `${chapterId}-q-${index + 1}`,
            number: index + 1,
            prompt,
            attempts: attemptNumbers.map((attemptNumber) => ({
              attemptNumber,
              status: "not_attempted",
              reason: "",
              learning: "",
              solvedIndependently: false,
            })),
          }))
        : createQuestions(totalQuestions, chapterName, chapterId),
    };

    setSubjects((currentSubjects) =>
      currentSubjects.map((subject) =>
        subject.id === selectedSubject.id
          ? { ...subject, chapters: [...subject.chapters, nextChapter] }
          : subject,
      ),
    );
    setActiveSubjectId(selectedSubject.id);
    setActiveChapterId(chapterId);
    setIsModalOpen(false);

    try {
      const formData = new FormData();
      formData.append("subjectId", selectedSubject.id);
      formData.append("subjectName", selectedSubject.name);
      formData.append("chapterName", chapterName);
      formData.append("totalQuestions", String(totalQuestions));
      if (chapterForm.questionText.trim()) {
        formData.append("rawText", chapterForm.questionText);
      }
      if (chapterForm.sourceFile) formData.append("sourceFile", chapterForm.sourceFile);

      await fetch(`${apiBase}/chapters`, {
        method: "POST",
        body: formData,
      });
    } catch {
      // The locally created chapter stays usable even without the API.
    }
  }

  async function deleteChapter(chapterId: string) {
    const chapter = activeSubject.chapters.find((item) => item.id === chapterId);
    if (!chapter) return;
    if (!window.confirm(`Delete \"${chapter.name}\"? You can restore it later from MongoDB.`)) {
      return;
    }

    const remainingChapters = activeSubject.chapters.filter(
      (item) => item.id !== chapterId,
    );
    setSubjects((currentSubjects) =>
      currentSubjects.map((subject) =>
        subject.id === activeSubject.id
          ? { ...subject, chapters: remainingChapters }
          : subject,
      ),
    );
    if (activeChapter?.id === chapterId) {
      setActiveChapterId(remainingChapters[0]?.id ?? "");
      setCurrentPage(1);
    }

    try {
      await fetch(`${apiBase}/chapters/${chapterId}`, { method: "DELETE" });
    } catch {
      // Keep the local soft-delete behavior available while the API is offline.
    }
  }

  async function addQuestionsToChapter() {
    const prompts = parseQuestionLines(addQuestionForm.rawText);
    if (!addQuestionForm.chapterId || prompts.length === 0) return;

    const targetChapter = subjects
      .flatMap((subject) => subject.chapters)
      .find((chapter) => chapter.id === addQuestionForm.chapterId);

    if (!targetChapter) return;

    const maxNumber = targetChapter.questions.reduce(
      (currentMax, question) => Math.max(currentMax, Number(question.number || 0)),
      0,
    );
    const newQuestions: Question[] = prompts.map((prompt, index) => {
      const number = maxNumber + index + 1;
      return {
        id: `${targetChapter.id}-q-${number}`,
        number,
        prompt,
        attempts: attemptNumbers.map((attemptNumber) => ({
          attemptNumber,
          status: "not_attempted",
          reason: "",
          learning: "",
          solvedIndependently: false,
        })),
      };
    });

    setSubjects((currentSubjects) =>
      currentSubjects.map((subject) => ({
        ...subject,
        chapters: subject.chapters.map((chapter) =>
          chapter.id === addQuestionForm.chapterId
            ? {
                ...chapter,
                questions: [...chapter.questions, ...newQuestions],
                totalQuestions: chapter.questions.length + newQuestions.length,
              }
            : chapter,
        ),
      })),
    );
    setActiveChapterId(addQuestionForm.chapterId);
    setCurrentPage(
      Math.max(1, Math.ceil((targetChapter.questions.length + newQuestions.length) / pageSize)),
    );
    setIsQuestionModalOpen(false);

    try {
      await fetch(`${apiBase}/chapters/${addQuestionForm.chapterId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: prompts }),
      });
    } catch {
      // The local update remains visible; the next API refresh will show persisted data.
    }
  }

  async function moveSubjectToTop(subjectId: string) {
    setSubjects((current) => {
      const selected = current.find((subject) => subject.id === subjectId);
      if (!selected) return current;
      const ordered = [selected, ...current.filter((subject) => subject.id !== subjectId)];
      saveSubjectOrder(ordered);
      return ordered;
    });

    try {
      const response = await fetch(`${apiBase}/subjects/${subjectId}/move-to-top`, {
        method: "PATCH",
      });
      if (!response.ok) return;
      const data = (await response.json()) as { subjects: Subject[] };
      const ordered = orderSubjects(data.subjects, readSubjectOrder());
      setSubjects(ordered);
      saveSubjectOrder(ordered);
    } catch {
      // Keep the chosen local order available while the API is offline.
    }
  }

  if (!activeSubject) {
    return null;
  }

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Study navigation">
        <div className="brand">
          <div className="brand-mark">S</div>
          <div>
            <div className="brand-title">StudyTrack</div>
            <div className="brand-subtitle">SSC CGL preparation</div>
          </div>
        </div>

        <nav className="nav-list" aria-label="Main navigation">
          <button
            className={`nav-item ${activeView === "overview" ? "active" : ""}`}
            type="button"
            onClick={() => switchView("overview")}
          >
            <BarChart3 size={21} />
            Overview
          </button>
          <button
            className={`nav-item ${activeView === "review" ? "active" : ""}`}
            type="button"
            onClick={() => switchView("review")}
          >
            <CalendarDays size={21} />
            Review queue
            <span className="badge">{reviewCount}</span>
          </button>
          <button
            className={`nav-item ${activeView === "performance" ? "active" : ""}`}
            type="button"
            onClick={() => switchView("performance")}
          >
            <Target size={21} />
            Performance
          </button>
        </nav>

        <section>
          <div className="section-heading">
            <span>Subjects</span>
            <button
              className="icon-button"
              type="button"
              aria-label="Add chapter"
              onClick={openAddSubjectModal}
            >
              <Plus size={18} />
            </button>
          </div>

          <div className="chapter-list" style={{ marginTop: 14 }}>
            {subjects.map((subject, index) => (
              <div
                className={`chapter-item subject-item-row ${subject.id === activeSubject.id ? "active" : ""}`}
                key={subject.id}
              >
                <button
                  className="subject-select"
                  type="button"
                  onClick={() => {
                    setActiveSubjectId(subject.id);
                    setActiveChapterId(subject.chapters[0]?.id ?? "");
                    setCurrentPage(1);
                  }}
                >
                  <span className="chapter-number">{subject.name.slice(0, 1)}</span>
                  <span className="chapter-meta">
                    <span className="chapter-title">{subject.name}</span>
                    <span className="tiny">
                      {subject.chapters.reduce(
                        (sum, chapter) => sum + chapter.totalQuestions,
                        0,
                      )}{" "}
                      questions
                    </span>
                  </span>
                </button>
                <button
                  className="subject-pin"
                  type="button"
                  aria-label={index === 0 ? `${subject.name} is already at top` : `Move ${subject.name} to top`}
                  title={index === 0 ? "Already at top" : "Move to top"}
                  disabled={index === 0}
                  onClick={() => moveSubjectToTop(subject.id)}
                >
                  <Pin size={16} />
                </button>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="section-heading">
            <span>Chapters</span>
            <button
              className="icon-button"
              type="button"
              aria-label="Add chapter"
              onClick={() => openAddModal(activeSubject.id)}
            >
              <Plus size={18} />
            </button>
          </div>
          <div className="chapter-list" style={{ marginTop: 14 }}>
            {activeSubject.chapters.length === 0 ? (
              <div className="empty-state">Add the first chapter for this subject.</div>
            ) : (
              activeSubject.chapters.map((chapter, index) => (
                <div
                  className={`chapter-item chapter-item-row ${
                    chapter.id === activeChapter?.id ? "active" : ""
                  }`}
                  key={chapter.id}
                >
                  <button
                    className="chapter-select"
                    type="button"
                    onClick={() => {
                      setActiveChapterId(chapter.id);
                      setCurrentPage(1);
                    }}
                  >
                    <span className="chapter-number">{index + 1}</span>
                    <span className="chapter-meta">
                      <span className="chapter-title">{chapter.name}</span>
                      <span className="tiny">{chapter.totalQuestions} questions</span>
                    </span>
                  </button>
                  <button
                    className="chapter-delete"
                    type="button"
                    aria-label={`Delete ${chapter.name}`}
                    title="Delete chapter"
                    onClick={() => deleteChapter(chapter.id)}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        <div className="sidebar-footer">
          <div className="mastery-card">
            <div className="mastery-top">
              <span className="muted">Overall mastery</span>
              <strong>{mastery.percent}%</strong>
            </div>
            <div className="progress-line" aria-hidden="true">
              <div
                className="progress-fill"
                style={{ width: `${mastery.percent}%` }}
              />
            </div>
            <div className="legend">
              <span className="mini-row">
                <span className="dot green" /> {mastery.mastered} mastered
              </span>
              <span className="mini-row">
                <span className="dot orange" /> {mastery.review} review
              </span>
            </div>
          </div>

          <button className="nav-item settings-link" type="button">
            <Settings size={21} />
            Settings
          </button>
        </div>
      </aside>

      <section className="main">
        <div className="topbar">
          <div className="breadcrumbs">
            <strong>{activeSubject.name}</strong>
            <span>/</span>
            <span>{activeChapter?.name ?? "No chapter yet"}</span>
          </div>

          <div className="top-actions">
            <a
              className="secondary-button"
              href={activeChapter?.sourcePdfUrl ?? "#"}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!activeChapter?.sourcePdfUrl}
            >
              <FileText size={19} />
              Open source PDF
            </a>
            <button
              className="icon-button"
              type="button"
              aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
              onClick={toggleTheme}
            >
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button
              className="primary-button"
              type="button"
              disabled={!activeChapter}
              onClick={() => openAddQuestionModal(activeChapter?.id)}
            >
              <Plus size={20} />
              Add question
            </button>
          </div>
        </div>

        <header className="hero-grid">
          <div>
            <p className="eyebrow">Attempt {activeAttempt} workspace</p>
            <h1>{activeChapter?.name ?? activeSubject.name}</h1>
            <p className="hero-copy">
              Track every attempt. Turn difficult questions into lasting strengths.
            </p>
          </div>

          <div className="attempt-tabs" role="tablist" aria-label="Attempt selector">
            {attemptNumbers.map((attemptNumber) => {
              const attemptStats = chapterStats(activeChapter, attemptNumber);
              return (
                <button
                  className={`attempt-tab ${
                    activeAttempt === attemptNumber ? "active" : ""
                  }`}
                  key={attemptNumber}
                  type="button"
                  onClick={() => setActiveAttempt(attemptNumber)}
                >
                  Attempt {attemptNumber}
                  <span>
                    {attemptStats.attempted}/{attemptStats.total}
                  </span>
                </button>
              );
            })}
          </div>
        </header>

        <section className="metric-grid" aria-label="Chapter metrics">
          <MetricCard
            color="purple"
            icon={<BookOpen size={26} />}
            label="Total questions"
            value={stats.total}
            detail={`${stats.attempted} attempted`}
          />
          <MetricCard
            color="green"
            icon={<Target size={26} />}
            label="Mastered"
            value={stats.mastered}
            detail={`${percent(stats.mastered, stats.total)}% of chapter`}
          />
          <MetricCard
            color="orange"
            icon={<AlertCircle size={26} />}
            label="Needs review"
            value={stats.review}
            detail={`${stats.review} in this attempt`}
          />
          <MetricCard
            color="cyan"
            icon={<Sparkles size={26} />}
            label="Accuracy"
            value={`${stats.accuracy}%`}
            detail={`${stats.mastered} solved independently`}
          />
        </section>

        <section className="content-grid">
          <div className="panel">
            <div className="panel-body">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Across attempts</p>
                  <h2 className="panel-title">Progress trend</h2>
                </div>
                <span className="status-pill status-solved">
                  <TrendingUp size={17} />
                  Build your trend
                </span>
              </div>

              <div className="chart chart-recharts" aria-label="Progress trend chart">
                <ResponsiveContainer height="100%" width="100%">
                  <LineChart data={trend} margin={{ bottom: 8, left: -18, right: 18, top: 16 }}>
                    <CartesianGrid stroke="#dfe5f2" strokeDasharray="6 8" vertical={false} />
                    <XAxis
                      axisLine={false}
                      dataKey="name"
                      tick={{ fill: "#9aa3b8", fontSize: 12 }}
                      tickLine={false}
                    />
                    <YAxis
                      axisLine={false}
                      domain={[0, 100]}
                      tick={{ fill: "#9aa3b8", fontSize: 12 }}
                      tickFormatter={(value) => `${value}%`}
                      tickLine={false}
                      ticks={[0, 25, 50, 75, 100]}
                    />
                    <Tooltip
                      contentStyle={{
                        border: "1px solid #e4e8f3",
                        borderRadius: 8,
                        boxShadow: "0 12px 28px rgba(29, 35, 80, 0.12)",
                      }}
                      formatter={(value, name) => [
                        name === "mastery" ? `${value}%` : value,
                        name === "mastery" ? "Mastery" : "Attempted",
                      ]}
                    />
                    <Line
                      activeDot={{ fill: "#5448f5", r: 7, stroke: "#ffffff", strokeWidth: 3 }}
                      dataKey="mastery"
                      dot={{ fill: "#5448f5", r: 5, stroke: "#ffffff", strokeWidth: 3 }}
                      stroke="#5448f5"
                      strokeLinecap="round"
                      strokeWidth={4}
                      type="monotone"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="panel streak-card">
            <div className="panel-body">
              <p className="eyebrow">
                <Flame size={20} style={{ verticalAlign: "middle" }} /> Consistency
              </p>
              <div className="streak-count">
                <strong>{consistency.streak}</strong>
                <span className="muted">day streak</span>
              </div>
              <h2 className="panel-title">Keep the chain alive</h2>
              <p className="muted">Complete one question today to begin your study streak.</p>
              <div className="consistency-chart" aria-label="Weekly consistency chart">
                <ResponsiveContainer height={110} width="100%">
                  <BarChart data={consistency.days} margin={{ bottom: 0, left: -28, right: 0, top: 12 }}>
                    <XAxis
                      axisLine={false}
                      dataKey="day"
                      tick={{ fill: "#9aa3b8", fontSize: 12 }}
                      tickLine={false}
                    />
                    <YAxis hide domain={[0, "dataMax + 1"]} />
                    <Tooltip
                      contentStyle={{
                        border: "1px solid #e4e8f3",
                        borderRadius: 8,
                        boxShadow: "0 12px 28px rgba(29, 35, 80, 0.12)",
                      }}
                      formatter={(value) => [`${value} questions`, "Completed"]}
                      labelFormatter={(_, payload) =>
                        payload?.[0]?.payload?.key ?? "Study day"
                      }
                    />
                    <Bar dataKey="count" radius={[8, 8, 8, 8]}>
                      {consistency.days.map((day) => (
                        <Cell
                          fill={day.count > 0 ? "#0f9f75" : "#f1f4fa"}
                          key={day.key}
                          stroke={day.count > 0 ? "#0f9f75" : "#dfe5f2"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </section>

        <section className="panel course-card" style={{ marginBottom: 22 }}>
          <div className="panel-body">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Subject completion</p>
                <h2 className="panel-title">{activeSubject.courseName} lecture tracker</h2>
              </div>
              <span className="status-pill status-solved">
                <GraduationCap size={17} />
                {forecast.completion}% complete
              </span>
            </div>

            <div className="course-grid" style={{ marginTop: 20 }}>
              <div>
                <div className="metric-card" style={{ minHeight: 0 }}>
                  <span className="metric-icon cyan">
                    <Video size={26} />
                  </span>
                  <div>
                    <div className="metric-label">Videos completed</div>
                    <div className="metric-value">
                      {activeSubject.course.completedVideos}/
                      {activeSubject.course.totalVideos}
                    </div>
                    <div className="muted">
                      {forecast.remaining} remaining at{" "}
                      {activeSubject.course.dailySpeed || 0} videos/day
                    </div>
                  </div>
                </div>

                <div className="course-controls">
                  <label className="course-stepper">
                    <button
                      aria-label="Decrease completed videos"
                      type="button"
                      onClick={() =>
                        updateCourse(
                          "completedVideos",
                          activeSubject.course.completedVideos - 1,
                        )
                      }
                    >
                      <Minus size={16} />
                    </button>
                    <input
                      aria-label="Completed videos"
                      min="0"
                      type="number"
                      value={activeSubject.course.completedVideos}
                      onChange={(event) =>
                        updateCourse("completedVideos", Number(event.target.value))
                      }
                    />
                    <button
                      aria-label="Increase completed videos"
                      type="button"
                      onClick={() =>
                        updateCourse(
                          "completedVideos",
                          activeSubject.course.completedVideos + 1,
                        )
                      }
                    >
                      <Plus size={16} />
                    </button>
                  </label>

                  <label className="course-stepper">
                    <span className="tiny" style={{ paddingLeft: 8 }}>
                      Speed/day
                    </span>
                    <input
                      aria-label="Daily video speed"
                      min="0"
                      step="0.5"
                      type="number"
                      value={activeSubject.course.dailySpeed}
                      onChange={(event) =>
                        updateCourse("dailySpeed", Number(event.target.value))
                      }
                    />
                  </label>
                </div>
              </div>

              <div className="forecast-list">
                <ForecastRow
                  label="Chapter/course days left"
                  value={
                    forecast.daysLeft === null
                      ? "Set speed"
                      : `${forecast.daysLeft} day${forecast.daysLeft === 1 ? "" : "s"}`
                  }
                />
                <ForecastRow
                  label="Completion date"
                  value={
                    forecast.finishDate
                      ? new Intl.DateTimeFormat("en", {
                          dateStyle: "medium",
                        }).format(forecast.finishDate)
                      : "Set speed"
                  }
                />
                <ForecastRow
                  label="Required pace for 30 days"
                  value={`${Math.ceil(forecast.remaining / 30)} videos/day`}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="panel question-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">
                {activeView === "review" ? "Review queue" : `Attempt ${activeAttempt}`}
              </p>
              <h2 className="panel-title">
                {activeView === "review" ? "Questions needing review" : "Question tracker"}
              </h2>
            </div>

            <div className="question-tools">
              <button
                className="secondary-button"
                type="button"
                disabled={!activeChapter}
                onClick={() => openAddQuestionModal(activeChapter?.id)}
              >
                <Plus size={18} />
                Add question
              </button>
              <label className="searchbox">
                <Search size={20} color="#7b8498" />
                <input
                  placeholder="Search Q number, note or keyword"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setCurrentPage(1);
                  }}
                />
              </label>
              <label className="filter">
                <SlidersHorizontal size={20} color="#7b8498" />
                <select
                  value={filter}
                  onChange={(event) => {
                    setFilter(event.target.value as AttemptStatus | "all");
                    setCurrentPage(1);
                  }}
                >
                  <option value="all">All statuses</option>
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {statusLabels[status]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {activeChapter ? (
            <>
              <div className="question-table-wrap">
                <table className="question-table">
                  <thead>
                    <tr>
                      <th>Question</th>
                      <th>Status</th>
                      <th>Why I struggled</th>
                      <th>Learning note</th>
                      <th>Last attempt</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedQuestions.map((question) => {
                      const attempt = getAttempt(question, activeAttempt);
                      return (
                        <tr key={question.id}>
                          <td>
                            <div className="question-cell">
                              <span className="question-id">
                                Q.{String(question.number).padStart(3, "0")}
                              </span>
                              <p className="question-text">{question.prompt}</p>
                            </div>
                          </td>
                          <td>
                            <button
                              className={`status-pill status-${attempt.status}`}
                              type="button"
                              onClick={() => openOutcomeModal(question)}
                            >
                              {statusIcon(attempt.status)}
                              {statusLabels[attempt.status]}
                            </button>
                          </td>
                          <td>
                            <button
                              className="table-note"
                              type="button"
                              onClick={() => openOutcomeModal(question)}
                            >
                              {attempt.reason || "Add reason"}
                            </button>
                          </td>
                          <td>
                            <button
                              className="table-note"
                              type="button"
                              onClick={() => openOutcomeModal(question)}
                            >
                              {attempt.learning || "Capture the learning"}
                            </button>
                          </td>
                          <td className="muted">{formatDate(attempt.attemptedAt)}</td>
                          <td>
                            <button
                              className="row-edit-button"
                              type="button"
                              aria-label={`Record attempt for question ${question.number}`}
                              onClick={() => openOutcomeModal(question)}
                            >
                              <Edit3 size={19} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              {visibleQuestions.length === 0 ? (
                <div className="empty-state">No questions match this filter.</div>
              ) : null}
              </div>

              <div className="pagination-bar">
                <span className="muted">
                  Showing {showingStart}-{showingEnd} of {visibleQuestions.length}
                </span>
                <div className="pagination-controls">
                  <button
                    className="icon-button"
                    type="button"
                    aria-label="Previous page"
                    disabled={safePage === 1}
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  >
                    <ChevronLeft size={21} />
                  </button>
                  <span className="muted">
                    Page {safePage} of {pageCount}
                  </span>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label="Next page"
                    disabled={safePage === pageCount}
                    onClick={() =>
                      setCurrentPage((page) => Math.min(pageCount, page + 1))
                    }
                  >
                    <ChevronRight size={21} />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="empty-state">
              This subject is ready. Create a chapter from the sidebar to begin.
            </div>
          )}
        </section>
      </section>

      {isSubjectModalOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal subject-modal">
            <div className="modal-header">
              <div>
                <p className="eyebrow">Build your study plan</p>
                <h2 className="modal-title">Create a subject</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Close subject modal"
                onClick={() => setIsSubjectModalOpen(false)}
              >
                <X size={22} />
              </button>
            </div>

            <div className="modal-body">
              <p className="muted" style={{ marginTop: 0 }}>
                Add the subject and its lecture target. You can create chapters and
                import questions after this.
              </p>

              <div className="form-grid">
                <label className="form-field">
                  Subject name
                  <input
                    autoFocus
                    placeholder="e.g. General Intelligence"
                    value={subjectForm.name}
                    onChange={(event) =>
                      setSubjectForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="form-field">
                  Exam or course
                  <input
                    placeholder="e.g. SSC CGL"
                    value={subjectForm.exam}
                    onChange={(event) =>
                      setSubjectForm((current) => ({
                        ...current,
                        exam: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="form-field">
                  Lecture tracker title
                  <input
                    placeholder="Defaults to exam and subject name"
                    value={subjectForm.courseName}
                    onChange={(event) =>
                      setSubjectForm((current) => ({
                        ...current,
                        courseName: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="form-field">
                  Total videos
                  <input
                    min="0"
                    placeholder="e.g. 180"
                    type="number"
                    value={subjectForm.totalVideos}
                    onChange={(event) =>
                      setSubjectForm((current) => ({
                        ...current,
                        totalVideos: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="form-field">
                  Videos per day
                  <input
                    min="0"
                    step="0.5"
                    type="number"
                    value={subjectForm.dailySpeed}
                    onChange={(event) =>
                      setSubjectForm((current) => ({
                        ...current,
                        dailySpeed: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
            </div>

            <div className="modal-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setIsSubjectModalOpen(false)}
              >
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={!subjectForm.name.trim() || !subjectForm.exam.trim()}
                type="button"
                onClick={createSubjectFromForm}
              >
                <Plus size={20} />
                Create subject
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {outcomeDraft && outcomeQuestion ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal outcome-modal">
            <div className="modal-header">
              <div>
                <p className="eyebrow">
                  Attempt {activeAttempt} - Q.
                  {String(outcomeQuestion.number).padStart(3, "0")}
                </p>
                <h2 className="modal-title">Record your outcome</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Close outcome modal"
                onClick={closeOutcomeModal}
              >
                <X size={22} />
              </button>
            </div>

            <div className="modal-body">
              <section className="question-preview">
                <p className="table-head">Question</p>
                <p>{outcomeQuestion.prompt}</p>
                <a
                  className="answer-key-link"
                  href={activeChapter?.sourcePdfUrl ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                >
                  Check answer key
                </a>
              </section>

              <label className="form-field">
                How did it go?
                <div className="outcome-options">
                  {modalStatusOptions.map((option) => (
                    <button
                      className={`outcome-option ${
                        outcomeDraft.status === option.status ? "active" : ""
                      }`}
                      key={option.status}
                      type="button"
                      onClick={() =>
                        setOutcomeDraft((current) =>
                          current ? { ...current, status: option.status } : current,
                        )
                      }
                    >
                      {option.icon}
                      <span>{option.label}</span>
                    </button>
                  ))}
                </div>
              </label>

              <div className="form-grid">
                <label className="form-field">
                  Why did I struggle?
                  <select
                    value={outcomeDraft.reasonCategory}
                    onChange={(event) =>
                      setOutcomeDraft((current) =>
                        current
                          ? { ...current, reasonCategory: event.target.value }
                          : current,
                      )
                    }
                  >
                    <option value="">Select a reason</option>
                    {struggleReasons.map((reason) => (
                      <option key={reason} value={reason}>
                        {reason}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="form-field">
                  Attempt date
                  <input
                    type="date"
                    value={outcomeDraft.attemptedAt}
                    onChange={(event) =>
                      setOutcomeDraft((current) =>
                        current ? { ...current, attemptedAt: event.target.value } : current,
                      )
                    }
                  />
                </label>
              </div>

              <label className="form-field">
                What exactly blocked me?
                <textarea
                  className="modal-textarea"
                  placeholder="Example: I forgot that the unit digit cycle repeats every four powers."
                  value={outcomeDraft.blockedDetail}
                  onChange={(event) =>
                    setOutcomeDraft((current) =>
                      current ? { ...current, blockedDetail: event.target.value } : current,
                    )
                  }
                />
              </label>

              <label className="form-field learning-field">
                <span>
                  <Sparkles size={20} />
                  Learning gained from this question
                </span>
                <textarea
                  className="modal-textarea"
                  placeholder="Write the rule, shortcut or approach you want to remember next time."
                  value={outcomeDraft.learning}
                  onChange={(event) =>
                    setOutcomeDraft((current) =>
                      current ? { ...current, learning: event.target.value } : current,
                    )
                  }
                />
              </label>
            </div>

            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={closeOutcomeModal}>
                Cancel
              </button>
              <button className="primary-button" type="button" onClick={saveOutcome}>
                <CheckCircle2 size={20} />
                Save attempt
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isQuestionModalOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <div>
                <p className="eyebrow">Add to existing chapter</p>
                <h2 className="modal-title">Add extra questions</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Close add question modal"
                onClick={() => setIsQuestionModalOpen(false)}
              >
                <X size={22} />
              </button>
            </div>

            <div className="modal-body">
              <div className="form-grid">
                <label className="form-field">
                  Chapter
                  <select
                    value={addQuestionForm.chapterId}
                    onChange={(event) =>
                      setAddQuestionForm((current) => ({
                        ...current,
                        chapterId: event.target.value,
                      }))
                    }
                  >
                    {activeSubject.chapters.map((chapter) => (
                      <option key={chapter.id} value={chapter.id}>
                        {chapter.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="append-summary">
                  <strong>{parseQuestionLines(addQuestionForm.rawText).length}</strong>
                  <span className="muted">new questions detected</span>
                </div>
              </div>

              <label className="form-field" style={{ marginTop: 18 }}>
                Question list
                <textarea
                  className="modal-textarea question-list-textarea"
                  placeholder={`One question per line\n1. How many non-negative integers are not more than 40?\n2. How many whole numbers x satisfy 2x + 7 <= 39?`}
                  value={addQuestionForm.rawText}
                  onChange={(event) =>
                    setAddQuestionForm((current) => ({
                      ...current,
                      rawText: event.target.value,
                    }))
                  }
                />
              </label>

              <div className="pdf-note">
                <FileText size={22} />
                <span>
                  Use one question per line. Number prefixes like 1., 2), Q.003:
                  are accepted and will be removed automatically.
                </span>
              </div>
            </div>

            <div className="modal-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setIsQuestionModalOpen(false)}
              >
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={
                  !addQuestionForm.chapterId ||
                  parseQuestionLines(addQuestionForm.rawText).length === 0
                }
                type="button"
                onClick={addQuestionsToChapter}
              >
                <Plus size={20} />
                Add to chapter
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isModalOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <div>
                <p className="eyebrow">Grow your question bank</p>
                <h2 className="modal-title">Add a chapter or question set</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Close modal"
                onClick={() => setIsModalOpen(false)}
              >
                <X size={22} />
              </button>
            </div>

            <div className="modal-body">
              <p className="muted" style={{ marginTop: 0 }}>
                Upload a PDF and track by question number, or import a TXT, CSV or
                JSON file containing one question per line.
              </p>

              <div className="form-grid">
                <label className="form-field">
                  Subject
                  <select
                    value={chapterForm.subjectId}
                    onChange={(event) =>
                      setChapterForm((current) => ({
                        ...current,
                        subjectId: event.target.value,
                      }))
                    }
                  >
                    {subjects.map((subject) => (
                      <option key={subject.id} value={subject.id}>
                        {subject.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  Chapter name
                  <input
                    placeholder="e.g. Percentage"
                    value={chapterForm.chapterName}
                    onChange={(event) =>
                      setChapterForm((current) => ({
                        ...current,
                        chapterName: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="form-field">
                  Number of questions
                  <input
                    min="1"
                    placeholder="Required for a PDF"
                    type="number"
                    value={chapterForm.totalQuestions}
                    onChange={(event) =>
                      setChapterForm((current) => ({
                        ...current,
                        totalQuestions: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>

              <label className="upload-zone">
                <UploadCloud size={34} color="#5448f5" />
                <strong style={{ marginTop: 12 }}>
                  {chapterForm.sourceFile?.name ?? "Choose a question file"}
                </strong>
                <span className="muted">PDF, TXT, CSV or JSON - up to 10 MB</span>
                <input
                  accept=".pdf,.txt,.csv,.json"
                  hidden
                  type="file"
                  onChange={handleFileChange}
                />
              </label>
              {questionFileError ? (
                <p className="file-error" role="alert">
                  {questionFileError}
                </p>
              ) : null}

              <label className="form-field" style={{ marginTop: 18 }}>
                Paste questions (optional)
                <textarea
                  className="modal-textarea question-list-textarea"
                  placeholder={"One question per line\n1. First question\n2. Second question"}
                  value={chapterForm.questionText}
                  onChange={(event) =>
                    setChapterForm((current) => ({
                      ...current,
                      questionText: event.target.value,
                    }))
                  }
                />
              </label>
              {parseQuestionLines(chapterForm.questionText).length > 0 ? (
                <div className="append-summary">
                  {parseQuestionLines(chapterForm.questionText).length} questions detected.
                  This will set the chapter question count automatically.
                </div>
              ) : null}

              <div className="pdf-note">
                <FileText size={22} />
                <span>
                  <strong>Using a PDF?</strong> Enter its total question count.
                  StudyTrack creates numbered rows so you can solve from the PDF and
                  record every attempt here.
                </span>
              </div>
            </div>

            <div className="modal-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setIsModalOpen(false)}
              >
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={
                  !chapterForm.chapterName.trim() ||
                  (Number(chapterForm.totalQuestions) <= 0 &&
                    parseQuestionLines(chapterForm.questionText).length === 0)
                }
                type="button"
                onClick={createChapterFromForm}
              >
                <Plus size={20} />
                Create chapter
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function MetricCard({
  color,
  detail,
  icon,
  label,
  value,
}: {
  color: "purple" | "green" | "orange" | "cyan";
  detail: string;
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <div className="metric-card">
      <span className={`metric-icon ${color}`}>{icon}</span>
      <div>
        <div className="metric-label">{label}</div>
        <div className="metric-value">{value}</div>
        <div className="muted">{detail}</div>
      </div>
    </div>
  );
}

function ForecastRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="forecast-row">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
