import "server-only";

import type { CaseScreenshot } from "@/lib/data/portal-repository";

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxScreenshotBytes = 5 * 1024 * 1024;
const maxScreenshots = 5;

export async function parseCaseScreenshots(formData: FormData): Promise<CaseScreenshot[]> {
  const files = formData.getAll("screenshots").filter((value): value is File => value instanceof File && value.size > 0);
  if (files.length > maxScreenshots) throw new Error("too-many-screenshots");

  return Promise.all(files.map(async (file) => {
    if (file.size > maxScreenshotBytes || !allowedImageTypes.has(file.type)) throw new Error("screenshot");
    const fileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "screenshot";
    return { fileName, contentType: file.type, data: Buffer.from(await file.arrayBuffer()) };
  }));
}

