import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOAuthUrl } from "@/lib/integrations/email/gmail";
import crypto from "node:crypto";

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin}/api/integrations/gmail/callback`;
  const state = crypto.randomBytes(16).toString("hex");

  // Store state in a cookie (verified on callback)
  const url = getOAuthUrl({ redirectUri, state });
  const response = NextResponse.redirect(url);
  response.cookies.set("gmail_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600, // 10 min
  });
  return response;
}
