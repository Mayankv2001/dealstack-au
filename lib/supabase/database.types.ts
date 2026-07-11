// GENERATED FILE — do not edit by hand.
// Source of truth: the PRODUCTION schema (project numgsivlrglflsnqehac),
// because migrations have historically been applied by hand and
// supabase/migrations/*.sql can drift from prod.
// Regenerate with: npm run types:gen

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_rate_limits: {
        Row: {
          action_key: string
          admin_email: string
          created_at: string
          id: number
        }
        Insert: {
          action_key: string
          admin_email: string
          created_at?: string
          id?: number
        }
        Update: {
          action_key?: string
          admin_email?: string
          created_at?: string
          id?: number
        }
        Relationships: []
      }
      admins: {
        Row: {
          created_at: string
          email: string
          role: string
        }
        Insert: {
          created_at?: string
          email: string
          role?: string
        }
        Update: {
          created_at?: string
          email?: string
          role?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_email: string | null
          created_at: string
          diff: Json | null
          id: string
          row_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor_email?: string | null
          created_at?: string
          diff?: Json | null
          id?: string
          row_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor_email?: string | null
          created_at?: string
          diff?: Json | null
          id?: string
          row_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      card_offers: {
        Row: {
          annual_fee: number | null
          archived_at: string | null
          bonus_stages: Json
          bonus_points: number | null
          card_name: string
          cashback_amount: number | null
          confidence: string
          created_at: string
          eligibility_notes: string
          expiry_date: string | null
          id: string
          is_archived: boolean
          is_published: boolean
          last_checked_at: string
          minimum_spend: number | null
          minimum_spend_period: string | null
          offer_summary: string
          offer_type: string
          point_value_cents: number | null
          provider: string
          review_by_date: string
          source_url: string
          statement_credit_amount: number | null
          updated_at: string
        }
        Insert: {
          annual_fee?: number | null
          archived_at?: string | null
          bonus_stages?: Json
          bonus_points?: number | null
          card_name: string
          cashback_amount?: number | null
          confidence?: string
          created_at?: string
          eligibility_notes?: string
          expiry_date?: string | null
          id: string
          is_archived?: boolean
          is_published?: boolean
          last_checked_at?: string
          minimum_spend?: number | null
          minimum_spend_period?: string | null
          offer_summary?: string
          offer_type: string
          point_value_cents?: number | null
          provider: string
          review_by_date: string
          source_url?: string
          statement_credit_amount?: number | null
          updated_at?: string
        }
        Update: {
          annual_fee?: number | null
          archived_at?: string | null
          bonus_stages?: Json
          bonus_points?: number | null
          card_name?: string
          cashback_amount?: number | null
          confidence?: string
          created_at?: string
          eligibility_notes?: string
          expiry_date?: string | null
          id?: string
          is_archived?: boolean
          is_published?: boolean
          last_checked_at?: string
          minimum_spend?: number | null
          minimum_spend_period?: string | null
          offer_summary?: string
          offer_type?: string
          point_value_cents?: number | null
          provider?: string
          review_by_date?: string
          source_url?: string
          statement_credit_amount?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      card_offer_history: {
        Row: {
          card_offer_id: string
          change_summary: string
          changed_fields: string[]
          checked_at: string
          created_at: string
          id: string
        }
        Insert: {
          card_offer_id: string
          change_summary: string
          changed_fields?: string[]
          checked_at: string
          created_at?: string
          id?: string
        }
        Update: {
          card_offer_id?: string
          change_summary?: string
          changed_fields?: string[]
          checked_at?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_offer_history_card_offer_id_fkey"
            columns: ["card_offer_id"]
            isOneToOne: false
            referencedRelation: "card_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      card_offer_correction_reports: {
        Row: {
          card_offer_id: string | null
          created_at: string
          details: string
          id: string
          reason: string
          reported_offer_label: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          card_offer_id?: string | null
          created_at?: string
          details: string
          id?: string
          reason: string
          reported_offer_label: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          card_offer_id?: string | null
          created_at?: string
          details?: string
          id?: string
          reason?: string
          reported_offer_label?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_offer_correction_reports_card_offer_id_fkey"
            columns: ["card_offer_id"]
            isOneToOne: false
            referencedRelation: "card_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      correction_report_rate_limits: {
        Row: { created_at: string; id: number; request_fingerprint: string }
        Insert: { created_at?: string; id?: number; request_fingerprint: string }
        Update: { created_at?: string; id?: number; request_fingerprint?: string }
        Relationships: []
      }
      daily_pipeline_runs: {
        Row: {
          created_at: string
          detection_detected: number
          detection_inserted: number
          detection_scanned: number
          errors: Json
          expired_archived: number
          card_offers_archived: number
          feed_items_purged: number
          feed_items_retired: number
          feeds_processed: number
          finished_at: string | null
          id: string
          invalid_archived: number
          items_fetched: number
          items_new: number
          items_skipped: number
          items_updated: number
          started_at: string
          status: string
          stale_archived: number
          validation_checked: number
          validation_unknown: number
        }
        Insert: {
          created_at?: string
          detection_detected?: number
          detection_inserted?: number
          detection_scanned?: number
          errors?: Json
          expired_archived?: number
          card_offers_archived?: number
          feed_items_purged?: number
          feed_items_retired?: number
          feeds_processed?: number
          finished_at?: string | null
          id?: string
          invalid_archived?: number
          items_fetched?: number
          items_new?: number
          items_skipped?: number
          items_updated?: number
          started_at?: string
          status?: string
          stale_archived?: number
          validation_checked?: number
          validation_unknown?: number
        }
        Update: {
          created_at?: string
          detection_detected?: number
          detection_inserted?: number
          detection_scanned?: number
          errors?: Json
          expired_archived?: number
          card_offers_archived?: number
          feed_items_purged?: number
          feed_items_retired?: number
          feeds_processed?: number
          finished_at?: string | null
          id?: string
          invalid_archived?: number
          items_fetched?: number
          items_new?: number
          items_skipped?: number
          items_updated?: number
          started_at?: string
          status?: string
          stale_archived?: number
          validation_checked?: number
          validation_unknown?: number
        }
        Relationships: []
      }
      ozb_recheck_runs: {
        Row: {
          active: number
          actually_archived: number
          created_at: string
          deleted: number
          dry_run: boolean
          errors: Json
          expired: number
          fetch_failed: number
          finished_at: string | null
          id: string
          scanned: number
          skipped: number
          started_at: string
          status: string
          unknown: number
          would_archive: number
        }
        Insert: {
          active?: number
          actually_archived?: number
          created_at?: string
          deleted?: number
          dry_run?: boolean
          errors?: Json
          expired?: number
          fetch_failed?: number
          finished_at?: string | null
          id?: string
          scanned?: number
          skipped?: number
          started_at?: string
          status?: string
          unknown?: number
          would_archive?: number
        }
        Update: {
          active?: number
          actually_archived?: number
          created_at?: string
          deleted?: number
          dry_run?: boolean
          errors?: Json
          expired?: number
          fetch_failed?: number
          finished_at?: string | null
          id?: string
          scanned?: number
          skipped?: number
          started_at?: string
          status?: string
          unknown?: number
          would_archive?: number
        }
        Relationships: []
      }
      cashback_offers: {
        Row: {
          cap_dollars: number | null
          citations: Json
          confidence: string
          created_at: string
          excludes_gift_card_payment: boolean
          expiry_date: string | null
          flat_amount: number | null
          id: string
          is_published: boolean
          is_upsized: boolean
          last_checked_at: string
          merchant_id: string
          provider: string
          rate_percent: number
          terms_summary: string
          updated_at: string
        }
        Insert: {
          cap_dollars?: number | null
          citations?: Json
          confidence: string
          created_at?: string
          excludes_gift_card_payment?: boolean
          expiry_date?: string | null
          flat_amount?: number | null
          id: string
          is_published?: boolean
          is_upsized?: boolean
          last_checked_at?: string
          merchant_id: string
          provider: string
          rate_percent?: number
          terms_summary?: string
          updated_at?: string
        }
        Update: {
          cap_dollars?: number | null
          citations?: Json
          confidence?: string
          created_at?: string
          excludes_gift_card_payment?: boolean
          expiry_date?: string | null
          flat_amount?: number | null
          id?: string
          is_published?: boolean
          is_upsized?: boolean
          last_checked_at?: string
          merchant_id?: string
          provider?: string
          rate_percent?: number
          terms_summary?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashback_offers_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_reviews: {
        Row: {
          approved_for_monitoring: boolean
          created_at: string
          feed_paths_allowed: boolean
          id: string
          notes: string | null
          rate_limit_recorded: boolean
          reviewed_at: string | null
          reviewer_email: string | null
          robots_txt_checked: boolean
          source_name: string
          terms_checked: boolean
          updated_at: string
          user_agent_recorded: boolean
        }
        Insert: {
          approved_for_monitoring?: boolean
          created_at?: string
          feed_paths_allowed?: boolean
          id?: string
          notes?: string | null
          rate_limit_recorded?: boolean
          reviewed_at?: string | null
          reviewer_email?: string | null
          robots_txt_checked?: boolean
          source_name: string
          terms_checked?: boolean
          updated_at?: string
          user_agent_recorded?: boolean
        }
        Update: {
          approved_for_monitoring?: boolean
          created_at?: string
          feed_paths_allowed?: boolean
          id?: string
          notes?: string | null
          rate_limit_recorded?: boolean
          reviewed_at?: string | null
          reviewer_email?: string | null
          robots_txt_checked?: boolean
          source_name?: string
          terms_checked?: boolean
          updated_at?: string
          user_agent_recorded?: boolean
        }
        Relationships: []
      }
      feed_fetch_log: {
        Row: {
          created_at: string
          error: string | null
          feed_source_id: string
          finished_at: string | null
          http_status: number | null
          id: string
          items_new: number
          items_seen: number
          items_skipped: number
          items_updated: number
          started_at: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          feed_source_id: string
          finished_at?: string | null
          http_status?: number | null
          id?: string
          items_new?: number
          items_seen?: number
          items_skipped?: number
          items_updated?: number
          started_at?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          feed_source_id?: string
          finished_at?: string | null
          http_status?: number | null
          id?: string
          items_new?: number
          items_seen?: number
          items_skipped?: number
          items_updated?: number
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_fetch_log_feed_source_id_fkey"
            columns: ["feed_source_id"]
            isOneToOne: false
            referencedRelation: "feed_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_items: {
        Row: {
          archive_reason: string | null
          archived_at: string | null
          categories: string[]
          consecutive_validation_failures: number
          content_hash: string | null
          created_at: string
          declared_expires_at: string | null
          failure_streak_started_at: string | null
          feed_source_id: string
          fetched_at: string
          hidden_from_homepage: boolean
          id: string
          last_source_check_at: string | null
          last_validated_at: string | null
          last_validation_error: string | null
          link: string
          posted_at: string | null
          promoted_signal_id: string | null
          raw_summary: string
          raw_title: string
          review_state: string
          reviewed_at: string | null
          reviewed_by: string | null
          source_expired_at: string | null
          source_marked_expired: boolean
          source_native_id: string
          source_status: string | null
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          archive_reason?: string | null
          archived_at?: string | null
          categories?: string[]
          consecutive_validation_failures?: number
          content_hash?: string | null
          created_at?: string
          declared_expires_at?: string | null
          failure_streak_started_at?: string | null
          feed_source_id: string
          fetched_at?: string
          hidden_from_homepage?: boolean
          id?: string
          last_source_check_at?: string | null
          last_validated_at?: string | null
          last_validation_error?: string | null
          link: string
          posted_at?: string | null
          promoted_signal_id?: string | null
          raw_summary?: string
          raw_title: string
          review_state?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_expired_at?: string | null
          source_marked_expired?: boolean
          source_native_id: string
          source_status?: string | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          archive_reason?: string | null
          archived_at?: string | null
          categories?: string[]
          consecutive_validation_failures?: number
          content_hash?: string | null
          created_at?: string
          declared_expires_at?: string | null
          failure_streak_started_at?: string | null
          feed_source_id?: string
          fetched_at?: string
          hidden_from_homepage?: boolean
          id?: string
          last_source_check_at?: string | null
          last_validated_at?: string | null
          last_validation_error?: string | null
          link?: string
          posted_at?: string | null
          promoted_signal_id?: string | null
          raw_summary?: string
          raw_title?: string
          review_state?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_expired_at?: string | null
          source_marked_expired?: boolean
          source_native_id?: string
          source_status?: string | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_items_feed_source_id_fkey"
            columns: ["feed_source_id"]
            isOneToOne: false
            referencedRelation: "feed_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_items_promoted_signal_id_fkey"
            columns: ["promoted_signal_id"]
            isOneToOne: false
            referencedRelation: "ozbargain_signals"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_sources: {
        Row: {
          created_at: string
          etag: string | null
          failure_count: number
          feed_url: string
          id: string
          is_enabled: boolean
          kind: string
          label: string
          last_fetched_at: string | null
          last_modified: string | null
          last_status: string | null
          merchant_id: string | null
          next_earliest_fetch_at: string | null
          source_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          etag?: string | null
          failure_count?: number
          feed_url: string
          id?: string
          is_enabled?: boolean
          kind: string
          label: string
          last_fetched_at?: string | null
          last_modified?: string | null
          last_status?: string | null
          merchant_id?: string | null
          next_earliest_fetch_at?: string | null
          source_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          etag?: string | null
          failure_count?: number
          feed_url?: string
          id?: string
          is_enabled?: boolean
          kind?: string
          label?: string
          last_fetched_at?: string | null
          last_modified?: string | null
          last_status?: string | null
          merchant_id?: string | null
          next_earliest_fetch_at?: string | null
          source_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_sources_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_card_offers: {
        Row: {
          accepted_at: string[]
          accepted_at_merchant_ids: string[]
          brand: string
          cap_dollars: number | null
          channel: string
          citations: Json
          confidence: string
          created_at: string
          discount_percent: number
          expiry_date: string | null
          id: string
          is_published: boolean
          last_checked_at: string
          limit_per_customer: string | null
          points_on_purchase: Json | null
          purchase_location: string | null
          purchase_method: string | null
          source: string
          source_detail_url: string | null
          stack_notes: string[]
          start_date: string | null
          updated_at: string
          usage_notes: string[]
        }
        Insert: {
          accepted_at?: string[]
          accepted_at_merchant_ids?: string[]
          brand: string
          cap_dollars?: number | null
          channel: string
          citations?: Json
          confidence: string
          created_at?: string
          discount_percent?: number
          expiry_date?: string | null
          id: string
          is_published?: boolean
          last_checked_at?: string
          limit_per_customer?: string | null
          points_on_purchase?: Json | null
          purchase_location?: string | null
          purchase_method?: string | null
          source: string
          source_detail_url?: string | null
          stack_notes?: string[]
          start_date?: string | null
          updated_at?: string
          usage_notes?: string[]
        }
        Update: {
          accepted_at?: string[]
          accepted_at_merchant_ids?: string[]
          brand?: string
          cap_dollars?: number | null
          channel?: string
          citations?: Json
          confidence?: string
          created_at?: string
          discount_percent?: number
          expiry_date?: string | null
          id?: string
          is_published?: boolean
          last_checked_at?: string
          limit_per_customer?: string | null
          points_on_purchase?: Json | null
          purchase_location?: string | null
          purchase_method?: string | null
          source?: string
          source_detail_url?: string | null
          stack_notes?: string[]
          start_date?: string | null
          updated_at?: string
          usage_notes?: string[]
        }
        Relationships: []
      }
      offer_change_candidates: {
        Row: {
          confidence: string
          content_hash: string
          created_at: string
          detected_rate_or_discount: string
          detected_title: string
          detected_url: string
          id: string
          merchant_id: string | null
          payload: Json
          previous_value: string | null
          proposed_value: string
          raw_summary: string
          review_state: string
          reviewed_at: string | null
          reviewed_by: string | null
          source_name: string
          source_type: string
          target_id: string | null
          updated_at: string
        }
        Insert: {
          confidence?: string
          content_hash: string
          created_at?: string
          detected_rate_or_discount?: string
          detected_title: string
          detected_url?: string
          id?: string
          merchant_id?: string | null
          payload?: Json
          previous_value?: string | null
          proposed_value?: string
          raw_summary?: string
          review_state?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_name: string
          source_type: string
          target_id?: string | null
          updated_at?: string
        }
        Update: {
          confidence?: string
          content_hash?: string
          created_at?: string
          detected_rate_or_discount?: string
          detected_title?: string
          detected_url?: string
          id?: string
          merchant_id?: string | null
          payload?: Json
          previous_value?: string | null
          proposed_value?: string
          raw_summary?: string
          review_state?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_name?: string
          source_type?: string
          target_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offer_change_candidates_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      ozbargain_signals: {
        Row: {
          archive_reason: string | null
          archived_at: string | null
          comment_count: number | null
          confidence: string
          created_at: string
          deal_kind: string
          expiry_date: string | null
          id: string
          is_sample: boolean
          last_checked_at: string
          last_validated_at: string | null
          merchant_id: string | null
          merchant_url: string | null
          posted_at: string | null
          price_text: string | null
          product_group: string | null
          product_url: string | null
          promo_code: string | null
          sentiment: string
          signal_score: number | null
          source_native_id: string | null
          source_url: string
          status: string
          summary: string
          tags: string[]
          title: string
          updated_at: string
          votes_sample: number | null
        }
        Insert: {
          archive_reason?: string | null
          archived_at?: string | null
          comment_count?: number | null
          confidence: string
          created_at?: string
          deal_kind: string
          expiry_date?: string | null
          id: string
          is_sample?: boolean
          last_checked_at?: string
          last_validated_at?: string | null
          merchant_id?: string | null
          merchant_url?: string | null
          posted_at?: string | null
          price_text?: string | null
          product_group?: string | null
          product_url?: string | null
          promo_code?: string | null
          sentiment: string
          signal_score?: number | null
          source_native_id?: string | null
          source_url: string
          status?: string
          summary?: string
          tags?: string[]
          title: string
          updated_at?: string
          votes_sample?: number | null
        }
        Update: {
          archive_reason?: string | null
          archived_at?: string | null
          comment_count?: number | null
          confidence?: string
          created_at?: string
          deal_kind?: string
          expiry_date?: string | null
          id?: string
          is_sample?: boolean
          last_checked_at?: string
          last_validated_at?: string | null
          merchant_id?: string | null
          merchant_url?: string | null
          posted_at?: string | null
          price_text?: string | null
          product_group?: string | null
          product_url?: string | null
          promo_code?: string | null
          sentiment?: string
          signal_score?: number | null
          source_native_id?: string | null
          source_url?: string
          status?: string
          summary?: string
          tags?: string[]
          title?: string
          updated_at?: string
          votes_sample?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ozbargain_signals_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      points_offers: {
        Row: {
          citations: Json
          confidence: string
          created_at: string
          earn_multiple: number | null
          earn_rate_display: string
          expiry_date: string | null
          id: string
          is_published: boolean
          last_checked_at: string
          mechanism: string
          merchant_id: string | null
          point_value_cents: number | null
          program: string
          updated_at: string
        }
        Insert: {
          citations?: Json
          confidence: string
          created_at?: string
          earn_multiple?: number | null
          earn_rate_display?: string
          expiry_date?: string | null
          id: string
          is_published?: boolean
          last_checked_at?: string
          mechanism: string
          merchant_id?: string | null
          point_value_cents?: number | null
          program: string
          updated_at?: string
        }
        Update: {
          citations?: Json
          confidence?: string
          created_at?: string
          earn_multiple?: number | null
          earn_rate_display?: string
          expiry_date?: string | null
          id?: string
          is_published?: boolean
          last_checked_at?: string
          mechanism?: string
          merchant_id?: string | null
          point_value_cents?: number | null
          program?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "points_offers_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          aliases: string[]
          cashback_percent: number
          cashback_provider: string
          category: string
          created_at: string
          discount_code: string
          discount_percent: number
          expiry_date: string | null
          gift_card_discount_percent: number
          gift_card_source: string
          id: string
          is_published: boolean
          logo: string
          logo_path: string | null
          logo_subtext: string | null
          logo_text: string | null
          logo_theme: Json | null
          name: string
          points_program: string
          points_rate: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          aliases?: string[]
          cashback_percent?: number
          cashback_provider?: string
          category: string
          created_at?: string
          discount_code?: string
          discount_percent?: number
          expiry_date?: string | null
          gift_card_discount_percent?: number
          gift_card_source?: string
          id: string
          is_published?: boolean
          logo: string
          logo_path?: string | null
          logo_subtext?: string | null
          logo_text?: string | null
          logo_theme?: Json | null
          name: string
          points_program?: string
          points_rate?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          aliases?: string[]
          cashback_percent?: number
          cashback_provider?: string
          category?: string
          created_at?: string
          discount_code?: string
          discount_percent?: number
          expiry_date?: string | null
          gift_card_discount_percent?: number
          gift_card_source?: string
          id?: string
          is_published?: boolean
          logo?: string
          logo_path?: string | null
          logo_subtext?: string | null
          logo_text?: string | null
          logo_theme?: Json | null
          name?: string
          points_program?: string
          points_rate?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      weekly_deals: {
        Row: {
          citations: Json
          component_ids: string[]
          confidence: string
          created_at: string
          expiry_date: string | null
          highlight: string
          id: string
          is_published: boolean
          merchant_id: string | null
          summary: string
          title: string
          updated_at: string
          week_of: string
        }
        Insert: {
          citations?: Json
          component_ids?: string[]
          confidence: string
          created_at?: string
          expiry_date?: string | null
          highlight: string
          id: string
          is_published?: boolean
          merchant_id?: string | null
          summary?: string
          title: string
          updated_at?: string
          week_of: string
        }
        Update: {
          citations?: Json
          component_ids?: string[]
          confidence?: string
          created_at?: string
          expiry_date?: string | null
          highlight?: string
          id?: string
          is_published?: boolean
          merchant_id?: string | null
          summary?: string
          title?: string
          updated_at?: string
          week_of?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_deals_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_feed_item: {
        Args: {
          p_deal_kind: string
          p_expiry_date: string | null
          p_expected_content_hash: string | null
          p_feed_item_id: string
          p_merchant_id: string | null
          p_price_text: string | null
          p_promo_code: string | null
          p_signal_id: string
          p_signal_score: number | null
        }
        Returns: {
          created: boolean
          signal_id: string
        }[]
      }
      archive_expired_deals: {
        Args: { p_archived_at: string; p_today: string }
        Returns: number
      }
      archive_recheck_feed_item: {
        Args: {
          p_archive_reason: string
          p_checked_at: string
          p_feed_item_id: string
          p_run_id: string
          p_signal?: string | null
          p_source_identifier: string
          p_source_status: string
        }
        Returns: boolean
      }
      archive_invalid_signal: {
        Args: { p_archived_at: string; p_reason: string; p_signal_id: string }
        Returns: boolean
      }
      consume_admin_rate_limit: {
        Args: {
          p_action_key: string
          p_admin_email: string
          p_max: number
          p_window_seconds: number
        }
        Returns: boolean
      }
      purge_reviewed_feed_items: {
        Args: { p_cutoff: string }
        Returns: number
      }
      run_daily_cleanup: {
        Args: {
          p_archived_at: string
          p_feed_stale_before: string
          p_signal_stale_before: string
          p_today: string
        }
        Returns: Json
      }
      run_daily_pipeline_cleanup: {
        Args: {
          p_archived_at: string
          p_feed_stale_before: string
          p_purge_before: string
          p_signal_stale_before: string
          p_today: string
        }
        Returns: Json
      }
      submit_card_offer_correction: {
        Args: {
          p_card_offer_id: string
          p_details: string
          p_reason: string
          p_request_fingerprint: string
        }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
