import crypto from "node:crypto";

function configuration() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      "Cloudinary is not configured. Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET to .env.",
    );
  }
  return { cloudName, apiKey, apiSecret };
}

function signature(params, secret) {
  const value = Object.entries(params)
    .filter(([, item]) => item !== undefined && item !== "")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${key}=${item}`)
    .join("&");
  return crypto.createHash("sha1").update(`${value}${secret}`).digest("hex");
}

export async function uploadAttemptImage(file, questionId) {
  const { cloudName, apiKey, apiSecret } = configuration();
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `studytrack/attempts/${questionId}`;
  const params = { folder, timestamp };
  const body = new FormData();
  body.set("file", new Blob([file.buffer], { type: file.mimetype }), file.originalname);
  body.set("api_key", apiKey);
  body.set("folder", folder);
  body.set("timestamp", String(timestamp));
  body.set("signature", signature(params, apiSecret));

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    { method: "POST", body, signal: AbortSignal.timeout(25_000) },
  );
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error?.message || "Cloudinary rejected the image upload.");
  }

  return {
    id: crypto.randomUUID(),
    publicId: result.public_id,
    url: result.secure_url,
    filename: file.originalname,
    mimeType: result.format ? `image/${result.format}` : file.mimetype,
    size: result.bytes,
    width: result.width,
    height: result.height,
    caption: "",
    createdAt: new Date().toISOString(),
  };
}

export async function deleteAttemptImage(publicId) {
  if (!publicId) return;
  const { cloudName, apiKey, apiSecret } = configuration();
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { public_id: publicId, timestamp };
  const body = new URLSearchParams({
    api_key: apiKey,
    public_id: publicId,
    timestamp: String(timestamp),
    signature: signature(params, apiSecret),
  });
  await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
    method: "POST",
    body,
    signal: AbortSignal.timeout(25_000),
  });
}
