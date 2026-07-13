export type AttemptNumber = 1 | 2 | 3;

export type AttemptStatus =
  | "not_attempted"
  | "solved"
  | "struggled"
  | "unsolved";

export type AttemptLog = {
  attemptNumber: AttemptNumber;
  status: AttemptStatus;
  reason: string;
  learning: string;
  solvedIndependently: boolean;
  attemptedAt?: string;
};

export type Question = {
  id: string;
  number: number;
  prompt: string;
  attempts: AttemptLog[];
};

export type Chapter = {
  id: string;
  name: string;
  totalQuestions: number;
  sourcePdfName?: string;
  sourcePdfUrl?: string;
  deletedAt?: string | null;
  questions: Question[];
};

export type CourseProgress = {
  totalVideos: number;
  completedVideos: number;
  dailySpeed: number;
  startedAt: string;
};

export type Subject = {
  id: string;
  name: string;
  subtitle: string;
  exam: string;
  courseName: string;
  course: CourseProgress;
  chapters: Chapter[];
};

export const attemptNumbers: AttemptNumber[] = [1, 2, 3];

export const statusLabels: Record<AttemptStatus, string> = {
  not_attempted: "Not attempted",
  solved: "Solved",
  struggled: "Needs review",
  unsolved: "Could not solve",
};

const numberSystemPrompts = [
  "How many non-negative integers are not more than 40?",
  "How many whole numbers for x satisfy the inequality 2x + 7 <= 39?",
  "How many positive integers for p satisfy the inequality 3p + 5 < 33?",
  "How many positive even numbers are not more than 82?",
  "Let S1 be positive integers less than 52 and S2 be non-negative integers not more than 81. Find Y - X.",
  "What is the smallest six-digit number formed using the digits 0, 1, 3, 4, 5, 7?",
  "If a and b are odd numbers, then which expression is even?",
  "Let a and b be even integers and c be odd. Which expression is odd?",
  "If x and y are natural numbers and x + y = 2017, find (-1)^x + (-1)^y.",
  "If 2x + 3y is odd, which statement must be true?",
  "The sum of p even numbers is even and the sum of q odd numbers is odd. Which statement must be true?",
  "If a and b are two odd positive integers, analyze the parity of the given expression.",
];

export function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function createAttemptLogs(): AttemptLog[] {
  return attemptNumbers.map((attemptNumber) => ({
    attemptNumber,
    status: "not_attempted",
    reason: "",
    learning: "",
    solvedIndependently: false,
  }));
}

export function createQuestions(
  count: number,
  chapterName = "Number System",
  chapterId = slugify(chapterName),
): Question[] {
  return Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    const prompt =
      numberSystemPrompts[index] ??
      `${chapterName} practice question ${number}. Add the exact statement or solve it from the source PDF.`;

    return {
      id: `${chapterId}-q-${number}`,
      number,
      prompt,
      attempts: createAttemptLogs(),
    };
  });
}

export function createDefaultSubjects(): Subject[] {
  return [
    {
      id: "mathematics",
      name: "Mathematics",
      subtitle: "SSC CGL Mathematics",
      exam: "SSC CGL",
      courseName: "SSC CGL Mathematics",
      course: {
        totalVideos: 180,
        completedVideos: 0,
        dailySpeed: 4,
        startedAt: "2026-07-12",
      },
      chapters: [
        {
          id: "number-system",
          name: "Number System",
          totalQuestions: 321,
          sourcePdfName: "Number system.pdf",
          sourcePdfUrl: "/sources/number-system.pdf",
          questions: createQuestions(321, "Number System", "number-system"),
        },
      ],
    },
    {
      id: "english",
      name: "English",
      subtitle: "SSC CGL English",
      exam: "SSC CGL",
      courseName: "SSC CGL English",
      course: {
        totalVideos: 140,
        completedVideos: 0,
        dailySpeed: 3,
        startedAt: "2026-07-12",
      },
      chapters: [],
    },
  ];
}
