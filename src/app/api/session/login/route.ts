import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const { idToken } = await req.json();

    if (!idToken) {
      return NextResponse.json({ error: "Missing idToken" }, { status: 400 });
    }

    // ── Diagnostic: confirm env vars are reaching the serverless function ──
    console.log("[session/login] ENV CHECK → FIREBASE_PROJECT_ID:", process.env.FIREBASE_PROJECT_ID ?? "❌ MISSING");
    console.log("[session/login] ENV CHECK → FIREBASE_CLIENT_EMAIL:", process.env.FIREBASE_CLIENT_EMAIL ? "✅ present" : "❌ MISSING");
    console.log("[session/login] ENV CHECK → FIREBASE_PRIVATE_KEY:", process.env.FIREBASE_PRIVATE_KEY ? `✅ present (${process.env.FIREBASE_PRIVATE_KEY.length} chars)` : "❌ MISSING");
    console.log("[session/login] idToken received, length:", idToken.length);

    const expiresIn = 60 * 60 * 24 * 5 * 1000; // 5 days in ms

    const adminAuth = getAdminAuth();
    console.log("[session/login] Admin SDK initialised ✅");

    const sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn,
    });
    console.log("[session/login] Session cookie minted ✅");

    const res = NextResponse.json({ ok: true });
    res.cookies.set("__session", sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: expiresIn / 1000,
    });

    return res;
  } catch (err: any) {
    // ── Verbose diagnostic catch — REMOVE after auth is confirmed working ──
    console.error("[session/login] ❌ FAILURE DETAILS:", {
      message:  err?.message  ?? "no message",
      code:     err?.code     ?? "no code",
      errorInfo: err?.errorInfo ?? "no errorInfo",
      stack:    err?.stack?.slice(0, 500) ?? "no stack",
    });

    return NextResponse.json(
      {
        error: "Failed to create session",
        // Surfaced in browser console during debug — strip before prod hardening
        detail: err?.message ?? "unknown error",
        code:   err?.code   ?? "unknown code",
      },
      { status: 401 }
    );
  }
}
