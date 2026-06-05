import type { AdminEnvKeyStatus } from "@/types/admin-settings";

/** Whether required env vars are present (never expose values). */
export function getAdminEnvKeyStatus(): AdminEnvKeyStatus {
  return {
    ahrefs: Boolean(process.env.AHREFS_API_KEY?.trim()),
    dataforseo: Boolean(
      process.env.DATAFORSEO_LOGIN?.trim() && process.env.DATAFORSEO_PASSWORD?.trim()
    ),
    gemini: Boolean(process.env.GEMINI_API_KEY?.trim()),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
    openai: Boolean(process.env.OPENAI_API_KEY?.trim()),
    serper: Boolean(process.env.SERPER_API_KEY?.trim()),
    clerk: Boolean(
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() &&
        process.env.CLERK_SECRET_KEY?.trim()
    ),
    supabase: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
        process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    ),
  };
}
