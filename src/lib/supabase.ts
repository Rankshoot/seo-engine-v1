import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createBrowserClient, createServerClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Browser client (anon access, for client components if ever needed)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Creates a Supabase client for use in Client Components (browser context).
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

/**
 * Creates a Supabase client for use in Server Components, Server Actions, and Route Handlers.
 * Securely parses and manages cookies.
 */
export async function createSupabaseServerClient() {
  if (typeof window !== 'undefined') {
    throw new Error('createSupabaseServerClient() must only be called on the server');
  }
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing user sessions.
        }
      },
    },
  });
}

function createAdminClient(): SupabaseClient {
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseServiceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
  }
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

let adminSingleton: SupabaseClient | null = null;

/** Server-only Supabase client (service role). Safe to import from client bundles — not initialized in the browser. */
export function getSupabaseAdmin(): SupabaseClient {
  if (typeof window !== 'undefined') {
    throw new Error('getSupabaseAdmin() must only be called on the server');
  }
  if (!adminSingleton) {
    adminSingleton = createAdminClient();
  }
  return adminSingleton;
}

/**
 * Service-role client for server actions and API routes.
 * In the browser bundle this is a lazy proxy so module evaluation never calls `createClient` without a key.
 */
export const supabaseAdmin: SupabaseClient =
  typeof window === 'undefined'
    ? (new Proxy({} as SupabaseClient, {
        get(_target, prop, receiver) {
          const client = getSupabaseAdmin();
          const value = Reflect.get(client as unknown as object, prop, receiver);
          return typeof value === 'function' ? value.bind(client) : value;
        },
      }) as SupabaseClient)
    : (new Proxy({} as SupabaseClient, {
        get() {
          throw new Error('supabaseAdmin is only available on the server');
        },
      }) as SupabaseClient);
