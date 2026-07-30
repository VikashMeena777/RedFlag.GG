/**
 * Supabase schema types.
 *
 * Hand-maintained to match supabase/migrations/*.sql. Regenerate with:
 *   npx supabase gen types typescript --project-id <id> > lib/supabase/database.types.ts
 * If you change the SQL, update this file in the same commit.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserTier = 'anonymous' | 'verified' | 'plus';
export type CaseStatusDb = 'in_session' | 'closed' | 'removed';
export type VoteChoiceDb = 'red' | 'green';
export type CaseCategoryDb =
  | 'dating'
  | 'situationship'
  | 'friendship'
  | 'family'
  | 'work';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          tier: UserTier;
          strikes: number;
          filing_banned: boolean;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          plus_until: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          tier?: UserTier;
          strikes?: number;
          filing_banned?: boolean;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          plus_until?: string | null;
        };
        Update: {
          tier?: UserTier;
          strikes?: number;
          filing_banned?: boolean;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          plus_until?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      cases: {
        Row: {
          id: string;
          case_no: number;
          slug: string;
          author_id: string;
          category: CaseCategoryDb;
          title: string;
          body: string;
          status: CaseStatusDb;
          closes_at: string;
          vote_target: number;
          red_votes: number;
          green_votes: number;
          red_weight: number;
          green_weight: number;
          verdict: Json | null;
          toxicity: number | null;
          verdict_attempts: number;
          verdict_generated_at: string | null;
          is_hidden: boolean;
          needs_review: boolean;
          flag_count: number;
          created_at: string;
          heat: number;
        };
        Insert: {
          id?: string;
          slug: string;
          author_id: string;
          category: CaseCategoryDb;
          title: string;
          body: string;
          status?: CaseStatusDb;
          closes_at?: string;
          vote_target?: number;
        };
        Update: {
          title?: string;
          body?: string;
          status?: CaseStatusDb;
          verdict?: Json | null;
          toxicity?: number | null;
          verdict_attempts?: number;
          verdict_generated_at?: string | null;
          is_hidden?: boolean;
          needs_review?: boolean;
          flag_count?: number;
        };
        Relationships: [];
      };
      votes: {
        Row: {
          id: string;
          case_id: string;
          voter_id: string;
          choice: VoteChoiceDb;
          weight: number;
          voter_fp: string | null;
          is_anonymous_vote: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          case_id: string;
          voter_id: string;
          choice: VoteChoiceDb;
          weight?: number;
          voter_fp?: string | null;
          is_anonymous_vote?: boolean;
          // Set explicitly on upsert so a changed vote records when it changed.
          updated_at?: string;
        };
        Update: {
          choice?: VoteChoiceDb;
          weight?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      flags: {
        Row: {
          id: string;
          case_id: string;
          user_id: string;
          reason: string;
          created_at: string;
        };
        Insert: {
          case_id: string;
          user_id: string;
          reason: string;
        };
        Update: never;
        Relationships: [];
      };
      moderation_actions: {
        Row: {
          id: string;
          case_id: string | null;
          case_no_snapshot: number | null;
          action: string;
          actor_id: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          case_id?: string | null;
          case_no_snapshot?: number | null;
          action: string;
          actor_id?: string | null;
          note?: string | null;
        };
        Update: never;
        Relationships: [];
      };
      stripe_events: {
        Row: { id: string; type: string; processed_at: string };
        Insert: { id: string; type: string };
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      effective_tier: { Args: { p_user: string }; Returns: UserTier };
      is_verified_user: { Args: { p_user: string }; Returns: boolean };
      can_file: { Args: { p_user: string }; Returns: boolean };
    };
    Enums: {
      user_tier: UserTier;
      case_status: CaseStatusDb;
      vote_choice: VoteChoiceDb;
      case_category: CaseCategoryDb;
    };
    CompositeTypes: Record<never, never>;
  };
}
