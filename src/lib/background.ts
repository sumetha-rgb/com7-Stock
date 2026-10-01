import { after } from "next/server";

// Run slow, non-essential work (LINE / e-mail notifications) AFTER the HTTP
// response has been sent, so the user doesn't wait for it. On Vercel,
// `after()` keeps the function alive until the task finishes.
// Failures are logged and never affect the response that was already sent.
export function runInBackground(task: () => Promise<unknown>): void {
  const safe = async () => {
    try {
      await task();
    } catch (e) {
      console.error("Background task failed:", e);
    }
  };
  try {
    after(safe);
  } catch {
    // Not inside a request scope (e.g. a script): just fire and forget.
    void safe();
  }
}