import mongoose from "mongoose";

let listenersRegistered = false;

function connectionDetails() {
  const connection = mongoose.connection;
  return {
    database: connection.name || "unknown",
    host: connection.host || "unknown",
    readyState: connection.readyState,
    state: ["disconnected", "connected", "connecting", "disconnecting"][
      connection.readyState
    ] ?? "unknown",
  };
}

function registerConnectionListeners() {
  if (listenersRegistered) return;
  listenersRegistered = true;

  mongoose.connection.on("connected", () => {
    const details = connectionDetails();
    console.log(
      `[database] Connected | database: ${details.database} | host: ${details.host}`,
    );
  });
  mongoose.connection.on("disconnected", () => {
    console.warn("[database] Disconnected - Mongoose will keep trying to reconnect.");
  });
  mongoose.connection.on("reconnected", () => {
    const details = connectionDetails();
    console.log(
      `[database] Reconnected | database: ${details.database} | host: ${details.host}`,
    );
  });
  mongoose.connection.on("error", (error) => {
    console.error(`[database] Connection error: ${error.message}`);
  });
}

export function getDatabaseStatus() {
  return connectionDetails();
}

export async function checkDatabaseHealth() {
  const details = connectionDetails();
  if (details.readyState !== 1 || !mongoose.connection.db) {
    return { ...details, healthy: false };
  }

  try {
    await mongoose.connection.db.admin().ping();
    return { ...connectionDetails(), healthy: true };
  } catch (error) {
    return {
      ...connectionDetails(),
      healthy: false,
      error: error instanceof Error ? error.message : "Database ping failed",
    };
  }
}

export async function connectDatabase() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error(
      "MONGODB_URI is not set. The API will not start because in-memory writes are not durable.",
    );
  }

  try {
    registerConnectionListeners();
    console.log("[database] Connecting to MongoDB Atlas...");
    await mongoose.connect(uri, {
      autoIndex: true,
      serverSelectionTimeoutMS: 5000,
    });
    return true;
  } catch (error) {
    throw new Error(
      `MongoDB connection failed. Fix MONGODB_URI or Atlas Network Access, then restart the API. Details: ${error.message}`,
    );
  }
}
