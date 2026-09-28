import { NextResponse } from "next/server";
import { authConfigured, SESSION_COOKIE, sessionToken, timingSafeEqual } from "@/lib/auth";

export async function POST(req: Request) {
  if (!authConfigured()) {
    return NextResponse.json(
      { error: "Set ADMIN_PASSWORD and SESSION_SECRET (16+ chars) in the environment." },
      { status: 500 },
    );
  }
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  if (!password || !timingSafeEqual(password, process.env.ADMIN_PASSWORD!)) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await sessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  return res;
}
