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
      card_offers: {
        Row: {
          annual_fee: number | null
          archived_at: string | null
          bonus_points: number | null
          bonus_stages: Json
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
          bonus_points?: number | null
          bonus_stages?: Json
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
          bonus_points?: number | null
          bonus_stages?: Json
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
      correction_report_rate_limits: {
        Row: {
          created_at: string
          id: number
          request_fingerprint: string
        }
        Insert: {
          created_at?: string
          id?: number
          request_fingerprint: string
        }
        Update: {
          created_at?: string
          id?: number
          request_fingerprint?: string
        }
        Relationships: []
      }
      daily_pipeline_runs: {
        Row: {
          card_offers_archived: number
          created_at: string
          detection_detected: number
          detection_inserted: number
          detection_scanned: number
          errors: Json
          expired_archived: number
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
          stale_archived: number
          started_at: string
          status: string
          validation_checked: number
          validation_unknown: number
        }
        Insert: {
          card_offers_archived?: number
          created_at?: string
          detection_detected?: number
          detection_inserted?: number
          detection_scanned?: number
          errors?: Json
          expired_archived?: number
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
          stale_archived?: number
          started_at?: string
          status?: string
          validation_checked?: number
          validation_unknown?: number
        }
        Update: {
          card_offers_archived?: number
          created_at?: string
          detection_detected?: number
          detection_inserted?: number
          detection_scanned?: number
          errors?: Json
          expired_archived?: number
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
          stale_archived?: number
          started_at?: string
          status?: string
          validation_checked?: number
          validation_unknown?: number
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
      gift_card_acceptance_candidates: {
        Row: {
          change_kind: string
          created_at: string
          id: string
          linked_acceptance_id: string | null
          proposed_product_id: string | null
          proposed_values: Json
          raw_item_id: string | null
          raw_merchant_name: string
          resolution_state: string
          resolved_store_id: string | null
          review_status: string
          reviewed_at: string | null
          reviewer_email: string | null
          source_id: string | null
          updated_at: string
        }
        Insert: {
          change_kind?: string
          created_at?: string
          id?: string
          linked_acceptance_id?: string | null
          proposed_product_id?: string | null
          proposed_values?: Json
          raw_item_id?: string | null
          raw_merchant_name: string
          resolution_state?: string
          resolved_store_id?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewer_email?: string | null
          source_id?: string | null
          updated_at?: string
        }
        Update: {
          change_kind?: string
          created_at?: string
          id?: string
          linked_acceptance_id?: string | null
          proposed_product_id?: string | null
          proposed_values?: Json
          raw_item_id?: string | null
          raw_merchant_name?: string
          resolution_state?: string
          resolved_store_id?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewer_email?: string | null
          source_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gift_card_acceptance_candidates_linked_acceptance_id_fkey"
            columns: ["linked_acceptance_id"]
            isOneToOne: false
            referencedRelation: "gift_card_merchant_acceptance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_card_acceptance_candidates_proposed_product_id_fkey"
            columns: ["proposed_product_id"]
            isOneToOne: false
            referencedRelation: "gift_card_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_card_acceptance_candidates_raw_item_id_fkey"
            columns: ["raw_item_id"]
            isOneToOne: false
            referencedRelation: "gift_card_raw_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_card_acceptance_candidates_resolved_store_id_fkey"
            columns: ["resolved_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_card_acceptance_candidates_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "gift_card_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_card_acceptance_evidence: {
        Row: {
          acceptance_id: string
          acceptance_status: string
          checked_at: string
          created_at: string
          evidence_captured_at: string
          evidence_publisher: string | null
          evidence_source_type: string
          evidence_url: string
          id: string
          reviewer_email: string
          source_id: string | null
        }
        Insert: {
          acceptance_id: string
          acceptance_status: string
          checked_at: string
          created_at?: string
          evidence_captured_at: string
          evidence_publisher?: string | null
          evidence_source_type: string
          evidence_url: string
          id?: string
          reviewer_email: string
          source_id?: string | null
        }
        Update: {
          acceptance_id?: string
          acceptance_status?: string
          checked_at?: string
          created_at?: string
          evidence_captured_at?: string
          evidence_publisher?: string | null
          evidence_source_type?: string
          evidence_url?: string
          id?: string
          reviewer_email?: string
          source_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gift_card_acceptance_evidence_acceptance_id_fkey"
            columns: ["acceptance_id"]
            isOneToOne: false
            referencedRelation: "gift_card_merchant_acceptance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_card_acceptance_evidence_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "gift_card_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_card_ingest_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_summary: string | null
          fetch_status: string | null
          id: string
          items_new: number
          items_rejected: number
          items_seen: number
          items_unchanged: number
          items_updated: number
          lease_expires_at: string
          parser_version: number
          run_kind: string
          snapshot_hash: string | null
          source_id: string
          started_at: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_summary?: string | null
          fetch_status?: string | null
          id?: string
          items_new?: number
          items_rejected?: number
          items_seen?: number
          items_unchanged?: number
          items_updated?: number
          lease_expires_at: string
          parser_version?: number
          run_kind?: string
          snapshot_hash?: string | null
          source_id: string
          started_at?: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_summary?: string | null
          fetch_status?: string | null
          id?: string
          items_new?: number
          items_rejected?: number
          items_seen?: number
          items_unchanged?: number
          items_updated?: number
          lease_expires_at?: string
          parser_version?: number
          run_kind?: string
          snapshot_hash?: string | null
          source_id?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "gift_card_ingest_runs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "gift_card_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_card_knowledge: {
        Row: {
          checked_at: string | null
          confidence: string
          created_at: string
          evidence_type: string
          fact: string
          id: string
          product_id: string | null
          review_status: string
          source_url: string | null
          topic: string
          updated_at: string
        }
        Insert: {
          checked_at?: string | null
          confidence?: string
          created_at?: string
          evidence_type?: string
          fact: string
          id?: string
          product_id?: string | null
          review_status?: string
          source_url?: string | null
          topic: string
          updated_at?: string
        }
        Update: {
          checked_at?: string | null
          confidence?: string
          created_at?: string
          evidence_type?: string
          fact?: string
          id?: string
          product_id?: string | null
          review_status?: string
          source_url?: string | null
          topic?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gift_card_knowledge_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "gift_card_products"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_card_merchant_acceptance: {
        Row: {
          acceptance_status: string
          accepts_app: boolean | null
          accepts_in_store: boolean | null
          accepts_online: boolean | null
          accepts_phone: boolean | null
          checked_at: string | null
          created_at: string
          evidence_captured_at: string | null
          evidence_publisher: string | null
          evidence_source_type: string | null
          evidence_url: string | null
          id: string
          is_public: boolean
          last_checked_at: string | null
          limitations: string | null
          mcc: number | null
          merchant_category: string | null
          merchant_name: string | null
          notes: string | null
          outcome: string | null
          participating_location_required: boolean | null
          product_id: string
          region: string
          review_state: string | null
          source_url: string | null
          status: string
          store_id: string | null
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          acceptance_status?: string
          accepts_app?: boolean | null
          accepts_in_store?: boolean | null
          accepts_online?: boolean | null
          accepts_phone?: boolean | null
          checked_at?: string | null
          created_at?: string
          evidence_captured_at?: string | null
          evidence_publisher?: string | null
          evidence_source_type?: string | null
          evidence_url?: string | null
          id?: string
          is_public?: boolean
          last_checked_at?: string | null
          limitations?: string | null
          mcc?: number | null
          merchant_category?: string | null
          merchant_name?: string | null
          notes?: string | null
          outcome?: string | null
          participating_location_required?: boolean | null
          product_id: string
          region?: string
          review_state?: string | null
          source_url?: string | null
          status?: string
          store_id?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          acceptance_status?: string
          accepts_app?: boolean | null
          accepts_in_store?: boolean | null
          accepts_online?: boolean | null
          accepts_phone?: boolean | null
          checked_at?: string | null
          created_at?: string
          evidence_captured_at?: string | null
          evidence_publisher?: string | null
          evidence_source_type?: string | null
          evidence_url?: string | null
          id?: string
          is_public?: boolean
          last_checked_at?: string | null
          limitations?: string | null
          mcc?: number | null
          merchant_category?: string | null
          merchant_name?: string | null
          notes?: string | null
          outcome?: string | null
          participating_location_required?: boolean | null
          product_id?: string
          region?: string
          review_state?: string | null
          source_url?: string | null
          status?: string
          store_id?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gift_card_merchant_acceptance_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "gift_card_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_card_merchant_acceptance_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_card_offer_candidates: {
        Row: {
          approved_offer_id: string | null
          bonus_percent: number | null
          candidate_role: string
          change_diff: Json | null
          change_kind: string | null
          compatibility_json: Json
          created_at: string
          discount_percent: number | null
          effective_discount_percent: number | null
          expires_at: string | null
          extraction_confidence: number
          extraction_warnings: string[]
          fee_waiver_dollars: number | null
          fixed_discount_dollars: number | null
          fixed_points: number | null
          gift_card_brands: string[]
          gift_card_product_id: string | null
          id: string
          is_ongoing: boolean
          points_multiplier: number | null
          points_program: string | null
          promo_credit_dollars: number | null
          promotion_type: string
          raw_item_id: string
          rejection_reason: string | null
          review_status: string
          reviewed_at: string | null
          reviewer_email: string | null
          reward_destination: string | null
          seller_name: string | null
          seller_store_id: string | null
          source_fingerprint: string | null
          source_id: string
          source_present: boolean
          source_removed_at: string | null
          starts_at: string | null
          suboffer_key: string
          targeted: boolean
          terms_json: Json
          threshold_dollars: number | null
          updated_at: string
        }
        Insert: {
          approved_offer_id?: string | null
          bonus_percent?: number | null
          candidate_role?: string
          change_diff?: Json | null
          change_kind?: string | null
          compatibility_json?: Json
          created_at?: string
          discount_percent?: number | null
          effective_discount_percent?: number | null
          expires_at?: string | null
          extraction_confidence?: number
          extraction_warnings?: string[]
          fee_waiver_dollars?: number | null
          fixed_discount_dollars?: number | null
          fixed_points?: number | null
          gift_card_brands?: string[]
          gift_card_product_id?: string | null
          id?: string
          is_ongoing?: boolean
          points_multiplier?: number | null
          points_program?: string | null
          promo_credit_dollars?: number | null
          promotion_type?: string
          raw_item_id: string
          rejection_reason?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewer_email?: string | null
          reward_destination?: string | null
          seller_name?: string | null
          seller_store_id?: string | null
          source_fingerprint?: string | null
          source_id: string
          source_present?: boolean
          source_removed_at?: string | null
          starts_at?: string | null
          suboffer_key?: string
          targeted?: boolean
          terms_json?: Json
          threshold_dollars?: number | null
          updated_at?: string
        }
        Update: {
          approved_offer_id?: string | null
          bonus_percent?: number | null
          candidate_role?: string
          change_diff?: Json | null
          change_kind?: string | null
          compatibility_json?: Json
          created_at?: string
          discount_percent?: number | null
          effective_discount_percent?: number | null
          expires_at?: string | null
          extraction_confidence?: number
          extraction_warnings?: string[]
          fee_waiver_dollars?: number | null
          fixed_discount_dollars?: number | null
          fixed_points?: number | null
          gift_card_brands?: string[]
          gift_card_product_id?: string | null
          id?: string
          is_ongoing?: boolean
          points_multiplier?: number | null
          points_program?: string | null
          promo_credit_dollars?: number | null
          promotion_type?: string
          raw_item_id?: string
          rejection_reason?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewer_email?: string | null
          reward_destination?: string | null
          seller_name?: string | null
          seller_store_id?: string | null
          source_fingerprint?: string | null
          source_id?: string
          source_present?: boolean
          source_removed_at?: string | null
          starts_at?: string | null
          suboffer_key?: string
          targeted?: boolean
          terms_json?: Json
          threshold_dollars?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gift_card_offer_candidates_approved_offer_id_fkey"
            columns: ["approved_offer_id"]
            isOneToOne: false
            referencedRelation: "gift_card_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_card_offer_candidates_gift_card_product_id_fkey"
            columns: ["gift_card_product_id"]
            isOneToOne: false
            referencedRelation: "gift_card_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_card_offer_candidates_raw_item_id_fkey"
            columns: ["raw_item_id"]
            isOneToOne: false
            referencedRelation: "gift_card_raw_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_card_offer_candidates_seller_store_id_fkey"
            columns: ["seller_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_card_offer_candidates_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "gift_card_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_card_offer_occurrences: {
        Row: {
          bonus_percent: number | null
          created_at: string
          discount_percent: number | null
          end_date: string
          fixed_dollars: number | null
          fixed_points: number | null
          id: string
          points_multiplier: number | null
          points_programme: string | null
          product_key: string
          product_name: string
          promotion_type: string
          sealed_at: string
          seller_key: string
          seller_name: string
          source_offer_id: string | null
          source_url: string
          start_date: string | null
          threshold_dollars: number | null
          verified_at: string
        }
        Insert: {
          bonus_percent?: number | null
          created_at?: string
          discount_percent?: number | null
          end_date: string
          fixed_dollars?: number | null
          fixed_points?: number | null
          id?: string
          points_multiplier?: number | null
          points_programme?: string | null
          product_key: string
          product_name: string
          promotion_type: string
          sealed_at?: string
          seller_key: string
          seller_name: string
          source_offer_id?: string | null
          source_url: string
          start_date?: string | null
          threshold_dollars?: number | null
          verified_at: string
        }
        Update: {
          bonus_percent?: number | null
          created_at?: string
          discount_percent?: number | null
          end_date?: string
          fixed_dollars?: number | null
          fixed_points?: number | null
          id?: string
          points_multiplier?: number | null
          points_programme?: string | null
          product_key?: string
          product_name?: string
          promotion_type?: string
          sealed_at?: string
          seller_key?: string
          seller_name?: string
          source_offer_id?: string | null
          source_url?: string
          start_date?: string | null
          threshold_dollars?: number | null
          verified_at?: string
        }
        Relationships: []
      }
      gift_card_offer_predictions: {
        Row: {
          comparison_notes: string | null
          created_at: string
          fingerprint: string
          id: string
          linked_offer_id: string | null
          predicted_discount_percent: number | null
          predicted_ends_at: string | null
          predicted_families: string[]
          predicted_promotion_text: string | null
          predicted_promotion_type: string | null
          predicted_seller: string | null
          predicted_starts_at: string | null
          predicted_value: string | null
          reviewed_at: string | null
          source_id: string
          source_last_updated: string | null
          source_marker: string | null
          source_reference_url: string | null
          source_url: string
          status: string
          updated_at: string
        }
        Insert: {
          comparison_notes?: string | null
          created_at?: string
          fingerprint?: string
          id?: string
          linked_offer_id?: string | null
          predicted_discount_percent?: number | null
          predicted_ends_at?: string | null
          predicted_families?: string[]
          predicted_promotion_text?: string | null
          predicted_promotion_type?: string | null
          predicted_seller?: string | null
          predicted_starts_at?: string | null
          predicted_value?: string | null
          reviewed_at?: string | null
          source_id: string
          source_last_updated?: string | null
          source_marker?: string | null
          source_reference_url?: string | null
          source_url: string
          status?: string
          updated_at?: string
        }
        Update: {
          comparison_notes?: string | null
          created_at?: string
          fingerprint?: string
          id?: string
          linked_offer_id?: string | null
          predicted_discount_percent?: number | null
          predicted_ends_at?: string | null
          predicted_families?: string[]
          predicted_promotion_text?: string | null
          predicted_promotion_type?: string | null
          predicted_seller?: string | null
          predicted_starts_at?: string | null
          predicted_value?: string | null
          reviewed_at?: string | null
          source_id?: string
          source_last_updated?: string | null
          source_marker?: string | null
          source_reference_url?: string | null
          source_url?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gift_card_offer_predictions_linked_offer_id_fkey"
            columns: ["linked_offer_id"]
            isOneToOne: false
            referencedRelation: "gift_card_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_card_offer_predictions_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "gift_card_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_card_offers: {
        Row: {
          accepted_at: string[]
          accepted_at_merchant_ids: string[]
          activation_required: boolean
          australia_only: boolean | null
          bonus_percent: number | null
          brand: string
          cap_dollars: number | null
          channel: string
          citations: Json
          combinable_with_seller_promotions: boolean | null
          confidence: string
          coupon_required: boolean
          created_at: string
          denomination_note: string | null
          discount_percent: number
          expiry_date: string | null
          expiry_time: string | null
          expiry_timezone: string | null
          fee_waiver_dollars: number | null
          fixed_discount_dollars: number | null
          fixed_points: number | null
          format: string
          id: string
          included_product_ids: string[]
          is_ongoing: boolean
          is_published: boolean
          last_checked_at: string
          lifecycle_activated_at: string | null
          lifecycle_archived_at: string | null
          lifecycle_state: string
          limit_per_customer: string | null
          membership_required: boolean
          min_spend: number | null
          points_multiplier: number | null
          points_on_purchase: Json | null
          points_program: string | null
          points_value_cents: number | null
          product_id: string | null
          promo_code: string | null
          promo_credit_dollars: number | null
          promotion_type: string
          purchase_location: string | null
          purchase_method: string | null
          reward_destination: string | null
          seller_name: string | null
          shipping_may_apply: boolean
          source: string
          source_candidate_id: string | null
          source_detail_url: string | null
          source_id: string | null
          source_last_seen_at: string | null
          source_name: string | null
          source_raw_item_id: string | null
          source_suboffer_key: string | null
          stack_notes: string[]
          start_date: string | null
          targeted: boolean
          terms_url: string | null
          threshold_dollars: number | null
          updated_at: string
          usage_notes: string[]
          uses_per_customer: number | null
        }
        Insert: {
          accepted_at?: string[]
          accepted_at_merchant_ids?: string[]
          activation_required?: boolean
          australia_only?: boolean | null
          bonus_percent?: number | null
          brand: string
          cap_dollars?: number | null
          channel: string
          citations?: Json
          combinable_with_seller_promotions?: boolean | null
          confidence: string
          coupon_required?: boolean
          created_at?: string
          denomination_note?: string | null
          discount_percent?: number
          expiry_date?: string | null
          expiry_time?: string | null
          expiry_timezone?: string | null
          fee_waiver_dollars?: number | null
          fixed_discount_dollars?: number | null
          fixed_points?: number | null
          format?: string
          id: string
          included_product_ids?: string[]
          is_ongoing?: boolean
          is_published?: boolean
          last_checked_at?: string
          lifecycle_activated_at?: string | null
          lifecycle_archived_at?: string | null
          lifecycle_state?: string
          limit_per_customer?: string | null
          membership_required?: boolean
          min_spend?: number | null
          points_multiplier?: number | null
          points_on_purchase?: Json | null
          points_program?: string | null
          points_value_cents?: number | null
          product_id?: string | null
          promo_code?: string | null
          promo_credit_dollars?: number | null
          promotion_type?: string
          purchase_location?: string | null
          purchase_method?: string | null
          reward_destination?: string | null
          seller_name?: string | null
          shipping_may_apply?: boolean
          source: string
          source_candidate_id?: string | null
          source_detail_url?: string | null
          source_id?: string | null
          source_last_seen_at?: string | null
          source_name?: string | null
          source_raw_item_id?: string | null
          source_suboffer_key?: string | null
          stack_notes?: string[]
          start_date?: string | null
          targeted?: boolean
          terms_url?: string | null
          threshold_dollars?: number | null
          updated_at?: string
          usage_notes?: string[]
          uses_per_customer?: number | null
        }
        Update: {
          accepted_at?: string[]
          accepted_at_merchant_ids?: string[]
          activation_required?: boolean
          australia_only?: boolean | null
          bonus_percent?: number | null
          brand?: string
          cap_dollars?: number | null
          channel?: string
          citations?: Json
          combinable_with_seller_promotions?: boolean | null
          confidence?: string
          coupon_required?: boolean
          created_at?: string
          denomination_note?: string | null
          discount_percent?: number
          expiry_date?: string | null
          expiry_time?: string | null
          expiry_timezone?: string | null
          fee_waiver_dollars?: number | null
          fixed_discount_dollars?: number | null
          fixed_points?: number | null
          format?: string
          id?: string
          included_product_ids?: string[]
          is_ongoing?: boolean
          is_published?: boolean
          last_checked_at?: string
          lifecycle_activated_at?: string | null
          lifecycle_archived_at?: string | null
          lifecycle_state?: string
          limit_per_customer?: string | null
          membership_required?: boolean
          min_spend?: number | null
          points_multiplier?: number | null
          points_on_purchase?: Json | null
          points_program?: string | null
          points_value_cents?: number | null
          product_id?: string | null
          promo_code?: string | null
          promo_credit_dollars?: number | null
          promotion_type?: string
          purchase_location?: string | null
          purchase_method?: string | null
          reward_destination?: string | null
          seller_name?: string | null
          shipping_may_apply?: boolean
          source?: string
          source_candidate_id?: string | null
          source_detail_url?: string | null
          source_id?: string | null
          source_last_seen_at?: string | null
          source_name?: string | null
          source_raw_item_id?: string | null
          source_suboffer_key?: string | null
          stack_notes?: string[]
          start_date?: string | null
          targeted?: boolean
          terms_url?: string | null
          threshold_dollars?: number | null
          updated_at?: string
          usage_notes?: string[]
          uses_per_customer?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gift_card_offers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "gift_card_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_card_offers_source_candidate_id_fkey"
            columns: ["source_candidate_id"]
            isOneToOne: false
            referencedRelation: "gift_card_offer_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_card_offers_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "gift_card_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_card_offers_source_raw_item_id_fkey"
            columns: ["source_raw_item_id"]
            isOneToOne: false
            referencedRelation: "gift_card_raw_items"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_card_products: {
        Row: {
          activation_delay_note: string | null
          activation_method: string | null
          aliases: string[]
          brand: string
          card_network: string | null
          category_restricted: boolean
          created_at: string
          denominations: number[] | null
          expiry_or_fees_note: string | null
          format: string
          id: string
          in_store_available: boolean | null
          is_active: boolean
          issuer: string | null
          max_denomination: number | null
          min_denomination: number | null
          mobile_wallet: string
          official_product_page: string | null
          online_available: boolean | null
          redemption_notes: string | null
          slug: string
          source_evidence: Json
          split_payment: string
          supported_mccs: number[]
          unsupported_mccs: number[]
          updated_at: string
          variable_load: boolean | null
        }
        Insert: {
          activation_delay_note?: string | null
          activation_method?: string | null
          aliases?: string[]
          brand: string
          card_network?: string | null
          category_restricted?: boolean
          created_at?: string
          denominations?: number[] | null
          expiry_or_fees_note?: string | null
          format?: string
          id: string
          in_store_available?: boolean | null
          is_active?: boolean
          issuer?: string | null
          max_denomination?: number | null
          min_denomination?: number | null
          mobile_wallet?: string
          official_product_page?: string | null
          online_available?: boolean | null
          redemption_notes?: string | null
          slug: string
          source_evidence?: Json
          split_payment?: string
          supported_mccs?: number[]
          unsupported_mccs?: number[]
          updated_at?: string
          variable_load?: boolean | null
        }
        Update: {
          activation_delay_note?: string | null
          activation_method?: string | null
          aliases?: string[]
          brand?: string
          card_network?: string | null
          category_restricted?: boolean
          created_at?: string
          denominations?: number[] | null
          expiry_or_fees_note?: string | null
          format?: string
          id?: string
          in_store_available?: boolean | null
          is_active?: boolean
          issuer?: string | null
          max_denomination?: number | null
          min_denomination?: number | null
          mobile_wallet?: string
          official_product_page?: string | null
          online_available?: boolean | null
          redemption_notes?: string | null
          slug?: string
          source_evidence?: Json
          split_payment?: string
          supported_mccs?: number[]
          unsupported_mccs?: number[]
          updated_at?: string
          variable_load?: boolean | null
        }
        Relationships: []
      }
      gift_card_programme_rate_history: {
        Row: {
          actor_email: string | null
          change_kind: string
          changed_fields: string[]
          checked_at: string
          created_at: string
          id: string
          new_snapshot: Json | null
          old_snapshot: Json | null
          programme_rate_id: string
        }
        Insert: {
          actor_email?: string | null
          change_kind: string
          changed_fields?: string[]
          checked_at: string
          created_at?: string
          id?: string
          new_snapshot?: Json | null
          old_snapshot?: Json | null
          programme_rate_id: string
        }
        Update: {
          actor_email?: string | null
          change_kind?: string
          changed_fields?: string[]
          checked_at?: string
          created_at?: string
          id?: string
          new_snapshot?: Json | null
          old_snapshot?: Json | null
          programme_rate_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gift_card_programme_rate_history_programme_rate_id_fkey"
            columns: ["programme_rate_id"]
            isOneToOne: false
            referencedRelation: "gift_card_programme_rates"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_card_programme_rates: {
        Row: {
          bonus_percent: number | null
          brand_name: string
          confidence: string
          created_at: string
          discount_percent: number | null
          fee_waiver_dollars: number | null
          first_seen_at: string
          fixed_discount_dollars: number | null
          id: string
          is_active: boolean
          is_ongoing: boolean
          is_published: boolean
          last_checked_at: string
          last_seen_at: string
          membership_tier: string | null
          payment_requirement: string | null
          product_id: string | null
          programme_id: string
          promotion_type: string
          rate_key: string
          review_by_date: string
          source_url: string
          threshold_dollars: number | null
          updated_at: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          bonus_percent?: number | null
          brand_name: string
          confidence?: string
          created_at?: string
          discount_percent?: number | null
          fee_waiver_dollars?: number | null
          first_seen_at?: string
          fixed_discount_dollars?: number | null
          id?: string
          is_active?: boolean
          is_ongoing?: boolean
          is_published?: boolean
          last_checked_at: string
          last_seen_at?: string
          membership_tier?: string | null
          payment_requirement?: string | null
          product_id?: string | null
          programme_id: string
          promotion_type?: string
          rate_key: string
          review_by_date: string
          source_url: string
          threshold_dollars?: number | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          bonus_percent?: number | null
          brand_name?: string
          confidence?: string
          created_at?: string
          discount_percent?: number | null
          fee_waiver_dollars?: number | null
          first_seen_at?: string
          fixed_discount_dollars?: number | null
          id?: string
          is_active?: boolean
          is_ongoing?: boolean
          is_published?: boolean
          last_checked_at?: string
          last_seen_at?: string
          membership_tier?: string | null
          payment_requirement?: string | null
          product_id?: string | null
          programme_id?: string
          promotion_type?: string
          rate_key?: string
          review_by_date?: string
          source_url?: string
          threshold_dollars?: number | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gift_card_programme_rates_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "gift_card_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_card_programme_rates_programme_id_fkey"
            columns: ["programme_id"]
            isOneToOne: false
            referencedRelation: "gift_card_programmes"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_card_programmes: {
        Row: {
          account_required: boolean
          account_requirement: string | null
          confidence: string
          created_at: string
          id: string
          is_ongoing: boolean
          is_published: boolean
          last_checked_at: string
          membership_required: boolean
          name: string
          payment_requirement: string | null
          programme_kind: string
          provider: string
          review_by_date: string
          source_url: string
          terms_url: string | null
          updated_at: string
        }
        Insert: {
          account_required?: boolean
          account_requirement?: string | null
          confidence?: string
          created_at?: string
          id: string
          is_ongoing?: boolean
          is_published?: boolean
          last_checked_at: string
          membership_required?: boolean
          name: string
          payment_requirement?: string | null
          programme_kind?: string
          provider: string
          review_by_date: string
          source_url: string
          terms_url?: string | null
          updated_at?: string
        }
        Update: {
          account_required?: boolean
          account_requirement?: string | null
          confidence?: string
          created_at?: string
          id?: string
          is_ongoing?: boolean
          is_published?: boolean
          last_checked_at?: string
          membership_required?: boolean
          name?: string
          payment_requirement?: string | null
          programme_kind?: string
          provider?: string
          review_by_date?: string
          source_url?: string
          terms_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      gift_card_raw_items: {
        Row: {
          campaign_kind: string
          canonical_url: string
          content_hash: string
          created_at: string
          external_id: string
          first_seen_at: string
          id: string
          last_seen_at: string
          parser_error: string | null
          parser_version: number
          processing_status: string
          published_at: string | null
          raw_payload: Json
          source_id: string
          source_updated_at: string | null
          split_review_status: string
          title: string
          updated_at: string
        }
        Insert: {
          campaign_kind?: string
          canonical_url: string
          content_hash: string
          created_at?: string
          external_id: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          parser_error?: string | null
          parser_version?: number
          processing_status?: string
          published_at?: string | null
          raw_payload?: Json
          source_id: string
          source_updated_at?: string | null
          split_review_status?: string
          title: string
          updated_at?: string
        }
        Update: {
          campaign_kind?: string
          canonical_url?: string
          content_hash?: string
          created_at?: string
          external_id?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          parser_error?: string | null
          parser_version?: number
          processing_status?: string
          published_at?: string | null
          raw_payload?: Json
          source_id?: string
          source_updated_at?: string | null
          split_review_status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gift_card_raw_items_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "gift_card_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_card_sources: {
        Row: {
          acceptance_evidence_source_type: string | null
          automated_fetch_allowed: boolean
          base_url: string
          created_at: string
          enabled: boolean
          etag: string | null
          feed_url: string
          id: string
          last_error: string | null
          last_error_at: string | null
          last_modified: string | null
          last_success_at: string | null
          name: string
          robots_checked_at: string | null
          source_type: string
          terms_checked_at: string | null
          updated_at: string
        }
        Insert: {
          acceptance_evidence_source_type?: string | null
          automated_fetch_allowed?: boolean
          base_url: string
          created_at?: string
          enabled?: boolean
          etag?: string | null
          feed_url: string
          id: string
          last_error?: string | null
          last_error_at?: string | null
          last_modified?: string | null
          last_success_at?: string | null
          name: string
          robots_checked_at?: string | null
          source_type?: string
          terms_checked_at?: string | null
          updated_at?: string
        }
        Update: {
          acceptance_evidence_source_type?: string | null
          automated_fetch_allowed?: boolean
          base_url?: string
          created_at?: string
          enabled?: boolean
          etag?: string | null
          feed_url?: string
          id?: string
          last_error?: string | null
          last_error_at?: string | null
          last_modified?: string | null
          last_success_at?: string | null
          name?: string
          robots_checked_at?: string | null
          source_type?: string
          terms_checked_at?: string | null
          updated_at?: string
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
      public_correction_reports: {
        Row: {
          created_at: string
          details: string
          entity_id: string
          entity_type: string
          id: string
          reason: string
          reported_label: string
          request_fingerprint: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          details: string
          entity_id: string
          entity_type: string
          id?: string
          reason: string
          reported_label: string
          request_fingerprint: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          details?: string
          entity_id?: string
          entity_type?: string
          id?: string
          reason?: string
          reported_label?: string
          request_fingerprint?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: []
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
      acquire_gift_card_job_run: {
        Args: {
          p_lease_expires_at: string
          p_run_kind: string
          p_source_id: string
          p_started_at: string
        }
        Returns: string
      }
      apply_gift_card_offer_lifecycle: {
        Args: { p_now: string }
        Returns: Json
      }
      approve_feed_item: {
        Args: {
          p_deal_kind: string
          p_expected_content_hash: string
          p_expiry_date: string
          p_feed_item_id: string
          p_merchant_id: string
          p_price_text: string
          p_promo_code: string
          p_signal_id: string
          p_signal_score: number
        }
        Returns: {
          created: boolean
          signal_id: string
        }[]
      }
      approve_gift_card_acceptance_candidate: {
        Args: {
          p_acceptance: Json
          p_acceptance_id: string
          p_candidate_id: string
          p_reviewer: string
        }
        Returns: string
      }
      approve_gift_card_acceptance_removal: {
        Args: {
          p_candidate_id: string
          p_final_status?: string
          p_reviewer: string
          p_valid_until?: string
        }
        Returns: string
      }
      approve_gift_card_candidate: {
        Args: {
          p_candidate_id: string
          p_offer: Json
          p_offer_id: string
          p_reviewer: string
        }
        Returns: string
      }
      archive_expired_deals: {
        Args: { p_archived_at: string; p_today: string }
        Returns: number
      }
      archive_invalid_signal: {
        Args: { p_archived_at: string; p_reason: string; p_signal_id: string }
        Returns: boolean
      }
      archive_recheck_feed_item: {
        Args: {
          p_archive_reason: string
          p_checked_at: string
          p_feed_item_id: string
          p_run_id: string
          p_signal?: string
          p_source_identifier: string
          p_source_status: string
        }
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
      gift_card_prediction_fingerprint: {
        Args: {
          ends_at: string
          families: string[]
          seller: string
          starts_at: string
        }
        Returns: string
      }
      normalise_gift_card_prediction_identity_text: {
        Args: { value: string }
        Returns: string
      }
      purge_reviewed_feed_items: { Args: { p_cutoff: string }; Returns: number }
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
      submit_public_correction: {
        Args: {
          p_details: string
          p_entity_id: string
          p_entity_type: string
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
