/** Runs once when the server starts: production refuses to boot with a missing or unsafe configuration. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertEnv } = await import("@/lib/env-check");
  assertEnv();
  if (process.env.TELEGRAM_BOT_TOKEN) {
    const { notifyOps } = await import("@/services/telegram/notify");
    notifyOps("system", "Server started", [`mode: ${process.env.NEXT_PUBLIC_APP_MODE ?? "demo"}`, `payments: ${process.env.PAYMENTS_PROVIDER ?? "-"}`], "server-started");
  }
}
