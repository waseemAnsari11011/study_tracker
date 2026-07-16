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
  NotebookPen,
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
import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
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
  AttemptAttachment,
  AttemptNumber,
  AttemptStatus,
  Chapter,
  ChapterNote,
  CourseProgress,
  EditorDocument,
  Question,
  Subject,
  attemptNumbers,
  statusLabels,
} from "./lib/study-data";
import {
  PreparedEditorImage,
  RichNoteEditor,
} from "./components/RichNoteEditor";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
const pageSize = 10;
const subjectOrderStorageKey = "studytrack-subject-order";

type ApiErrorBody = { message?: string };

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(30_000),
  });
  const body = (await response.json().catch(() => ({}))) as T & ApiErrorBody;
  if (!response.ok) {
    throw new Error(body.message || `Request failed with status ${response.status}.`);
  }
  return body;
}

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
  blockedContent: EditorDocument;
  learningContent: EditorDocument;
  attemptedAt: string;
  blockedImages: AttemptAttachment[];
  learningImages: AttemptAttachment[];
  pendingBlockedImages: PendingImage[];
  pendingLearningImages: PendingImage[];
};

type PendingImage = {
  id: string;
  file: File;
  previewUrl: string;
};

type SaveNotice = {
  kind: "saving" | "success" | "error";
  message: string;
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

const imageTargetBytes = 50 * 1024;
const acceptedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Image compression failed."))),
      "image/webp",
      quality,
    );
  });
}

async function compressImage(file: File): Promise<File> {
  if (!acceptedImageTypes.has(file.type)) {
    throw new Error(`${file.name}: only JPEG, PNG, and WebP images are supported.`);
  }

  const bitmap = await createImageBitmap(file);
  let width = Math.min(bitmap.width, 1600);
  let height = Math.round((bitmap.height * width) / bitmap.width);
  if (height > 1600) {
    width = Math.round((width * 1600) / height);
    height = 1600;
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser cannot compress this image.");

  let result: Blob | null = null;
  for (let resizePass = 0; resizePass < 7; resizePass += 1) {
    canvas.width = Math.max(320, Math.round(width));
    canvas.height = Math.max(240, Math.round(height));
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    for (let quality = 0.86; quality >= 0.28; quality -= 0.08) {
      result = await canvasToBlob(canvas, quality);
      if (result.size <= imageTargetBytes) break;
    }
    if (result && result.size <= imageTargetBytes) break;
    width *= 0.82;
    height *= 0.82;
  }
  bitmap.close();

  if (!result || result.size > imageTargetBytes) {
    throw new Error(`${file.name}: could not be reduced below 50 KB.`);
  }
  const baseName = file.name.replace(/\.[^.]+$/, "") || "study-image";
  return new File([result], `${baseName}.webp`, {
    type: "image/webp",
    lastModified: Date.now(),
  });
}

async function compressImageWithTimeout(file: File) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      compressImage(file),
      new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(`${file.name}: image processing timed out.`)),
          15_000,
        );
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function legacyEditorDocument(
  text: string,
  images: AttemptAttachment[],
): EditorDocument {
  const content: EditorDocument["content"] = [];
  content.push(
    text
      ? { type: "paragraph", content: [{ type: "text", text }] }
      : { type: "paragraph" },
  );
  images.forEach((image) => {
    content.push({
      type: "image",
      attrs: {
        src: image.url,
        alt: image.filename,
        title: image.filename,
        attachmentId: image.id,
        publicId: image.publicId,
      },
    });
    content.push(
      image.caption
        ? { type: "paragraph", content: [{ type: "text", text: image.caption }] }
        : { type: "paragraph" },
    );
  });
  return { type: "doc", content };
}

function editorText(document: EditorDocument) {
  const parts: string[] = [];
  const visit = (node: EditorDocument["content"][number]) => {
    if (node.text) parts.push(node.text);
    node.content?.forEach(visit);
    if (["paragraph", "heading", "listItem"].includes(node.type)) parts.push("\n");
  };
  document.content.forEach(visit);
  return parts.join("").replace(/\n{3,}/g, "\n\n").trim();
}

