import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const inviteCode = process.env.INVITE_CODE;
  if (!inviteCode) {
    return NextResponse.json(
      { valid: false, error: "Invite system not configured" },
      { status: 500 }
    );
  }

  const body = await request.json();
  const { code } = body;

  if (code !== inviteCode) {
    return NextResponse.json(
      { valid: false, error: "Invalid invite code" },
      { status: 401 }
    );
  }

  const response = NextResponse.json({ valid: true });
  response.cookies.set("crux-invite", "valid", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });

  return response;
}
