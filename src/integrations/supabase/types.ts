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
      classification_feedback: {
        Row: {
          account_description: string
          company_id: string
          corrected_category: string
          created_at: string
          created_by: string | null
          embedding: string | null
          id: string
          normalized_description: string
          suggested_category: string | null
          user_feedback: string | null
        }
        Insert: {
          account_description: string
          company_id: string
          corrected_category: string
          created_at?: string
          created_by?: string | null
          embedding?: string | null
          id?: string
          normalized_description: string
          suggested_category?: string | null
          user_feedback?: string | null
        }
        Update: {
          account_description?: string
          company_id?: string
          corrected_category?: string
          created_at?: string
          created_by?: string | null
          embedding?: string | null
          id?: string
          normalized_description?: string
          suggested_category?: string | null
          user_feedback?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "classification_feedback_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      column_mappings: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          company_id: string | null
          confidence: number | null
          created_at: string
          id: string
          normalised_column_name: string | null
          reasoning: string | null
          sample_values: Json | null
          source: string | null
          source_column_name: string
          source_system: string | null
          standard_field: string | null
          status: string | null
          suggested_field: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string | null
          confidence?: number | null
          created_at?: string
          id?: string
          normalised_column_name?: string | null
          reasoning?: string | null
          sample_values?: Json | null
          source?: string | null
          source_column_name: string
          source_system?: string | null
          standard_field?: string | null
          status?: string | null
          suggested_field?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string | null
          confidence?: number | null
          created_at?: string
          id?: string
          normalised_column_name?: string | null
          reasoning?: string | null
          sample_values?: Json | null
          source?: string | null
          source_column_name?: string
          source_system?: string | null
          standard_field?: string | null
          status?: string | null
          suggested_field?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "column_mappings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          accounting_system: string | null
          city: string | null
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          slug: string | null
          updated_at: string
        }
        Insert: {
          accounting_system?: string | null
          city?: string | null
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          slug?: string | null
          updated_at?: string
        }
        Update: {
          accounting_system?: string | null
          city?: string | null
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          slug?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      company_members: {
        Row: {
          company_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      covenants: {
        Row: {
          breach_warning_pct: number | null
          company_id: string
          created_at: string
          current_value: number | null
          id: string
          measured_period: string | null
          metric: string
          threshold: number
          updated_at: string
        }
        Insert: {
          breach_warning_pct?: number | null
          company_id: string
          created_at?: string
          current_value?: number | null
          id?: string
          measured_period?: string | null
          metric: string
          threshold: number
          updated_at?: string
        }
        Update: {
          breach_warning_pct?: number | null
          company_id?: string
          created_at?: string
          current_value?: number | null
          id?: string
          measured_period?: string | null
          metric?: string
          threshold?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "covenants_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          avg_payment_lag_days: number | null
          company_id: string
          created_at: string
          customer_code: string | null
          customer_type: string
          id: string
          name: string
          payment_count: number | null
          updated_at: string
        }
        Insert: {
          avg_payment_lag_days?: number | null
          company_id: string
          created_at?: string
          customer_code?: string | null
          customer_type?: string
          id?: string
          name: string
          payment_count?: number | null
          updated_at?: string
        }
        Update: {
          avg_payment_lag_days?: number | null
          company_id?: string
          created_at?: string
          customer_code?: string | null
          customer_type?: string
          id?: string
          name?: string
          payment_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      file_uploads: {
        Row: {
          column_map: Json | null
          company_id: string | null
          failed_rows: number | null
          file_structure: string | null
          filename: string | null
          id: string
          parse_quality_score: number | null
          parsed_rows: number | null
          status: string | null
          total_rows: number | null
          updated_at: string
          uploaded_at: string
          uploaded_by: string | null
          warnings: Json | null
        }
        Insert: {
          column_map?: Json | null
          company_id?: string | null
          failed_rows?: number | null
          file_structure?: string | null
          filename?: string | null
          id?: string
          parse_quality_score?: number | null
          parsed_rows?: number | null
          status?: string | null
          total_rows?: number | null
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
          warnings?: Json | null
        }
        Update: {
          column_map?: Json | null
          company_id?: string | null
          failed_rows?: number | null
          file_structure?: string | null
          filename?: string | null
          id?: string
          parse_quality_score?: number | null
          parsed_rows?: number | null
          status?: string | null
          total_rows?: number | null
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
          warnings?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "file_uploads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      forecast_runs: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          run_date: string
          starting_balance: number
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          run_date?: string
          starting_balance?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          run_date?: string
          starting_balance?: number
        }
        Relationships: [
          {
            foreignKeyName: "forecast_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      forecast_weeks: {
        Row: {
          anomaly_flags: Json
          audit_json: Json
          cash_in: number
          cash_out: number
          company_id: string
          confidence_score: number
          covenant_headroom: number | null
          covenant_status: string | null
          created_at: string
          driver_materials_outflow: number | null
          driver_milestone_billing: number | null
          driver_payment_lag_adjustment: number | null
          driver_subcontractor_payments: number | null
          driver_weather_impact: number | null
          forecast_run_id: string | null
          id: string
          is_frost: boolean | null
          lost_days: number | null
          net_cash: number
          rain_mm: number | null
          running_balance: number
          scenario: string
          week_end: string | null
          week_number: number
          week_start: string
        }
        Insert: {
          anomaly_flags?: Json
          audit_json?: Json
          cash_in?: number
          cash_out?: number
          company_id: string
          confidence_score?: number
          covenant_headroom?: number | null
          covenant_status?: string | null
          created_at?: string
          driver_materials_outflow?: number | null
          driver_milestone_billing?: number | null
          driver_payment_lag_adjustment?: number | null
          driver_subcontractor_payments?: number | null
          driver_weather_impact?: number | null
          forecast_run_id?: string | null
          id?: string
          is_frost?: boolean | null
          lost_days?: number | null
          net_cash?: number
          rain_mm?: number | null
          running_balance?: number
          scenario?: string
          week_end?: string | null
          week_number: number
          week_start: string
        }
        Update: {
          anomaly_flags?: Json
          audit_json?: Json
          cash_in?: number
          cash_out?: number
          company_id?: string
          confidence_score?: number
          covenant_headroom?: number | null
          covenant_status?: string | null
          created_at?: string
          driver_materials_outflow?: number | null
          driver_milestone_billing?: number | null
          driver_payment_lag_adjustment?: number | null
          driver_subcontractor_payments?: number | null
          driver_weather_impact?: number | null
          forecast_run_id?: string | null
          id?: string
          is_frost?: boolean | null
          lost_days?: number | null
          net_cash?: number
          rain_mm?: number | null
          running_balance?: number
          scenario?: string
          week_end?: string | null
          week_number?: number
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "forecast_weeks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forecast_weeks_forecast_run_id_fkey"
            columns: ["forecast_run_id"]
            isOneToOne: false
            referencedRelation: "forecast_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      gl_mappings: {
        Row: {
          account_description: string
          account_number: string | null
          approved: boolean
          approved_at: string | null
          approved_by: string | null
          company_id: string
          confidence: number
          created_at: string
          embedding: string | null
          id: string
          needs_review: boolean
          normalized_description: string
          reasoning: string | null
          source: string
          standardized_category: string
          updated_at: string
        }
        Insert: {
          account_description: string
          account_number?: string | null
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          company_id: string
          confidence?: number
          created_at?: string
          embedding?: string | null
          id?: string
          needs_review?: boolean
          normalized_description: string
          reasoning?: string | null
          source?: string
          standardized_category: string
          updated_at?: string
        }
        Update: {
          account_description?: string
          account_number?: string | null
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string
          confidence?: number
          created_at?: string
          embedding?: string | null
          id?: string
          needs_review?: boolean
          normalized_description?: string
          reasoning?: string | null
          source?: string
          standardized_category?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gl_mappings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          customer_id: string | null
          due_date: string | null
          external_ref: string | null
          gl_category: string | null
          id: string
          invoice_date: string
          is_recurring: boolean
          milestone_id: string | null
          project_id: string | null
          recurrence_type: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          customer_id?: string | null
          due_date?: string | null
          external_ref?: string | null
          gl_category?: string | null
          id?: string
          invoice_date: string
          is_recurring?: boolean
          milestone_id?: string | null
          project_id?: string | null
          recurrence_type?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          customer_id?: string | null
          due_date?: string | null
          external_ref?: string | null
          gl_category?: string | null
          id?: string
          invoice_date?: string
          is_recurring?: boolean
          milestone_id?: string | null
          project_id?: string | null
          recurrence_type?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      labour: {
        Row: {
          company_id: string
          cost: number
          created_at: string
          hours: number | null
          id: string
          project_id: string
          week_date: string
        }
        Insert: {
          company_id: string
          cost?: number
          created_at?: string
          hours?: number | null
          id?: string
          project_id: string
          week_date: string
        }
        Update: {
          company_id?: string
          cost?: number
          created_at?: string
          hours?: number | null
          id?: string
          project_id?: string
          week_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "labour_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labour_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mapping_history: {
        Row: {
          changed_by: string | null
          company_id: string
          created_at: string
          gl_mapping_id: string
          id: string
          new_category: string
          old_category: string | null
        }
        Insert: {
          changed_by?: string | null
          company_id: string
          created_at?: string
          gl_mapping_id: string
          id?: string
          new_category: string
          old_category?: string | null
        }
        Update: {
          changed_by?: string | null
          company_id?: string
          created_at?: string
          gl_mapping_id?: string
          id?: string
          new_category?: string
          old_category?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mapping_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mapping_history_gl_mapping_id_fkey"
            columns: ["gl_mapping_id"]
            isOneToOne: false
            referencedRelation: "gl_mappings"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: {
          company_id: string
          cost: number
          created_at: string
          description: string | null
          id: string
          milestone_id: string | null
          order_date: string | null
          project_id: string
        }
        Insert: {
          company_id: string
          cost?: number
          created_at?: string
          description?: string | null
          id?: string
          milestone_id?: string | null
          order_date?: string | null
          project_id: string
        }
        Update: {
          company_id?: string
          cost?: number
          created_at?: string
          description?: string | null
          id?: string
          milestone_id?: string | null
          order_date?: string | null
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "materials_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materials_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materials_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      milestones: {
        Row: {
          company_id: string
          created_at: string
          days_delayed: number | null
          delay_reason: string | null
          id: string
          invoice_amount: number
          invoiced: boolean | null
          labour_cost: number | null
          materials_cost: number | null
          name: string
          paid: boolean | null
          planned_date: string
          project_id: string
          shifted_date: string | null
          subcontractor_cost: number | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          days_delayed?: number | null
          delay_reason?: string | null
          id?: string
          invoice_amount?: number
          invoiced?: boolean | null
          labour_cost?: number | null
          materials_cost?: number | null
          name: string
          paid?: boolean | null
          planned_date: string
          project_id: string
          shifted_date?: string | null
          subcontractor_cost?: number | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          days_delayed?: number | null
          delay_reason?: string | null
          id?: string
          invoice_amount?: number
          invoiced?: boolean | null
          labour_cost?: number | null
          materials_cost?: number | null
          name?: string
          paid?: boolean | null
          planned_date?: string
          project_id?: string
          shifted_date?: string | null
          subcontractor_cost?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "milestones_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_summaries: {
        Row: {
          account_code: string | null
          account_description: string
          company_id: string
          created_at: string
          id: string
          period: string
          source_file: string | null
          total_credit: number
          total_debet: number
          updated_at: string
        }
        Insert: {
          account_code?: string | null
          account_description: string
          company_id: string
          created_at?: string
          id?: string
          period: string
          source_file?: string | null
          total_credit?: number
          total_debet?: number
          updated_at?: string
        }
        Update: {
          account_code?: string | null
          account_description?: string
          company_id?: string
          created_at?: string
          id?: string
          period?: string
          source_file?: string | null
          total_credit?: number
          total_debet?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_summaries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          id: string
          invoice_id: string
          payment_date: string
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          id?: string
          invoice_id: string
          payment_date: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          id?: string
          invoice_id?: string
          payment_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          city: string | null
          client_name: string | null
          client_type: string | null
          company_id: string
          contractor: string | null
          created_at: string
          customer_id: string | null
          end_date: string | null
          id: string
          name: string
          region: string | null
          start_date: string | null
          status: string
          total_labour_cost: number
          total_materials_cost: number | null
          total_value: number | null
          updated_at: string
          weather_sensitive: boolean | null
          wip_amount: number | null
        }
        Insert: {
          city?: string | null
          client_name?: string | null
          client_type?: string | null
          company_id: string
          contractor?: string | null
          created_at?: string
          customer_id?: string | null
          end_date?: string | null
          id?: string
          name: string
          region?: string | null
          start_date?: string | null
          status?: string
          total_labour_cost?: number
          total_materials_cost?: number | null
          total_value?: number | null
          updated_at?: string
          weather_sensitive?: boolean | null
          wip_amount?: number | null
        }
        Update: {
          city?: string | null
          client_name?: string | null
          client_type?: string | null
          company_id?: string
          contractor?: string | null
          created_at?: string
          customer_id?: string | null
          end_date?: string | null
          id?: string
          name?: string
          region?: string | null
          start_date?: string | null
          status?: string
          total_labour_cost?: number
          total_materials_cost?: number | null
          total_value?: number | null
          updated_at?: string
          weather_sensitive?: boolean | null
          wip_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      subcontractors: {
        Row: {
          company_id: string
          completion_date: string | null
          cost: number
          created_at: string
          id: string
          milestone_id: string | null
          name: string | null
          payment_lag_days: number
          project_id: string
        }
        Insert: {
          company_id: string
          completion_date?: string | null
          cost?: number
          created_at?: string
          id?: string
          milestone_id?: string | null
          name?: string | null
          payment_lag_days?: number
          project_id: string
        }
        Update: {
          company_id?: string
          completion_date?: string | null
          cost?: number
          created_at?: string
          id?: string
          milestone_id?: string | null
          name?: string | null
          payment_lag_days?: number
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subcontractors_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontractors_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontractors_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          company_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      weather_cache: {
        Row: {
          company_id: string
          confidence: number
          consensus_mm: number | null
          fetched_at: string
          frost_flag: boolean
          id: string
          lost_days: number
          min_temp_c: number | null
          open_meteo_mm: number | null
          openweather_mm: number | null
          region: string
          week_start: string
        }
        Insert: {
          company_id: string
          confidence?: number
          consensus_mm?: number | null
          fetched_at?: string
          frost_flag?: boolean
          id?: string
          lost_days?: number
          min_temp_c?: number | null
          open_meteo_mm?: number | null
          openweather_mm?: number | null
          region: string
          week_start: string
        }
        Update: {
          company_id?: string
          confidence?: number
          consensus_mm?: number | null
          fetched_at?: string
          frost_flag?: boolean
          id?: string
          lost_days?: number
          min_temp_c?: number | null
          open_meteo_mm?: number | null
          openweather_mm?: number | null
          region?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "weather_cache_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _company_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_company_member: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      match_gl_mappings: {
        Args: {
          match_company_id: string
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          account_description: string
          id: string
          similarity: number
          standardized_category: string
        }[]
      }
      user_company_id: { Args: { _user_id: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "member"
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
    Enums: {
      app_role: ["admin", "member"],
    },
  },
} as const
