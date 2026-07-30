'use client';

import { useEffect } from 'react';
import { ensureJuror } from '@/lib/actions/auth';

/**
 * Seats every visitor as a juror on first load.
 *
 * Mints an anonymous Supabase session so voting works without a signup wall.
 * Runs once per mount and is a no-op when a session already exists, so the
 * upgrade path (anonymous → verified) is never disturbed.
 */
export function JurorProvider() {
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const result = await ensureJuror();
        if (!cancelled && !result.signedIn) {
          // Non-fatal: reading still works, voting will prompt a retry.
          console.warn('[juror] could not seat an anonymous session');
        }
      } catch (error) {
        console.error('[juror] seating failed:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
