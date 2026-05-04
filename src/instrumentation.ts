export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertProductionDataEnv } = await import("@/lib/env-server");
    assertProductionDataEnv();
  }
}
