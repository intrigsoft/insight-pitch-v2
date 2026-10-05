import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { uploads } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { readObject, signedUrl } from "@/lib/storage";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Serves an upload to signed-in readers: images inline, attachments as downloads. */
export async function GET(_request: Request, ctx: RouteContext<"/api/uploads/[id]">) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID.test(id)) return new NextResponse(null, { status: 404 });
  const [u] = await db.select().from(uploads).where(eq(uploads.id, id)).limit(1);
  if (!u) return new NextResponse(null, { status: 404 });
  const download = u.kind === "file";

  const url = await signedUrl(u.key, { name: u.name, contentType: u.contentType, download });
  if (url) return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, max-age=600" } });

  const bytes = await readObject(u.key);
  if (!bytes) return new NextResponse(null, { status: 404 });
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": u.contentType,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(u.name)}`,
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
