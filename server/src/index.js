import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import morgan from "morgan";
import { connectDatabase } from "./config/database.js";
import { chaptersRouter } from "./routes/chapters.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { questionsRouter } from "./routes/questions.js";
import { subjectsRouter } from "./routes/subjects.js";
import { ensureSeedData } from "./store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.resolve(__dirname, "../uploads");

const app = express();
const port = Number(process.env.PORT || 4000);
const webOrigin = process.env.WEB_ORIGIN || "http://localhost:3000";

app.use(cors({ origin: webOrigin, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));
app.use("/uploads", express.static(uploadDir));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    database: app.locals.dbConnected ? "mongodb" : "memory",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/dashboard", dashboardRouter);
app.use("/api/chapters", chaptersRouter);
app.use("/api/questions", questionsRouter);
app.use("/api/subjects", subjectsRouter);

app.use((error, _req, res, next) => {
  void next;

  if (error?.name === "ZodError") {
    return res.status(400).json({ message: "Invalid request.", issues: error.issues });
  }

  console.error(error);
  return res.status(500).json({ message: "Something went wrong." });
});

const dbConnected = await connectDatabase();
app.locals.dbConnected = dbConnected;
await ensureSeedData(dbConnected);

app.listen(port, () => {
  console.log(`StudyTrack API listening on http://localhost:${port}`);
});
