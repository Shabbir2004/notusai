import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exchangeCodeForTokens } from "@/lib/integrations/email/gmail";

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL("/app/settings?gmail_error=" + error, req.url));
  }
  if (!code) {
    return NextResponse.redirect(new URL("/app/settings?gmail_error=no_code", req.url));
  }

  // Verify state
  const cookieState = req.headers.get("cookie")?.match(/gmail_oauth_state=([^;]+)/)?.[1];
  if (!state || state !== cookieState) {
    return NextResponse.redirect(new URL("/app/settings?gmail_error=state_mismatch", req.url));
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || url.origin}/api/integrations/gmail/callback`;

  try {
    const tokens = await exchangeCodeForTokens({ code, redirectUri });

    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id")
      .eq("id", user.id)
      .single();
    if (!profile?.firm_id) {
      return NextResponse.redirect(new URL("/app/settings?gmail_error=no_firm", req.url));
    }

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    await supabase.from("email_integrations").upsert(
      {
        firm_id: profile.firm_id,
        user_id: user.id,
        provider: "gmail",
        email_address: tokens.email,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt,
        scopes: tokens.scope.split(" "),
        status: "active",
        last_sync_at: null,
      },
      { onConflict: "firm_id,email_address" },
    );

    return NextResponse.redirect(new URL("/app/settings?gmail_connected=1", req.url));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.redirect(
      new URL("/app/settings?gmail_error=" + encodeURIComponent(msg), req.url),
    );
  }
}
