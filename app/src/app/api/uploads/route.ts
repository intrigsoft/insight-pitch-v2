import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { uploads } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { FILE_ACCEPT, IMAGE_TYPES, MAX_UPLOAD_BYTES, fmtSize } from "@/lib/body";
import { putObject } from "@/lib/storage";
import { getI18n } from "@/i18n/server";

const FILE_EXTS = FILE_ACCEPT.split(",");

// The first bytes of each accepted image type, so a renamed file can't be served as an image.
const MAGIC: Record<string, number[][]> = {
  "image/png": [[0x89, 0x50, 0x4e, 0x47]],
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  "image/gif": [[0x47, 0x49, 0x46, 0x38]],
  "image/webp": [[0x52, 0x49, 0x46, 0x46]],
};
const looksLike = (type: string, b: Uint8Array) => (MAGIC[type] ?? []).some((sig) => sig.every((x, i) => b[i] === x));

/** Stores an image or attachment for a proposal body and returns its id. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to upload files." }, { status: 401 });
  const { t } = await getI18n();
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const kind = form?.get("kind") === "image" ? "image" : "file";
  if (!(file instanceof File)) return NextResponse.json({ error: t("ed.errUpload") }, { status: 400 });
  const name = file.name.replace(/[|\n\r]/g, "-").slice(0, 200) || "file";
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: t("ed.errTooBig", { name, size: fmtSize(file.size) }) }, { status: 413 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  let contentType = file.type || "application/octet-stream";
  if (kind === "image") {
    if (!IMAGE_TYPES.includes(contentType) || !looksLike(contentType, bytes)) return NextResponse.json({ error: t("ed.errImageType") }, { status: 415 });
  } else {
    const ext = "." + (name.split(".").pop() ?? "").toLowerCase();
    if (!FILE_EXTS.includes(ext)) return NextResponse.json({ error: t("ed.errFileType") }, { status: 415 });
    if (!contentType || contentType.startsWith("text/html")) contentType = "application/octet-stream";
  }

  const id = randomUUID();
  const key = `uploads/${user.id}/${id}`;
  try {
    await putObject(key, bytes, contentType);
  } catch (e) {
    console.warn("[uploads] store failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: t("ed.errUpload") }, { status: 502 });
  }
  await db.insert(uploads).values({ id, ownerId: user.id, kind, name, contentType, size: file.size, key });
  return NextResponse.json({ id, name, size: fmtSize(file.size), kind });
}
