/**
 * Gmail OAuth + message fetching.
 *
 * Setup:
 * 1. Go to console.cloud.google.com → Create project "NotusAI"
 * 2. Enable Gmail API
 * 3. OAuth consent screen → External → fill basics
 * 4. Credentials → Create OAuth 2.0 Client ID → Web app
 * 5. Add authorized redirect URI: https://your-app.vercel.app/api/integrations/gmail/callback
 * 6. Copy Client ID + Secret to env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 *
 * Scopes used: gmail.readonly, gmail.modify (to label processed messages)
 */

const GOOGLE_OAUTH_BASE = "https://accounts.google.com/o/oauth2";
const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

export function getOAuthUrl(opts: {
  redirectUri: string;
  state: string;
}): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID not set");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state: opts.state,
  });

  return `${GOOGLE_OAUTH_BASE}/v2/auth?${params}`;
}

export async function exchangeCodeForTokens(opts: {
  code: string;
  redirectUri: string;
}): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  email: string;
}> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth not configured");

  const tokenRes = await fetch(`${GOOGLE_OAUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: opts.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: opts.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    throw new Error(`OAuth token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`);
  }

  const tokens = await tokenRes.json();

  // Get user email
  const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const profile = await profileRes.json();

  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_in: tokens.expires_in,
    scope: tokens.scope,
    email: profile.email,
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth not configured");

  const res = await fetch(`${GOOGLE_OAUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) throw new Error("Token refresh failed: " + (await res.text()));
  return res.json();
}

export interface GmailMessageSummary {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: Date;
  snippet: string;
}

export async function listRecentMessages(opts: {
  accessToken: string;
  query?: string; // Gmail search query
  maxResults?: number;
}): Promise<GmailMessageSummary[]> {
  // Filter: subject likely a GST notice
  const defaultQuery =
    'newer_than:7d (subject:ASMT OR subject:DRC OR subject:"show cause" OR subject:"scrutiny" OR subject:"demand notice" OR subject:GST OR subject:notice)';

  const params = new URLSearchParams({
    q: opts.query || defaultQuery,
    maxResults: String(opts.maxResults || 50),
  });

  const listRes = await fetch(`${GMAIL_API_BASE}/users/me/messages?${params}`, {
    headers: { Authorization: `Bearer ${opts.accessToken}` },
  });
  if (!listRes.ok) throw new Error("Gmail list failed: " + (await listRes.text()));
  const list = await listRes.json();

  if (!list.messages) return [];

  // Fetch headers for each (parallel)
  const summaries = await Promise.all(
    list.messages.slice(0, opts.maxResults || 50).map(async (m: { id: string; threadId: string }) => {
      const msgRes = await fetch(
        `${GMAIL_API_BASE}/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${opts.accessToken}` } },
      );
      const msg = await msgRes.json();
      const headers = msg.payload?.headers || [];
      const getHeader = (n: string) =>
        headers.find((h: { name: string; value: string }) => h.name.toLowerCase() === n.toLowerCase())?.value || "";
      return {
        id: m.id,
        threadId: m.threadId,
        from: getHeader("From"),
        to: getHeader("To"),
        subject: getHeader("Subject"),
        date: new Date(getHeader("Date") || Date.now()),
        snippet: msg.snippet || "",
      };
    }),
  );

  return summaries;
}

export interface GmailFullMessage {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  body: string;
  attachments: Array<{
    filename: string;
    mimeType: string;
    attachmentId: string;
    size: number;
  }>;
}

export async function getFullMessage(opts: {
  accessToken: string;
  messageId: string;
}): Promise<GmailFullMessage> {
  const res = await fetch(`${GMAIL_API_BASE}/users/me/messages/${opts.messageId}?format=full`, {
    headers: { Authorization: `Bearer ${opts.accessToken}` },
  });
  if (!res.ok) throw new Error("Gmail fetch failed");
  const msg = await res.json();

  const headers = msg.payload?.headers || [];
  const getHeader = (n: string) =>
    headers.find((h: { name: string; value: string }) => h.name.toLowerCase() === n.toLowerCase())?.value || "";

  // Extract body (could be in payload.body or in payload.parts)
  const body = extractBody(msg.payload);
  const attachments = extractAttachments(msg.payload);

  return {
    id: msg.id,
    threadId: msg.threadId,
    from: getHeader("From"),
    subject: getHeader("Subject"),
    body,
    attachments,
  };
}

export async function getAttachment(opts: {
  accessToken: string;
  messageId: string;
  attachmentId: string;
}): Promise<{ data: string; size: number }> {
  const res = await fetch(
    `${GMAIL_API_BASE}/users/me/messages/${opts.messageId}/attachments/${opts.attachmentId}`,
    { headers: { Authorization: `Bearer ${opts.accessToken}` } },
  );
  if (!res.ok) throw new Error("Attachment fetch failed");
  const data = await res.json();
  // Gmail returns base64url; convert to base64
  return {
    data: data.data.replace(/-/g, "+").replace(/_/g, "/"),
    size: data.size,
  };
}

type MessagePart = {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: MessagePart[];
};

function extractBody(payload: MessagePart | undefined): string {
  if (!payload) return "";
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf-8");
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return Buffer.from(part.body.data, "base64").toString("utf-8");
      }
    }
    for (const part of payload.parts) {
      const r = extractBody(part);
      if (r) return r;
    }
  }
  return "";
}

function extractAttachments(payload: MessagePart | undefined): GmailFullMessage["attachments"] {
  const out: GmailFullMessage["attachments"] = [];
  function walk(p: MessagePart | undefined) {
    if (!p) return;
    if (p.filename && p.body?.attachmentId) {
      out.push({
        filename: p.filename,
        mimeType: p.mimeType || "application/octet-stream",
        attachmentId: p.body.attachmentId,
        size: p.body.size || 0,
      });
    }
    if (p.parts) for (const sub of p.parts) walk(sub);
  }
  walk(payload);
  return out;
}
