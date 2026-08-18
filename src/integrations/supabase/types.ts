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
    PostgrestVersion: "14.15"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      account_deletion_requests: {
        Row: {
          cancelled_at: string | null
          completed_at: string | null
          completion_note: string | null
          id: string
          purge_after: string
          requested_at: string
          requester_email: string | null
          user_id: string
        }
        Insert: {
          cancelled_at?: string | null
          completed_at?: string | null
          completion_note?: string | null
          id?: string
          purge_after: string
          requested_at?: string
          requester_email?: string | null
          user_id: string
        }
        Update: {
          cancelled_at?: string | null
          completed_at?: string | null
          completion_note?: string | null
          id?: string
          purge_after?: string
          requested_at?: string
          requester_email?: string | null
          user_id?: string
        }
        Relationships: []
      }
      accounts: {
        Row: {
          bank: string | null
          bank_custom: string | null
          branch: string | null
          color: string | null
          created_at: string
          exp_month: string | null
          exp_year: string | null
          holder: string | null
          icon: string | null
          id: string
          last4: string | null
          name: string
          opening_balance: number | null
          opening_date: string | null
          purposes: string[] | null
          tenant_id: string
          type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          bank?: string | null
          bank_custom?: string | null
          branch?: string | null
          color?: string | null
          created_at?: string
          exp_month?: string | null
          exp_year?: string | null
          holder?: string | null
          icon?: string | null
          id?: string
          last4?: string | null
          name: string
          opening_balance?: number | null
          opening_date?: string | null
          purposes?: string[] | null
          tenant_id?: string
          type: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          bank?: string | null
          bank_custom?: string | null
          branch?: string | null
          color?: string | null
          created_at?: string
          exp_month?: string | null
          exp_year?: string | null
          holder?: string | null
          icon?: string | null
          id?: string
          last4?: string | null
          name?: string
          opening_balance?: number | null
          opening_date?: string | null
          purposes?: string[] | null
          tenant_id?: string
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          entity: string | null
          entity_id: string | null
          id: string
          metadata: Json | null
          tenant_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          metadata?: Json | null
          tenant_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          metadata?: Json | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          allocated: number
          bucket: string
          created_at: string
          id: string
          period: string
          period_start: string
          spent: number
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          allocated?: number
          bucket: string
          created_at?: string
          id?: string
          period?: string
          period_start?: string
          spent?: number
          tenant_id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          allocated?: number
          bucket?: string
          created_at?: string
          id?: string
          period?: string
          period_start?: string
          spent?: number
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string | null
          discount_percent: number | null
          expires_at: string | null
          id: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          description?: string | null
          discount_percent?: number | null
          expires_at?: string | null
          id?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          description?: string | null
          discount_percent?: number | null
          expires_at?: string | null
          id?: string
        }
        Relationships: []
      }
      debts: {
        Row: {
          category: string | null
          created_at: string
          currency: string
          duration: number
          first_due_date: string | null
          id: string
          installments: Json
          lender: string
          monthly: number
          notes: string | null
          tenant_id: string
          total_amount: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          currency?: string
          duration?: number
          first_due_date?: string | null
          id?: string
          installments?: Json
          lender: string
          monthly?: number
          notes?: string | null
          tenant_id?: string
          total_amount?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          currency?: string
          duration?: number
          first_due_date?: string | null
          id?: string
          installments?: Json
          lender?: string
          monthly?: number
          notes?: string | null
          tenant_id?: string
          total_amount?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "debts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      demat_accounts: {
        Row: {
          broker: string
          created_at: string
          currency: string
          id: string
          nickname: string | null
          opening_balance: number
          opening_date: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          broker: string
          created_at?: string
          currency?: string
          id?: string
          nickname?: string | null
          opening_balance?: number
          opening_date?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          broker?: string
          created_at?: string
          currency?: string
          id?: string
          nickname?: string | null
          opening_balance?: number
          opening_date?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "demat_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      demat_ledger: {
        Row: {
          amount: number
          created_at: string
          demat_account_id: string
          id: string
          note: string | null
          ref_investment_id: string | null
          tenant_id: string
          txn_date: string
          type: string
        }
        Insert: {
          amount: number
          created_at?: string
          demat_account_id: string
          id?: string
          note?: string | null
          ref_investment_id?: string | null
          tenant_id?: string
          txn_date?: string
          type: string
        }
        Update: {
          amount?: number
          created_at?: string
          demat_account_id?: string
          id?: string
          note?: string | null
          ref_investment_id?: string | null
          tenant_id?: string
          txn_date?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "demat_ledger_demat_account_id_fkey"
            columns: ["demat_account_id"]
            isOneToOne: false
            referencedRelation: "demat_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demat_ledger_ref_investment_id_fkey"
            columns: ["ref_investment_id"]
            isOneToOne: false
            referencedRelation: "investments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demat_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          category: string | null
          created_at: string
          currency: string
          current_amount: number
          id: string
          status: string
          target_amount: number
          target_date: string | null
          tenant_id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          currency?: string
          current_amount?: number
          id?: string
          status?: string
          target_amount: number
          target_date?: string | null
          tenant_id?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          currency?: string
          current_amount?: number
          id?: string
          status?: string
          target_amount?: number
          target_date?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      income_streams: {
        Row: {
          amount: number
          created_at: string
          currency: string
          display_order: number
          exchange_rate_to_inr: number
          frequency: string
          icon: string
          id: string
          is_visible: boolean
          name: string
          notes: string | null
          tenant_id: string
          type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          currency?: string
          display_order?: number
          exchange_rate_to_inr?: number
          frequency?: string
          icon?: string
          id?: string
          is_visible?: boolean
          name: string
          notes?: string | null
          tenant_id?: string
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          display_order?: number
          exchange_rate_to_inr?: number
          frequency?: string
          icon?: string
          id?: string
          is_visible?: boolean
          name?: string
          notes?: string | null
          tenant_id?: string
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "income_streams_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance: {
        Row: {
          category: string
          created_at: string
          document_data_url: string | null
          document_mime: string | null
          document_name: string | null
          document_path: string | null
          due_date: string | null
          has_legacy_document: boolean | null
          id: string
          notes: string | null
          pay_structure: string | null
          payment_frequency: string | null
          policy_name: string
          policy_number: string | null
          premium: number
          provider: string | null
          sum_insured: number
          tenant_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          category: string
          created_at?: string
          document_data_url?: string | null
          document_mime?: string | null
          document_name?: string | null
          document_path?: string | null
          due_date?: string | null
          has_legacy_document?: boolean | null
          id?: string
          notes?: string | null
          pay_structure?: string | null
          payment_frequency?: string | null
          policy_name: string
          policy_number?: string | null
          premium?: number
          provider?: string | null
          sum_insured?: number
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          document_data_url?: string | null
          document_mime?: string | null
          document_name?: string | null
          document_path?: string | null
          due_date?: string | null
          has_legacy_document?: boolean | null
          id?: string
          notes?: string | null
          pay_structure?: string | null
          payment_frequency?: string | null
          policy_name?: string
          policy_number?: string | null
          premium?: number
          provider?: string | null
          sum_insured?: number
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "insurance_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      investments: {
        Row: {
          asset: string
          bond_freq: string | null
          broker: string | null
          created_at: string
          currency: string
          derived: Json
          fields: Json
          goal: string | null
          gold_type: string | null
          id: string
          mf_mode: string | null
          saved_at: string
          tenant_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          asset: string
          bond_freq?: string | null
          broker?: string | null
          created_at?: string
          currency?: string
          derived?: Json
          fields?: Json
          goal?: string | null
          gold_type?: string | null
          id?: string
          mf_mode?: string | null
          saved_at?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          asset?: string
          bond_freq?: string | null
          broker?: string | null
          created_at?: string
          currency?: string
          derived?: Json
          fields?: Json
          goal?: string | null
          gold_type?: string | null
          id?: string
          mf_mode?: string | null
          saved_at?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "investments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          menu_overrides: Json | null
          revoked_at: string | null
          role: string
          tenant_id: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by?: string | null
          menu_overrides?: Json | null
          revoked_at?: string | null
          role: string
          tenant_id: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          menu_overrides?: Json | null
          revoked_at?: string | null
          role?: string
          tenant_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      net_worth_entries: {
        Row: {
          amount: number
          created_at: string
          grp: string
          id: string
          kind: string
          name: string
          tenant_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          grp: string
          id?: string
          kind: string
          name: string
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          grp?: string
          id?: string
          kind?: string
          name?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "net_worth_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      net_worth_snapshots: {
        Row: {
          assets: number
          captured_on: string
          created_at: string
          id: string
          liabilities: number
          net_worth: number
          tenant_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          assets?: number
          captured_on?: string
          created_at?: string
          id?: string
          liabilities?: number
          net_worth?: number
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          assets?: number
          captured_on?: string
          created_at?: string
          id?: string
          liabilities?: number
          net_worth?: number
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "net_worth_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          payload: Json | null
          read_at: string | null
          tenant_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          payload?: Json | null
          read_at?: string | null
          tenant_id?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          payload?: Json | null
          read_at?: string | null
          tenant_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          currency: string
          id: string
          interval: string
          is_active: boolean
          is_default: boolean
          limits: Json | null
          menu_set: Json
          name: string
          paddle_price_id: string | null
          price_cents: number
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          interval?: string
          is_active?: boolean
          is_default?: boolean
          limits?: Json | null
          menu_set?: Json
          name: string
          paddle_price_id?: string | null
          price_cents?: number
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          interval?: string
          is_active?: boolean
          is_default?: boolean
          limits?: Json | null
          menu_set?: Json
          name?: string
          paddle_price_id?: string | null
          price_cents?: number
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          created_at: string
          po_number_id: string | null
          po_user_id: string | null
          secret_hash: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          po_number_id?: string | null
          po_user_id?: string | null
          secret_hash?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          po_number_id?: string | null
          po_user_id?: string | null
          secret_hash?: string | null
          user_id?: string
        }
        Relationships: []
      }
      price_cache: {
        Row: {
          fetched_at: string
          key: string
          price: number
          provider: string
          symbol: string
        }
        Insert: {
          fetched_at?: string
          key: string
          price: number
          provider: string
          symbol: string
        }
        Update: {
          fetched_at?: string
          key?: string
          price?: number
          provider?: string
          symbol?: string
        }
        Relationships: []
      }
      processed_webhooks: {
        Row: {
          event_id: string
          received_at: string
        }
        Insert: {
          event_id: string
          received_at?: string
        }
        Update: {
          event_id?: string
          received_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          legal_accepted_at: string | null
          legal_version: string | null
          mobile: string | null
          onboarding_completed: boolean
          onboarding_selections: Json
          onboarding_step: number
          updated_at: string
          username: string | null
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          legal_accepted_at?: string | null
          legal_version?: string | null
          mobile?: string | null
          onboarding_completed?: boolean
          onboarding_selections?: Json
          onboarding_step?: number
          updated_at?: string
          username?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          legal_accepted_at?: string | null
          legal_version?: string | null
          mobile?: string | null
          onboarding_completed?: boolean
          onboarding_selections?: Json
          onboarding_step?: number
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      recurring_items: {
        Row: {
          amount: number
          category: string
          created_at: string
          currency: string
          frequency: string
          fx_rate: number
          icon: string | null
          id: string
          is_active: boolean
          last_generated_at: string | null
          name: string
          next_due_date: string
          notes: string | null
          subtype: string | null
          tenant_id: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          category: string
          created_at?: string
          currency?: string
          frequency?: string
          fx_rate?: number
          icon?: string | null
          id?: string
          is_active?: boolean
          last_generated_at?: string | null
          name: string
          next_due_date?: string
          notes?: string | null
          subtype?: string | null
          tenant_id?: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          currency?: string
          frequency?: string
          fx_rate?: number
          icon?: string | null
          id?: string
          is_active?: boolean
          last_generated_at?: string | null
          name?: string
          next_due_date?: string
          notes?: string | null
          subtype?: string | null
          tenant_id?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_reminders: {
        Row: {
          created_at: string
          days_before: number
          enabled: boolean
          id: string
          note: string | null
          recurring_item_id: string
          tenant_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          days_before?: number
          enabled?: boolean
          id?: string
          note?: string | null
          recurring_item_id: string
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          days_before?: number
          enabled?: boolean
          id?: string
          note?: string | null
          recurring_item_id?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_reminders_recurring_item_id_fkey"
            columns: ["recurring_item_id"]
            isOneToOne: false
            referencedRelation: "recurring_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_reminders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      reminders: {
        Row: {
          amount: number | null
          context: string
          created_at: string
          currency: string | null
          debt: Json | null
          due_date: string
          frequency: string | null
          grace: string | null
          id: string
          maturity_leads: Json | null
          notes: string | null
          source: string | null
          source_id: string | null
          status: string
          tenant_id: string
          title: string
          updated_at: string
          user_id: string | null
          verify_liquidity: boolean | null
        }
        Insert: {
          amount?: number | null
          context: string
          created_at?: string
          currency?: string | null
          debt?: Json | null
          due_date: string
          frequency?: string | null
          grace?: string | null
          id?: string
          maturity_leads?: Json | null
          notes?: string | null
          source?: string | null
          source_id?: string | null
          status?: string
          tenant_id?: string
          title: string
          updated_at?: string
          user_id?: string | null
          verify_liquidity?: boolean | null
        }
        Update: {
          amount?: number | null
          context?: string
          created_at?: string
          currency?: string | null
          debt?: Json | null
          due_date?: string
          frequency?: string | null
          grace?: string | null
          id?: string
          maturity_leads?: Json | null
          notes?: string | null
          source?: string | null
          source_id?: string | null
          status?: string
          tenant_id?: string
          title?: string
          updated_at?: string
          user_id?: string | null
          verify_liquidity?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "reminders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      retention_policy: {
        Row: {
          days: number
          description: string
          key: string
          updated_at: string
        }
        Insert: {
          days: number
          description: string
          key: string
          updated_at?: string
        }
        Update: {
          days?: number
          description?: string
          key?: string
          updated_at?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      storage_purge_queue: {
        Row: {
          bucket_id: string
          completed_at: string | null
          id: string
          last_error: string | null
          object_count: number | null
          path_prefix: string
          requested_at: string
          tenant_id: string
        }
        Insert: {
          bucket_id: string
          completed_at?: string | null
          id?: string
          last_error?: string | null
          object_count?: number | null
          path_prefix: string
          requested_at?: string
          tenant_id: string
        }
        Update: {
          bucket_id?: string
          completed_at?: string | null
          id?: string
          last_error?: string | null
          object_count?: number | null
          path_prefix?: string
          requested_at?: string
          tenant_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          billing_interval: string | null
          cancel_at: string | null
          canceled_at: string | null
          created_at: string
          currency: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          paddle_customer_id: string | null
          paddle_price_id: string | null
          paddle_product_id: string | null
          paddle_subscription_id: string | null
          plan_id: string | null
          plan_name: string | null
          provider: string
          raw: Json | null
          status: string
          tenant_id: string | null
          unit_amount: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_interval?: string | null
          cancel_at?: string | null
          canceled_at?: string | null
          created_at?: string
          currency?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          paddle_customer_id?: string | null
          paddle_price_id?: string | null
          paddle_product_id?: string | null
          paddle_subscription_id?: string | null
          plan_id?: string | null
          plan_name?: string | null
          provider?: string
          raw?: Json | null
          status?: string
          tenant_id?: string | null
          unit_amount?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_interval?: string | null
          cancel_at?: string | null
          canceled_at?: string | null
          created_at?: string
          currency?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          paddle_customer_id?: string | null
          paddle_price_id?: string | null
          paddle_product_id?: string | null
          paddle_subscription_id?: string | null
          plan_id?: string | null
          plan_name?: string | null
          provider?: string
          raw?: Json | null
          status?: string
          tenant_id?: string | null
          unit_amount?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_members: {
        Row: {
          created_at: string
          invited_by: string | null
          menu_overrides: Json | null
          role: string
          status: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          invited_by?: string | null
          menu_overrides?: Json | null
          role?: string
          status?: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          invited_by?: string | null
          menu_overrides?: Json | null
          role?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_settings: {
        Row: {
          key: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "tenant_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          menu_overrides: Json | null
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          menu_overrides?: Json | null
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          menu_overrides?: Json | null
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      tracked_subscriptions: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          currency: string
          frequency: string
          icon: string | null
          id: string
          name: string
          renewal_date: string | null
          status: string
          tenant_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount?: number
          category?: string | null
          created_at?: string
          currency?: string
          frequency: string
          icon?: string | null
          id?: string
          name: string
          renewal_date?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          currency?: string
          frequency?: string
          icon?: string | null
          id?: string
          name?: string
          renewal_date?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tracked_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          account_id: string | null
          amount: number
          category: string
          created_at: string
          currency: string
          description: string | null
          id: string
          import_hash: string | null
          occurred_at: string
          payment_mode: string | null
          source_recurring_id: string | null
          tenant_id: string
          transfer_to_account_id: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          category: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          import_hash?: string | null
          occurred_at?: string
          payment_mode?: string | null
          source_recurring_id?: string | null
          tenant_id?: string
          transfer_to_account_id?: string | null
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          category?: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          import_hash?: string | null
          occurred_at?: string
          payment_mode?: string | null
          source_recurring_id?: string | null
          tenant_id?: string
          transfer_to_account_id?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_transfer_to_account_id_fkey"
            columns: ["transfer_to_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          allocation: Json
          archived_at: string | null
          companions: Json
          created_at: string
          days: number
          expenses: Json
          id: string
          kind: string
          name: string
          start_date: string | null
          status: string
          tenant_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          allocation?: Json
          archived_at?: string | null
          companions?: Json
          created_at?: string
          days?: number
          expenses?: Json
          id?: string
          kind: string
          name: string
          start_date?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          allocation?: Json
          archived_at?: string | null
          companions?: Json
          created_at?: string
          days?: number
          expenses?: Json
          id?: string
          kind?: string
          name?: string
          start_date?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trips_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: { Args: { p_token: string }; Returns: Json }
      all_feature_menus: { Args: never; Returns: string[] }
      budget_set_allocation: {
        Args: {
          p_allocated: number
          p_bucket: string
          p_period?: string
          p_period_start?: string
          p_tenant_id: string
        }
        Returns: {
          allocated: number
          bucket: string
          created_at: string
          id: string
          period: string
          period_start: string
          spent: number
          tenant_id: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "budgets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      budget_spend: { Args: { p_tenant_id: string }; Returns: Json }
      cancel_account_deletion: { Args: never; Returns: undefined }
      claim_invitations_for_user: {
        Args: { p_user_id: string }
        Returns: number
      }
      complete_account_deletion: {
        Args: { p_id: string; p_note: string }
        Returns: undefined
      }
      complete_storage_purge: {
        Args: { p_error?: string; p_id: string }
        Returns: undefined
      }
      create_invitation: {
        Args: {
          p_email: string
          p_menus?: Json
          p_role: string
          p_tenant_id: string
        }
        Returns: {
          expires_at: string
          invitation_id: string
          token: string
        }[]
      }
      create_notification: {
        Args: {
          p_body?: string
          p_payload?: Json
          p_tenant_id: string
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: undefined
      }
      current_tenant_id: { Args: never; Returns: string }
      dashboard_summary: {
        Args: { p_months?: number; p_tenant_id: string; p_tz?: string }
        Returns: Json
      }
      default_plan: {
        Args: never
        Returns: {
          created_at: string
          currency: string
          id: string
          interval: string
          is_active: boolean
          is_default: boolean
          limits: Json | null
          menu_set: Json
          name: string
          paddle_price_id: string | null
          price_cents: number
        }
        SetofOptions: {
          from: "*"
          to: "plans"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      expire_subscriptions: { Args: never; Returns: undefined }
      get_effective_menus: { Args: { p_tenant_id: string }; Returns: string[] }
      goal_contribute: {
        Args: { p_amount: number; p_goal_id: string }
        Returns: Json
      }
      has_menu: {
        Args: { p_menu: string; p_tenant_id: string }
        Returns: boolean
      }
      invite_member: {
        Args: {
          p_email: string
          p_menus?: Json
          p_role: string
          p_tenant_id: string
        }
        Returns: string
      }
      is_platform_admin: { Args: never; Returns: boolean }
      is_tenant_member: {
        Args: { p_min_role?: string; p_tenant_id: string }
        Returns: boolean
      }
      list_invitations: {
        Args: { p_tenant_id: string }
        Returns: {
          accepted_at: string
          created_at: string
          email: string
          expires_at: string
          id: string
          role: string
          status: string
        }[]
      }
      list_tenant_members: {
        Args: { p_tenant_id: string }
        Returns: {
          display_name: string
          email: string
          menu_overrides: Json
          role: string
          status: string
          user_id: string
          username: string
        }[]
      }
      log_audit: {
        Args: {
          p_action: string
          p_entity: string
          p_entity_id: string
          p_metadata?: Json
          p_tenant_id: string
        }
        Returns: undefined
      }
      mark_all_notifications_read: { Args: never; Returns: undefined }
      mark_recurring_generated: { Args: { p_item_id: string }; Returns: Json }
      notify_expiring_subscriptions: {
        Args: { p_days?: number }
        Returns: undefined
      }
      plan_menus: { Args: { p_tenant_id: string }; Returns: string[] }
      po_assign_plan: {
        Args: { p_plan_id: string; p_tenant_id: string }
        Returns: undefined
      }
      po_audit_log: {
        Args: { p_limit?: number }
        Returns: {
          action: string
          actor_email: string
          created_at: string
          entity: string
          entity_id: string
          id: string
          metadata: Json
          tenant_name: string
        }[]
      }
      po_create_coupon: {
        Args: {
          p_code: string
          p_description: string
          p_discount_percent: number
          p_expires_at?: string
        }
        Returns: string
      }
      po_create_tenant: {
        Args: { p_name: string; p_owner_email: string }
        Returns: string
      }
      po_dashboard_stats: { Args: never; Returns: Json }
      po_delete_coupon: { Args: { p_id: string }; Returns: undefined }
      po_delete_tenant: { Args: { p_tenant_id: string }; Returns: undefined }
      po_get_identifiers: {
        Args: never
        Returns: {
          po_number_id: string
          po_user_id: string
        }[]
      }
      po_has_secret: { Args: never; Returns: boolean }
      po_list_coupons: {
        Args: never
        Returns: {
          active: boolean
          code: string
          created_at: string
          description: string | null
          discount_percent: number | null
          expires_at: string | null
          id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "coupons"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      po_list_deleted_tenants: {
        Args: never
        Returns: {
          days_left: number
          deleted_at: string
          id: string
          name: string
          purge_after: string
        }[]
      }
      po_list_tenants: {
        Args: never
        Returns: {
          created_at: string
          id: string
          member_count: number
          name: string
          owner_email: string
          plan_name: string
          status: string
          sub_status: string
        }[]
      }
      po_pending_account_deletions: {
        Args: never
        Returns: {
          id: string
          owned_tenants: number
          purge_after: string
          requested_at: string
          requester_email: string
          user_id: string
        }[]
      }
      po_pending_storage_purges: {
        Args: never
        Returns: {
          bucket_id: string
          id: string
          last_error: string
          object_count: number
          path_prefix: string
          requested_at: string
          tenant_id: string
        }[]
      }
      po_purge_tenant: { Args: { p_tenant_id: string }; Returns: Json }
      po_recent_activity: {
        Args: { p_limit?: number }
        Returns: {
          action: string
          actor_email: string
          created_at: string
          entity: string
          id: string
          tenant_name: string
        }[]
      }
      po_resolve_identifier: {
        Args: { p_identifier: string }
        Returns: {
          email: string
          user_id: string
        }[]
      }
      po_restore_tenant: { Args: { p_tenant_id: string }; Returns: undefined }
      po_revoke_secret: { Args: never; Returns: undefined }
      po_set_coupon_active: {
        Args: { p_active: boolean; p_id: string }
        Returns: undefined
      }
      po_set_identifiers: {
        Args: { p_number_id?: string; p_user_id?: string }
        Returns: undefined
      }
      po_set_plan_menus: {
        Args: { p_menus: Json; p_plan_id: string }
        Returns: undefined
      }
      po_set_plan_paddle_price_id: {
        Args: { p_paddle_price_id: string; p_plan_id: string }
        Returns: undefined
      }
      po_set_plan_price: {
        Args: {
          p_currency?: string
          p_interval?: string
          p_plan_id: string
          p_price_cents: number
        }
        Returns: undefined
      }
      po_set_secret: { Args: { p_secret: string }; Returns: undefined }
      po_set_site_setting: {
        Args: { p_key: string; p_value: Json }
        Returns: undefined
      }
      po_set_tenant_menus: {
        Args: { p_menus: Json; p_tenant_id: string }
        Returns: undefined
      }
      po_set_tenant_status: {
        Args: { p_status: string; p_tenant_id: string }
        Returns: undefined
      }
      po_tenant_activity_months: {
        Args: { p_months?: number }
        Returns: {
          events: number
          month: string
          tenant_id: string
        }[]
      }
      po_tenant_engagement: {
        Args: never
        Returns: {
          active_members: number
          first_budget_at: string
          first_goal_at: string
          first_transaction_at: string
          last_activity_at: string
          last_sign_in_at: string
          tenant_id: string
          transaction_count: number
        }[]
      }
      po_verify_secret: {
        Args: { p_identifier: string; p_secret: string }
        Returns: {
          email: string
          user_id: string
        }[]
      }
      prune_expired_data: { Args: never; Returns: Json }
      purge_expired_tenants: { Args: never; Returns: Json }
      purge_tenant_storage: { Args: { p_tenant_id: string }; Returns: number }
      record_legal_acceptance: {
        Args: { p_version: string }
        Returns: undefined
      }
      request_account_deletion: {
        Args: never
        Returns: {
          cancelled_at: string | null
          completed_at: string | null
          completion_note: string | null
          id: string
          purge_after: string
          requested_at: string
          requester_email: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "account_deletion_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      revoke_invitation: {
        Args: { p_invitation_id: string }
        Returns: undefined
      }
      revoke_member: {
        Args: { p_tenant_id: string; p_user_id: string }
        Returns: undefined
      }
      set_member_menus: {
        Args: { p_menus: Json; p_tenant_id: string; p_user_id: string }
        Returns: undefined
      }
      storage_object_tenant: { Args: { p_name: string }; Returns: string }
      tenant_subscription_status: {
        Args: { p_tenant_id: string }
        Returns: {
          current_period_end: string
          plan_name: string
          provider: string
          status: string
        }[]
      }
      update_member_role: {
        Args: { p_role: string; p_tenant_id: string; p_user_id: string }
        Returns: undefined
      }
      upgradeable_plans: {
        Args: never
        Returns: {
          currency: string
          id: string
          interval: string
          name: string
          paddle_price_id: string
          price_cents: number
        }[]
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
