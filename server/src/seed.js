import "dotenv/config";
import mongoose from "mongoose";
import { connectDatabase } from "./config/database.js";
import { SubjectModel } from "./models/Subject.js";
import { createDefaultSubjects } from "./lib/defaultData.js";

const dbConnected = await connectDatabase();

if (!dbConnected) {
  console.log("Set MONGODB_URI in .env before running the seed command.");
  process.exit(0);
}

await SubjectModel.deleteMany({});
await SubjectModel.insertMany(createDefaultSubjects());
await mongoose.disconnect();

console.log("Seeded Mathematics, English, and the 321-question Number System set.");
