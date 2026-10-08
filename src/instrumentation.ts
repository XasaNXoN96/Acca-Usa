/** Runs once when the server starts: production refuses to boot with a missing or unsafe configuration. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertEnv } = await import("@/lib/env-check");
  assertEnv();
}
