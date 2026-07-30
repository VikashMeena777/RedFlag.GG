import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './database.types';
import { env } from '@/lib/public-env';

/**
 * Browser client. Uses the anon key and is therefore always subject to RLS.
 * Never use this for verdict, tier, or vote-count writes — those are
 * service-role only (see lib/supabase/service.ts).
 */
export function createClient() {
  return createBrowserClient<Database>(env.supabaseUrl, env.supabaseAnonKey);
}
