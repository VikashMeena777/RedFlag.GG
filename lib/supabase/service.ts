import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { serverEnv } from '@/lib/env';

/**
 * Service-role client. **Bypasses RLS entirely.**
 *
 * This is the only client permitted to write the columns the app treats as
 * privileged: `verdict`, `status`, `toxicity`, vote counts/weights, `tier`, and
 * `strikes`. A database trigger rejects those writes from any other role, so
 * this module is the single funnel for them.
 *
 * Rules:
 *  - Never import this into a Client Component.
 *  - Never pass user input straight into a filter without validating it first.
 *  - Always scope the write as narrowly as possible (e.g. guard status
 *    transitions with `.eq('status', 'in_session')` so they stay idempotent).
 */
export function createServiceClient() {
  return createSupabaseClient<Database>(
    serverEnv.supabaseUrl,
    serverEnv.supabaseServiceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    }
  );
}
