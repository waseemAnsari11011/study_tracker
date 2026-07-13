import mongoose from "mongoose";

export async function connectDatabase() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.warn("MONGODB_URI is not set. API is running with in-memory demo data.");
    return false;
  }

  try {
    await mongoose.connect(uri, {
      autoIndex: true,
      serverSelectionTimeoutMS: 5000,
    });
    console.log("MongoDB connected");
    return true;
  } catch (error) {
    throw new Error(
      `MongoDB connection failed. Fix MONGODB_URI or Atlas Network Access, then restart the API. Details: ${error.message}`,
    );
  }
}
