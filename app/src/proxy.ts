import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/signup"];

// Cheap gate on the session cookie; pages still validate the session against the database.
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has("ip_session");
  const isPublic = PUBLIC_PATHS.includes(request.nextUrl.pathname);
  if (!hasSession && !isPublic) return NextResponse.redirect(new URL("/login", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico|webp)$).*)"],
};