function editorImageIds(document: EditorDocument, attribute: "attachmentId" | "pendingId") {
  const ids = new Set<string>();
  const visit = (node: EditorDocument["content"][number]) => {
    const value = node.type === "image" ? node.attrs?.[attribute] : undefined;
    if (typeof value === "string" && value) ids.add(value);
    node.content?.forEach(visit);
  };
  document.content.forEach(visit);
  return ids;
}

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

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildConsistency(chapter: Chapter | undefined) {
  const today = new Date();
  const dayIndex = (today.getDay() + 6) % 7;
  const monday = new Date(today);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(today.getDate() - dayIndex);

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return {
      count: 0,
      date,
      day: date.toLocaleDateString("en-IN", { weekday: "short" }),
      displayDate: date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        weekday: "short",
      }),
      key: localDateKey(date),
    };
  });

  chapter?.questions.forEach((question) => {
    question.attempts.forEach((attempt) => {
      if (!attempt.attemptedAt || attempt.status === "not_attempted") return;
      const key = localDateKey(new Date(attempt.attemptedAt));
      const day = days.find((item) => item.key === key);
      if (day) day.count += 1;
    });
  });

  const attemptedDates = new Set(
    (chapter?.questions ?? []).flatMap((question) =>
      question.attempts
        .filter((attempt) => attempt.attemptedAt && attempt.status !== "not_attempted")
        .map((attempt) => localDateKey(new Date(attempt.attemptedAt as string))),
    ),
  );

  let streak = 0;
  const cursor = new Date(today);
  cursor.setHours(0, 0, 0, 0);
  while (attemptedDates.has(localDateKey(cursor))) {
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
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [dashboardStatus, setDashboardStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
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
  const [chapterNoteText, setChapterNoteText] = useState("");
  const [saveNotice, setSaveNotice] = useState<SaveNotice | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
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
        const data = await apiRequest<{ subjects: Subject[] }>(`${apiBase}/dashboard`);
        if (cancelled) return;
        if (!data.subjects?.length) {
          throw new Error("MongoDB returned no subjects.");
        }

        const orderedSubjects = orderSubjects(data.subjects, preferredSubjectOrder);
        setSubjects(orderedSubjects);
        setDashboardStatus("ready");
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
      } catch (error) {
        if (cancelled) return;
        setDashboardStatus("error");
        setSaveNotice({
          kind: "error",
          message:
            error instanceof Error
              ? `${error.message} The dashboard was not loaded from MongoDB.`
              : "The dashboard was not loaded from MongoDB.",
        });
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

  async function persistAction<T>(
    action: string,
    savingMessage: string,
    successMessage: string,
    request: () => Promise<T>,
  ): Promise<T | null> {
    if (pendingAction) return null;
    setPendingAction(action);
    setSaveNotice({ kind: "saving", message: savingMessage });
    try {
      const result = await request();
      setSaveNotice({ kind: "success", message: successMessage });
      return result;
    } catch (error) {
      setSaveNotice({
        kind: "error",
        message:
          error instanceof Error
            ? `${error.message} Your changes were not applied.`
            : "The save failed. Your changes were not applied.",
      });
      return null;
    } finally {
      setPendingAction(null);
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
      blockedContent:
        attempt.blockedContent ??
        legacyEditorDocument(
          matchedReason === "Other" || !matchedReason ? attempt.reason : "",
          attempt.blockedImages ?? [],
        ),
      learningContent:
        attempt.learningContent ??
        legacyEditorDocument(attempt.learning, attempt.learningImages ?? []),
      attemptedAt: toInputDate(attempt.attemptedAt),
      blockedImages: attempt.blockedImages ?? [],
      learningImages: attempt.learningImages ?? [],
      pendingBlockedImages: [],
      pendingLearningImages: [],
    });
  }

  function closeOutcomeModal() {
    if (outcomeDraft) {
      [...outcomeDraft.pendingBlockedImages, ...outcomeDraft.pendingLearningImages].forEach(
        (image) => URL.revokeObjectURL(image.previewUrl),
      );
    }
    setOutcomeDraft(null);
  }

  async function prepareOutcomeImage(
    section: "blocked" | "learning",
    file: File,
  ): Promise<PreparedEditorImage | null> {
    if (!outcomeDraft || pendingAction) return null;
    setPendingAction("compress-images");
    setSaveNotice({ kind: "saving", message: "Compressing images to 50 KB..." });
    try {
      const compressed = await compressImageWithTimeout(file);
      const pending = {
        id: crypto.randomUUID(),
        file: compressed,
        previewUrl: URL.createObjectURL(compressed),
      };
      setOutcomeDraft((current) =>
        current
          ? {
              ...current,
              ...(section === "blocked"
                ? { pendingBlockedImages: [...current.pendingBlockedImages, pending] }
                : { pendingLearningImages: [...current.pendingLearningImages, pending] }),
            }
          : current,
      );
      setSaveNotice({
        kind: "success",
        message: "Image inserted. Save the attempt to upload it.",
      });
      return { id: pending.id, previewUrl: pending.previewUrl };
    } catch (error) {
      setSaveNotice({
        kind: "error",
        message: error instanceof Error ? error.message : "Image compression failed.",
      });
      return null;
    } finally {
      setPendingAction(null);
    }
  }

  async function saveOutcome() {
    if (!outcomeDraft) return;

    const clearingAttempt = outcomeDraft.status === "not_attempted";
    const emptyDocument: EditorDocument = {
      type: "doc",
      content: [{ type: "paragraph" }],
    };
    const blockedContent = clearingAttempt ? emptyDocument : outcomeDraft.blockedContent;
    const learningContent = clearingAttempt ? emptyDocument : outcomeDraft.learningContent;
    const reason =
      clearingAttempt ? "" : editorText(blockedContent) || outcomeDraft.reasonCategory;
    const learning = clearingAttempt ? "" : editorText(learningContent);
    const blockedAttachmentIds = editorImageIds(blockedContent, "attachmentId");
    const learningAttachmentIds = editorImageIds(learningContent, "attachmentId");
    const blockedPendingIds = editorImageIds(blockedContent, "pendingId");
    const learningPendingIds = editorImageIds(learningContent, "pendingId");
    const retainedBlockedImages = outcomeDraft.blockedImages.filter((image) =>
      blockedAttachmentIds.has(image.id),
    );
    const retainedLearningImages = outcomeDraft.learningImages.filter((image) =>
      learningAttachmentIds.has(image.id),
    );
    const pendingBlockedImages = outcomeDraft.pendingBlockedImages.filter((image) =>
      blockedPendingIds.has(image.id),
    );
    const pendingLearningImages = outcomeDraft.pendingLearningImages.filter((image) =>
      learningPendingIds.has(image.id),
    );
    const nextAttempt: AttemptLog = {
      attemptNumber: activeAttempt,
      attemptedAt:
        outcomeDraft.status === "not_attempted"
          ? undefined
          : new Date(outcomeDraft.attemptedAt).toISOString(),
      learning,
      reason,
      solvedIndependently: outcomeDraft.status === "solved",
      status: outcomeDraft.status,
      blockedImages: retainedBlockedImages,
      learningImages: retainedLearningImages,
      blockedContent,
      learningContent,
    };
    const questionId = outcomeDraft.questionId;
    const formData = new FormData();
    formData.set("status", nextAttempt.status);
    formData.set("reason", nextAttempt.reason);
    formData.set("learning", nextAttempt.learning);
    formData.set("solvedIndependently", String(nextAttempt.solvedIndependently));
    if (nextAttempt.attemptedAt) formData.set("attemptedAt", nextAttempt.attemptedAt);
    formData.set(
      "existingBlockedImages",
      JSON.stringify(nextAttempt.blockedImages ?? []),
    );
    formData.set(
      "existingLearningImages",
      JSON.stringify(nextAttempt.learningImages ?? []),
    );
    formData.set("pendingBlockedCaptions", "[]");
    formData.set("pendingLearningCaptions", "[]");
    formData.set("blockedContent", JSON.stringify(blockedContent));
    formData.set("learningContent", JSON.stringify(learningContent));
    formData.set(
      "blockedPendingIds",
      JSON.stringify(pendingBlockedImages.map((image) => image.id)),
    );
    formData.set(
      "learningPendingIds",
      JSON.stringify(pendingLearningImages.map((image) => image.id)),
    );
    if (!clearingAttempt) {
      pendingBlockedImages.forEach((image) =>
        formData.append("blockedImages", image.file),
      );
      pendingLearningImages.forEach((image) =>
        formData.append("learningImages", image.file),
      );
    }
    const result = await persistAction(
      "attempt",
      "Saving attempt to MongoDB...",
      "Attempt saved to MongoDB.",
      () =>
        apiRequest<{ question: Question }>(
          `${apiBase}/questions/${questionId}/attempts/${activeAttempt}/with-images`,
          {
            method: "PATCH",
            body: formData,
          },
        ),
    );
    if (!result) return;
    [...outcomeDraft.pendingBlockedImages, ...outcomeDraft.pendingLearningImages].forEach(
      (image) => URL.revokeObjectURL(image.previewUrl),
    );
    setSubjects((currentSubjects) =>
      currentSubjects.map((subject) => ({
        ...subject,
        chapters: subject.chapters.map((chapter) => ({
          ...chapter,
          questions: chapter.questions.map((question) =>
            question.id === questionId ? result.question : question,
          ),
        })),
      })),
    );
    setOutcomeDraft(null);
  }

  async function updateCourse(field: keyof CourseProgress, value: number | string) {
    if (!activeSubject || pendingAction) return;
    const nextCourse = {
      ...activeSubject.course,
      [field]: typeof value === "number" ? Math.max(value, 0) : value,
    };
    if (field === "completedVideos") {
      nextCourse.completedVideos = clamp(
        Number(nextCourse.completedVideos),
        0,
        Number(nextCourse.totalVideos),
      );
    }
    const subjectId = activeSubject.id;
    const result = await persistAction(
      "course",
      "Saving lecture progress to MongoDB...",
      "Lecture progress saved to MongoDB.",
      () =>
        apiRequest<{ subject: Subject }>(`${apiBase}/subjects/${subjectId}/course`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(nextCourse),
        }),
    );
    if (!result) return;
    setSubjects((current) =>
      current.map((subject) =>
        subject.id === subjectId
          ? { ...subject, course: result.subject.course }
          : subject,
      ),
    );
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

    const result = await persistAction(
      "subject",
      "Creating subject in MongoDB...",
      "Subject created in MongoDB.",
      () =>
        apiRequest<{ subject: Subject }>(`${apiBase}/subjects`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, exam, courseName, totalVideos, dailySpeed }),
        }),
    );
    if (!result) return;
    setSubjects((current) => [...current, result.subject]);
    setActiveSubjectId(result.subject.id);
    setActiveChapterId("");
    setCurrentPage(1);
    setIsSubjectModalOpen(false);
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

    const formData = new FormData();
    formData.append("subjectId", selectedSubject.id);
    formData.append("subjectName", selectedSubject.name);
    formData.append("chapterName", chapterName);
    formData.append("totalQuestions", String(totalQuestions));
    if (chapterForm.questionText.trim()) {
      formData.append("rawText", chapterForm.questionText);
    }
    if (chapterForm.sourceFile) formData.append("sourceFile", chapterForm.sourceFile);

    const result = await persistAction(
      "chapter",
      "Creating chapter in MongoDB...",
      "Chapter created in MongoDB.",
      () =>
        apiRequest<{ chapter: Chapter }>(`${apiBase}/chapters`, {
          method: "POST",
          body: formData,
        }),
    );
    if (!result) return;
    setSubjects((currentSubjects) =>
      currentSubjects.map((subject) =>
        subject.id === selectedSubject.id
          ? { ...subject, chapters: [...subject.chapters, result.chapter] }
          : subject,
      ),
    );
    setActiveSubjectId(selectedSubject.id);
    setActiveChapterId(result.chapter.id);
    setIsModalOpen(false);
  }

  async function deleteChapter(chapterId: string) {
    const chapter = activeSubject.chapters.find((item) => item.id === chapterId);
    if (!chapter) return;
    if (!window.confirm(`Delete \"${chapter.name}\"? You can restore it later from MongoDB.`)) {
      return;
    }

    const result = await persistAction(
      "delete-chapter",
      "Deleting chapter from MongoDB...",
      "Chapter deleted from MongoDB.",
      () => apiRequest<{ chapterId: string }>(`${apiBase}/chapters/${chapterId}`, { method: "DELETE" }),
    );
    if (!result) return;
    const remainingChapters = activeSubject.chapters.filter(
      (item) => item.id !== result.chapterId,
    );
    setSubjects((currentSubjects) =>
      currentSubjects.map((subject) =>
        subject.id === activeSubject.id
          ? { ...subject, chapters: remainingChapters }
          : subject,
      ),
    );
    if (activeChapter?.id === result.chapterId) {
      setActiveChapterId(remainingChapters[0]?.id ?? "");
      setCurrentPage(1);
    }
  }

  async function addQuestionsToChapter() {
    const prompts = parseQuestionLines(addQuestionForm.rawText);
    if (!addQuestionForm.chapterId || prompts.length === 0) return;
    const chapterId = addQuestionForm.chapterId;
    const result = await persistAction(
      "add-questions",
      "Adding questions to MongoDB...",
      "Questions added to MongoDB.",
      () =>
        apiRequest<{ chapter: Chapter }>(`${apiBase}/chapters/${chapterId}/questions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questions: prompts }),
        }),
    );
    if (!result) return;
    setSubjects((currentSubjects) =>
      currentSubjects.map((subject) => ({
        ...subject,
        chapters: subject.chapters.map((chapter) =>
          chapter.id === chapterId ? result.chapter : chapter,
        ),
      })),
    );
    setActiveChapterId(chapterId);
    setCurrentPage(Math.max(1, Math.ceil(result.chapter.questions.length / pageSize)));
    setIsQuestionModalOpen(false);
  }

  async function moveSubjectToTop(subjectId: string) {
    const result = await persistAction(
      "subject-order",
      "Saving subject order to MongoDB...",
      "Subject order saved to MongoDB.",
      () =>
        apiRequest<{ subjects: Subject[] }>(
          `${apiBase}/subjects/${subjectId}/move-to-top`,
          { method: "PATCH" },
        ),
    );
    if (!result) return;
    setSubjects(result.subjects);
    saveSubjectOrder(result.subjects);
  }

  async function addChapterNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = chapterNoteText.trim();
    if (!activeChapter || !text) return;

    const noteId = `${activeChapter.id}-note-${Date.now()}`;
    const chapterId = activeChapter.id;
    const result = await persistAction(
      "add-note",
      "Saving chapter note to MongoDB...",
      "Chapter note saved to MongoDB.",
      () =>
        apiRequest<{ note: ChapterNote }>(`${apiBase}/chapters/${chapterId}/notes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: noteId, text }),
        }),
    );
    if (!result) return;
    setSubjects((current) =>
      current.map((subject) => ({
        ...subject,
        chapters: subject.chapters.map((chapter) =>
          chapter.id === chapterId
            ? { ...chapter, notes: [...(chapter.notes ?? []), result.note] }
            : chapter,
        ),
      })),
    );
    setChapterNoteText("");
  }

  async function removeChapterNote(noteId: string) {
    if (!activeChapter) return;
    const chapterId = activeChapter.id;
    const result = await persistAction(
      "delete-note",
      "Deleting chapter note from MongoDB...",
      "Chapter note deleted from MongoDB.",
      () =>
        apiRequest<{ noteId: string }>(
          `${apiBase}/chapters/${chapterId}/notes/${noteId}`,
          { method: "DELETE" },
        ),
    );
    if (!result) return;
    setSubjects((current) =>
      current.map((subject) => ({
        ...subject,
        chapters: subject.chapters.map((chapter) =>
          chapter.id === chapterId
            ? {
                ...chapter,
                notes: (chapter.notes ?? []).filter(
                  (note) => note.id !== result.noteId,
                ),
              }
            : chapter,
        ),
      })),
    );
  }

  if (!activeSubject) {
    return (
      <main className="startup-screen">
        <div className="startup-panel">
          {dashboardStatus === "loading" ? <Clock size={28} /> : <AlertCircle size={28} />}
          <h1>{dashboardStatus === "loading" ? "Loading StudyTrack" : "Database unavailable"}</h1>
          <p>
            {dashboardStatus === "loading"
              ? "Waiting for confirmed data from MongoDB..."
              : "No local demo data is being shown. Start the API, check MongoDB, and retry."}
          </p>
          {dashboardStatus === "error" ? (
            <button className="primary-button" type="button" onClick={() => window.location.reload()}>
              Retry connection
            </button>
          ) : null}
        </div>
      </main>
    );
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
        {saveNotice ? (
          <div
            className={`save-notice ${saveNotice.kind}`}
            role={saveNotice.kind === "error" ? "alert" : "status"}
          >
            {saveNotice.kind === "error" ? (
              <AlertCircle size={19} />
            ) : saveNotice.kind === "success" ? (
              <CheckCircle2 size={19} />
            ) : (
              <Clock size={19} />
            )}
            <span>{saveNotice.message}</span>
            <button
              type="button"
              aria-label="Dismiss save notification"
              onClick={() => setSaveNotice(null)}
            >
              <X size={17} />
            </button>
          </div>
        ) : null}
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
                        payload?.[0]?.payload?.displayDate ?? "Study day"
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
                      disabled={pendingAction !== null}
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
                      disabled={pendingAction !== null}
                      min="0"
                      type="number"
                      value={activeSubject.course.completedVideos}
                      onChange={(event) =>
                        updateCourse("completedVideos", Number(event.target.value))
                      }
                    />
                    <button
                      aria-label="Increase completed videos"
                      disabled={pendingAction !== null}
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
                      disabled={pendingAction !== null}
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

        {activeChapter ? (
          <section className="panel chapter-notes-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Chapter memory</p>
                <h2 className="panel-title">Notes to remember</h2>
              </div>
              <span className="note-count">
                {(activeChapter.notes ?? []).length} notes
              </span>
            </div>
            <div className="panel-body chapter-notes-body">
              <form className="chapter-note-form" onSubmit={addChapterNote}>
                <NotebookPen size={20} />
                <input
                  maxLength={500}
                  placeholder="e.g. Memorize squares up to 25"
                  value={chapterNoteText}
                  onChange={(event) => setChapterNoteText(event.target.value)}
                />
                <button
                  className="primary-button"
                  disabled={!chapterNoteText.trim() || pendingAction !== null}
                  type="submit"
                >
                  <Plus size={18} />
                  Add note
                </button>
              </form>

              {(activeChapter.notes ?? []).length > 0 ? (
                <div className="chapter-note-list">
                  {(activeChapter.notes ?? []).map((note) => (
                    <div className="chapter-note" key={note.id}>
                      <NotebookPen size={18} />
                      <span>{note.text}</span>
                      <button
                        type="button"
                        aria-label={`Delete note: ${note.text}`}
                        title="Delete note"
                        onClick={() => removeChapterNote(note.id)}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted chapter-notes-empty">
                  Keep formulas, ranges, shortcuts, and facts you want to revise.
                </p>
              )}
            </div>
          </section>
        ) : null}

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
                disabled={
                  !subjectForm.name.trim() ||
                  !subjectForm.exam.trim() ||
                  pendingAction !== null
                }
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

              <div className="form-field">
                <span>What exactly blocked me?</span>
                <RichNoteEditor
                  key={`blocked-${outcomeDraft.questionId}-${activeAttempt}`}
                  content={outcomeDraft.blockedContent}
                  placeholder="Example: I forgot that the unit digit cycle repeats every four powers."
                  onChange={(content) =>
                    setOutcomeDraft((current) =>
                      current ? { ...current, blockedContent: content } : current,
                    )
                  }
                  onPrepareImage={(file) => prepareOutcomeImage("blocked", file)}
                />
              </div>

              <div className="form-field learning-field">
                <span>
                  <Sparkles size={20} />
                  Learning gained from this question
                </span>
                <RichNoteEditor
                  key={`learning-${outcomeDraft.questionId}-${activeAttempt}`}
                  content={outcomeDraft.learningContent}
                  placeholder="Write the rule, shortcut or approach you want to remember next time."
                  onChange={(content) =>
                    setOutcomeDraft((current) =>
                      current ? { ...current, learningContent: content } : current,
                    )
                  }
                  onPrepareImage={(file) => prepareOutcomeImage("learning", file)}
                />
              </div>
            </div>

            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={closeOutcomeModal}>
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={
                  pendingAction === "attempt" || pendingAction === "compress-images"
                }
                title={
                  pendingAction === "compress-images"
                    ? "Wait for image compression to finish"
                    : pendingAction === "attempt"
                      ? "Saving the attempt"
                      : "Save attempt"
                }
                type="button"
                onClick={saveOutcome}
              >
                <CheckCircle2 size={20} />
                {pendingAction === "compress-images"
                  ? "Preparing image..."
                  : pendingAction === "attempt"
                    ? "Saving..."
                    : "Save attempt"}
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
                  parseQuestionLines(addQuestionForm.rawText).length === 0 ||
                  pendingAction !== null
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
                    parseQuestionLines(chapterForm.questionText).length === 0) ||
                  pendingAction !== null
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
