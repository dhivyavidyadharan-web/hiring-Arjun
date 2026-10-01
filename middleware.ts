import { NextResponse, type NextRequest } from "next/server";
import { authConfigured, SESSION_COOKIE, sessionToken, timingSafeEqual } from "./lib/auth";

// PUBLIC_DEMO=true turns the login off (demo with fictional candidates, e.g. for grading).
// Remove it, or set it to anything else, to require the password again.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (process.env.PUBLIC_DEMO === "true") {
    return pathname === "/login" ? NextResponse.redirect(new URL("/", req.url)) : NextResponse.next();
  }
  if (pathname === "/login" || pathname === "/api/login") return NextResponse.next();

  const cookie = req.cookies.get(SESSION_COOKIE)?.value ?? "";
  const ok = authConfigured() && timingSafeEqual(cookie, await sessionToken());
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
