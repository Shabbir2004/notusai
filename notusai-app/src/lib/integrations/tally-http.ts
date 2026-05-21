/**
 * Direct HTTP communication with Tally Prime / ERP 9.
 *
 * Tally Prime has a built-in HTTP/XML server that listens on a local port
 * (default 9000). It accepts XML POST requests and processes them as if the
 * XML was imported via the UI.
 *
 * SETUP IN TALLY PRIME (CA does this once):
 *   1. Open Tally Prime
 *   2. Press F1 → Settings → Connectivity
 *   3. Set "Configure Tally as Server" to Yes
 *   4. Default port: 9000
 *   5. Tally now listens on http://localhost:9000
 *
 * For NotusAI testing on the same machine, this works out-of-the-box.
 * For production (Vercel-hosted NotusAI + CA's local Tally), a small bridge
 * helper on the CA's machine forwards requests — Phase 2.
 */

export interface TallyImportResponse {
  success: boolean;
  created: number;
  altered: number;
  deleted: number;
  exceptions: number;
  errors: string[];
  rawResponse: string;
}

export interface TallyConnectionError {
  type: "connection_refused" | "timeout" | "other";
  message: string;
}

export async function postXmlToTally(opts: {
  xml: string;
  tallyUrl?: string;
  timeoutMs?: number;
}): Promise<TallyImportResponse> {
  const url =
    opts.tallyUrl ||
    process.env.TALLY_HTTP_URL ||
    "http://localhost:9000";
  const timeoutMs = opts.timeoutMs || 30000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let responseText: string;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "Accept": "text/xml",
      },
      body: opts.xml,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      throw new Error(`Tally HTTP server returned ${response.status}: ${await response.text()}`);
    }
    responseText = await response.text();
  } catch (e) {
    clearTimeout(timer);
    const err = e as Error;
    if (err.name === "AbortError") {
      throw new TallyError("timeout", `Tally didn't respond within ${timeoutMs}ms. Is the company open in Tally?`);
    }
    // Connection refused most common error
    if (
      err.message.includes("ECONNREFUSED") ||
      err.message.includes("fetch failed") ||
      err.message.includes("Failed to fetch")
    ) {
      throw new TallyError(
        "connection_refused",
        `Could not connect to Tally at ${url}. Make sure Tally Prime is running AND its HTTP server is enabled (F1 → Settings → Connectivity → "Configure Tally as Server: Yes", port 9000).`,
      );
    }
    throw new TallyError("other", err.message);
  }

  // Parse Tally's response XML
  const created = parseInt(extractTag(responseText, "CREATED") || "0", 10);
  const altered = parseInt(extractTag(responseText, "ALTERED") || "0", 10);
  const deleted = parseInt(extractTag(responseText, "DELETED") || "0", 10);
  const exceptions = parseInt(extractTag(responseText, "EXCEPTIONS") || "0", 10);

  // Tally returns errors in <LINEERROR> tags
  const errorMatches = responseText.match(/<LINEERROR>([\s\S]*?)<\/LINEERROR>/g) || [];
  const errors = errorMatches.map((m) => m.replace(/<\/?LINEERROR>/g, "").trim());

  // Also check for <RESPONSE> error text
  const responseMessage = extractTag(responseText, "RESPONSE");
  if (responseMessage && /error|failed|invalid/i.test(responseMessage)) {
    errors.push(responseMessage);
  }

  const success = errors.length === 0 && exceptions === 0 && created + altered > 0;

  return {
    success,
    created,
    altered,
    deleted,
    exceptions,
    errors,
    rawResponse: responseText,
  };
}

/**
 * Check if Tally HTTP server is reachable. Returns true/false fast.
 * Used to show "Tally is online" indicator in UI.
 */
export async function isTallyReachable(tallyUrl?: string): Promise<boolean> {
  const url = tallyUrl || process.env.TALLY_HTTP_URL || "http://localhost:9000";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);

  try {
    // Tally responds to a minimal envelope ping
    const pingXml = `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>List of Companies</REPORTNAME>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/xml" },
      body: pingXml,
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    clearTimeout(timer);
    return false;
  }
}

class TallyError extends Error {
  constructor(public errorType: TallyConnectionError["type"], message: string) {
    super(message);
    this.name = "TallyError";
  }
}

export { TallyError };

function extractTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}>([^<]+)</${tag}>`, "i"));
  return match?.[1] || null;
}
