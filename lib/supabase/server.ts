import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from './database.types';
import { serverEnv } from '@/lib/env';

/**
 * Server client for Server Components, Server Actions, and Route Handlers.
 *
 * Uses the anon key, so RLS still applies — this is the correct client for
 * anything acting *on behalf of the signed-in user*. The `setAll` try/catch is
 * required because Server Components cannot mutate cookies; in that context the
 * session refresh happens in `proxy.ts` instead.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    serverEnv.supabaseUrl,
    serverEnv.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component — safe to ignore, `proxy.ts`
            // already refreshed the session cookie for this request.
          }
        },
      },
    }
  );
}
