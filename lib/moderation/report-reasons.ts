import type { ReportReason } from '@/lib/validation';

/**
 * Report reason metadata.
 *
 * Lives outside `lib/actions/reports.ts` because a `'use server'` module may only
 * export async functions — a `const` there is compiled into a runtime export that
 * the client bundle then fails to resolve. Types and interfaces are fine (they
 * are erased), but values are not.
 *
 * Reasons are structured rather than free text so the moderation queue can triage
 * without reading prose.
 */

export const REPORT_REASONS = [
  'identifies_someone',
  'harassment',
  'underage',
  'spam',
  'other',
] as const;

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  identifies_someone: 'Names or identifies a real person',
  harassment: 'Harassment or hate',
  underage: 'Involves someone underage',
  spam: 'Spam or advertising',
  other: 'Something else',
};

export type { ReportReason };
