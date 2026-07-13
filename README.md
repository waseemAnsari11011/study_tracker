# StudyTrack

StudyTrack is a MERN-style progress tracker for SSC CGL preparation. It tracks question attempts, difficult questions, struggle reasons, learning notes, review queues, and lecture/course completion forecasts.

## Stack

- Next.js web app
- Node.js and Express API
- MongoDB with Mongoose models
- PDF/question-set upload support through the API

## Run Locally

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from `.env.example` and set `MONGODB_URI`.

3. Start both apps:

```bash
npm run dev
```

The web app runs on `http://localhost:3000` and the API runs on `http://localhost:4000`.

If `MONGODB_URI` is not set or MongoDB is unavailable, the API still starts with in-memory demo data so the dashboard can be tested immediately.

## What Is Included

- Seeded Mathematics subject with the uploaded Number System chapter count: 321 questions.
- Attempt 1, Attempt 2, and Attempt 3 tracking for every question.
- Status tracking: not attempted, solved, needs review, and could not solve.
- Reason and learning-note fields for each attempt.
- Review queue and accuracy metrics.
- Lecture completion forecast by current videos-per-day speed.
- Add chapter modal for PDF, TXT, CSV, or JSON style question sets. For PDFs, enter the total question count and the app creates numbered rows for tracking.
