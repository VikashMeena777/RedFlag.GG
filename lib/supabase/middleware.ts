import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from './database.types';
import { serverEnv } from '@/lib/env';

/**
 * Refreshes the Supabase session cookie on every request.
 *
 * Deliberately does **no** route gating. RedFlag.GG is a public court: every
 * page is readable by anyone, and write permissions are decided per-action by
 * `getViewer()` plus RLS. Redirecting here would only break share links.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    serverEnv.supabaseUrl,
    serverEnv.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Touching getUser() is what triggers the refresh-and-write cycle above.
  await supabase.auth.getUser();

  return response;
}
