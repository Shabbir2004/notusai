/**
 * Cron auth — ensure only Vercel Cron (or manual admin) can trigger cron routes.
 *
 * Vercel sends a special header on cron invocations; we verify it.
 * Manual admin can call with Bearer CRON_SECRET.
 */

export function isAuthorizedCron(req: Request): boolean {
  // Vercel Cron sends this header
  const vercelCronHeader = req.headers.get("x-vercel-cron");
  if (vercelCronHeader) return true;

  // Manual admin token
  const auth = req.headers.get("authorization");
  if (auth && process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) {
    return true;
  }

  return false;
}
