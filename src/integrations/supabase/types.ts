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
      accounts_payable: {
        Row: {
          amount: number
          business_id: string
          created_at: string
          due_date: string | null
          id: string
          notes: string | null
          paid: number
          purchase_order_id: string | null
          status: string
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          business_id: string
          created_at?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          paid?: number
          purchase_order_id?: string | null
          status?: string
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          paid?: number
          purchase_order_id?: string | null
          status?: string
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_payable_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_payable_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_payable_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts_receivable: {
        Row: {
          amount: number
          business_id: string
          created_at: string
          customer_id: string | null
          due_date: string | null
          id: string
          notes: string | null
          paid: number
          sale_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          business_id: string
          created_at?: string
          customer_id?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          paid?: number
          sale_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string
          customer_id?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          paid?: number
          sale_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_receivable_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_receivable_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_receivable_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_applications: {
        Row: {
          audience: string | null
          company: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          motivation: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          audience?: string | null
          company?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          motivation?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          audience?: string | null
          company?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          motivation?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: []
      }
      affiliate_clicks: {
        Row: {
          created_at: string
          id: string
          landing_path: string | null
          partner_id: string | null
          referral_code: string
          referrer: string | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          landing_path?: string | null
          partner_id?: string | null
          referral_code: string
          referrer?: string | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          landing_path?: string | null
          partner_id?: string | null
          referral_code?: string
          referrer?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_clicks_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "affiliate_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_commissions: {
        Row: {
          business_id: string | null
          commission_amount: number
          commission_rate: number
          created_at: string
          currency: string
          cycle_key: string | null
          discount_amount: number
          entry_type: string
          external_reference: string | null
          gross_amount: number
          id: string
          invoice_id: string | null
          net_amount: number
          note: string | null
          partner_id: string
          payment_id: string | null
          payout_id: string | null
          period_index: number
          referral_id: string | null
          reverses_id: string | null
          source_type: string
          status: string
          subscription_id: string | null
          updated_at: string
        }
        Insert: {
          business_id?: string | null
          commission_amount?: number
          commission_rate?: number
          created_at?: string
          currency?: string
          cycle_key?: string | null
          discount_amount?: number
          entry_type?: string
          external_reference?: string | null
          gross_amount?: number
          id?: string
          invoice_id?: string | null
          net_amount?: number
          note?: string | null
          partner_id: string
          payment_id?: string | null
          payout_id?: string | null
          period_index?: number
          referral_id?: string | null
          reverses_id?: string | null
          source_type?: string
          status?: string
          subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string | null
          commission_amount?: number
          commission_rate?: number
          created_at?: string
          currency?: string
          cycle_key?: string | null
          discount_amount?: number
          entry_type?: string
          external_reference?: string | null
          gross_amount?: number
          id?: string
          invoice_id?: string | null
          net_amount?: number
          note?: string | null
          partner_id?: string
          payment_id?: string | null
          payout_id?: string | null
          period_index?: number
          referral_id?: string | null
          reverses_id?: string | null
          source_type?: string
          status?: string
          subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_commissions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_commissions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "billing_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_commissions_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "affiliate_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_commissions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "subscription_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_commissions_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "affiliate_payouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_commissions_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "affiliate_referrals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_commissions_reverses_id_fkey"
            columns: ["reverses_id"]
            isOneToOne: false
            referencedRelation: "affiliate_commissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_commissions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_partners: {
        Row: {
          application_id: string | null
          approved_at: string
          commission_duration: string
          commission_rate: number
          company: string | null
          created_at: string
          display_name: string
          email: string
          id: string
          notes: string | null
          payout_details: Json
          payout_method: string | null
          referral_code: string
          status: string
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          application_id?: string | null
          approved_at?: string
          commission_duration?: string
          commission_rate?: number
          company?: string | null
          created_at?: string
          display_name: string
          email: string
          id?: string
          notes?: string | null
          payout_details?: Json
          payout_method?: string | null
          referral_code: string
          status?: string
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          application_id?: string | null
          approved_at?: string
          commission_duration?: string
          commission_rate?: number
          company?: string | null
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          notes?: string | null
          payout_details?: Json
          payout_method?: string | null
          referral_code?: string
          status?: string
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_partners_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "affiliate_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_payouts: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          method: string | null
          notes: string | null
          paid_at: string | null
          partner_id: string
          period_end: string | null
          period_start: string | null
          reference: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          method?: string | null
          notes?: string | null
          paid_at?: string | null
          partner_id: string
          period_end?: string | null
          period_start?: string | null
          reference?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          method?: string | null
          notes?: string | null
          paid_at?: string | null
          partner_id?: string
          period_end?: string | null
          period_start?: string | null
          reference?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_payouts_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "affiliate_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_referrals: {
        Row: {
          attribution_source: string
          business_id: string | null
          cancelled_at: string | null
          created_at: string
          first_paid_at: string | null
          id: string
          partner_id: string
          promo_code_id: string | null
          referral_code: string
          signed_up_at: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          attribution_source?: string
          business_id?: string | null
          cancelled_at?: string | null
          created_at?: string
          first_paid_at?: string | null
          id?: string
          partner_id: string
          promo_code_id?: string | null
          referral_code: string
          signed_up_at?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          attribution_source?: string
          business_id?: string | null
          cancelled_at?: string | null
          created_at?: string
          first_paid_at?: string | null
          id?: string
          partner_id?: string
          promo_code_id?: string | null
          referral_code?: string
          signed_up_at?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_referrals_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_referrals_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "affiliate_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_referrals_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          business_id: string
          created_at: string
          employee_id: string
          id: string
          late_minutes: number
          notes: string | null
          overtime_hours: number
          status: string
          time_in: string | null
          time_out: string | null
          undertime_minutes: number
          work_date: string
        }
        Insert: {
          business_id: string
          created_at?: string
          employee_id: string
          id?: string
          late_minutes?: number
          notes?: string | null
          overtime_hours?: number
          status?: string
          time_in?: string | null
          time_out?: string | null
          undertime_minutes?: number
          work_date?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          employee_id?: string
          id?: string
          late_minutes?: number
          notes?: string | null
          overtime_hours?: number
          status?: string
          time_in?: string | null
          time_out?: string | null
          undertime_minutes?: number
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          business_id: string
          created_at: string
          id: string
          ip_address: string | null
          module: string
          new_value: Json | null
          old_value: Json | null
          record_id: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          business_id: string
          created_at?: string
          id?: string
          ip_address?: string | null
          module: string
          new_value?: Json | null
          old_value?: Json | null
          record_id?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          business_id?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          module?: string
          new_value?: Json | null
          old_value?: Json | null
          record_id?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      batches: {
        Row: {
          batch_number: string
          business_id: string
          created_at: string
          expiry_date: string | null
          id: string
          lot_number: string | null
          manufactured_date: string | null
          notes: string | null
          product_id: string
          quantity: number
          remaining_quantity: number
          status: string
          supplier_id: string | null
          unit_cost: number
          updated_at: string
          variant_id: string | null
          warehouse_id: string | null
        }
        Insert: {
          batch_number: string
          business_id: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          lot_number?: string | null
          manufactured_date?: string | null
          notes?: string | null
          product_id: string
          quantity?: number
          remaining_quantity?: number
          status?: string
          supplier_id?: string | null
          unit_cost?: number
          updated_at?: string
          variant_id?: string | null
          warehouse_id?: string | null
        }
        Update: {
          batch_number?: string
          business_id?: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          lot_number?: string | null
          manufactured_date?: string | null
          notes?: string | null
          product_id?: string
          quantity?: number
          remaining_quantity?: number
          status?: string
          supplier_id?: string | null
          unit_cost?: number
          updated_at?: string
          variant_id?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "batches_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_of_materials: {
        Row: {
          business_id: string
          created_at: string
          id: string
          labor_cost: number
          name: string
          notes: string | null
          output_quantity: number
          overhead_cost: number
          product_id: string
          type: string
          updated_at: string
          waste_percent: number
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          labor_cost?: number
          name: string
          notes?: string | null
          output_quantity?: number
          overhead_cost?: number
          product_id: string
          type?: string
          updated_at?: string
          waste_percent?: number
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          labor_cost?: number
          name?: string
          notes?: string | null
          output_quantity?: number
          overhead_cost?: number
          product_id?: string
          type?: string
          updated_at?: string
          waste_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "bill_of_materials_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_of_materials_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_invoices: {
        Row: {
          amount: number
          business_id: string
          created_at: string
          currency: string
          due_date: string | null
          external_invoice_id: string | null
          id: string
          invoice_number: string | null
          paid_at: string | null
          status: string
          subscription_id: string | null
        }
        Insert: {
          amount?: number
          business_id: string
          created_at?: string
          currency?: string
          due_date?: string | null
          external_invoice_id?: string | null
          id?: string
          invoice_number?: string | null
          paid_at?: string | null
          status?: string
          subscription_id?: string | null
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string
          currency?: string
          due_date?: string | null
          external_invoice_id?: string | null
          id?: string
          invoice_number?: string | null
          paid_at?: string | null
          status?: string
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_invoices_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      bom_items: {
        Row: {
          bom_id: string
          business_id: string
          component_product_id: string | null
          created_at: string
          id: string
          quantity: number
          unit: string | null
          waste_percent: number
        }
        Insert: {
          bom_id: string
          business_id: string
          component_product_id?: string | null
          created_at?: string
          id?: string
          quantity?: number
          unit?: string | null
          waste_percent?: number
        }
        Update: {
          bom_id?: string
          business_id?: string
          component_product_id?: string | null
          created_at?: string
          id?: string
          quantity?: number
          unit?: string | null
          waste_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "bom_items_bom_id_fkey"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "bill_of_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_items_component_product_id_fkey"
            columns: ["component_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      business_onboarding: {
        Row: {
          business_id: string
          completed: boolean
          completed_at: string | null
          created_at: string
          current_step: number
          draft: Json
          id: string
          updated_at: string
        }
        Insert: {
          business_id: string
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          current_step?: number
          draft?: Json
          id?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          current_step?: number
          draft?: Json
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_onboarding_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_settings: {
        Row: {
          allow_negative_stock: boolean
          business_id: string
          costing_method: string
          created_at: string
          discount_limit_percent: number
          enable_alerts: boolean
          enable_assets: boolean
          enable_barcode: boolean
          enable_bom: boolean
          enable_cash_register: boolean
          enable_customer_credit: boolean
          enable_food_costing: boolean
          enable_low_stock_alerts: boolean
          enable_pos: boolean
          enable_production: boolean
          enable_projects: boolean
          enable_purchasing: boolean
          enable_quotes: boolean
          enable_returns: boolean
          enable_sales: boolean
          enable_sales_orders: boolean
          enable_services: boolean
          enable_shipping: boolean
          enable_stock_counts: boolean
          enable_stock_transfers: boolean
          enable_unit_conversion: boolean
          enable_waste: boolean
          expiry_alert_days: number
          extra: Json
          id: string
          low_stock_rule: string
          payment_methods: Json
          po_approval_threshold: number
          production_mode: string
          sales_bom_mode: string
          sales_channels: Json
          sales_inventory_timing: string
          tax_inclusive: boolean
          tax_name: string
          tax_rate: number
          track_batch: boolean
          track_cost: boolean
          track_expiry: boolean
          track_locations: boolean
          track_lot: boolean
          track_quantity: boolean
          track_serial: boolean
          track_variants: boolean
          updated_at: string
        }
        Insert: {
          allow_negative_stock?: boolean
          business_id: string
          costing_method?: string
          created_at?: string
          discount_limit_percent?: number
          enable_alerts?: boolean
          enable_assets?: boolean
          enable_barcode?: boolean
          enable_bom?: boolean
          enable_cash_register?: boolean
          enable_customer_credit?: boolean
          enable_food_costing?: boolean
          enable_low_stock_alerts?: boolean
          enable_pos?: boolean
          enable_production?: boolean
          enable_projects?: boolean
          enable_purchasing?: boolean
          enable_quotes?: boolean
          enable_returns?: boolean
          enable_sales?: boolean
          enable_sales_orders?: boolean
          enable_services?: boolean
          enable_shipping?: boolean
          enable_stock_counts?: boolean
          enable_stock_transfers?: boolean
          enable_unit_conversion?: boolean
          enable_waste?: boolean
          expiry_alert_days?: number
          extra?: Json
          id?: string
          low_stock_rule?: string
          payment_methods?: Json
          po_approval_threshold?: number
          production_mode?: string
          sales_bom_mode?: string
          sales_channels?: Json
          sales_inventory_timing?: string
          tax_inclusive?: boolean
          tax_name?: string
          tax_rate?: number
          track_batch?: boolean
          track_cost?: boolean
          track_expiry?: boolean
          track_locations?: boolean
          track_lot?: boolean
          track_quantity?: boolean
          track_serial?: boolean
          track_variants?: boolean
          updated_at?: string
        }
        Update: {
          allow_negative_stock?: boolean
          business_id?: string
          costing_method?: string
          created_at?: string
          discount_limit_percent?: number
          enable_alerts?: boolean
          enable_assets?: boolean
          enable_barcode?: boolean
          enable_bom?: boolean
          enable_cash_register?: boolean
          enable_customer_credit?: boolean
          enable_food_costing?: boolean
          enable_low_stock_alerts?: boolean
          enable_pos?: boolean
          enable_production?: boolean
          enable_projects?: boolean
          enable_purchasing?: boolean
          enable_quotes?: boolean
          enable_returns?: boolean
          enable_sales?: boolean
          enable_sales_orders?: boolean
          enable_services?: boolean
          enable_shipping?: boolean
          enable_stock_counts?: boolean
          enable_stock_transfers?: boolean
          enable_unit_conversion?: boolean
          enable_waste?: boolean
          expiry_alert_days?: number
          extra?: Json
          id?: string
          low_stock_rule?: string
          payment_methods?: Json
          po_approval_threshold?: number
          production_mode?: string
          sales_bom_mode?: string
          sales_channels?: Json
          sales_inventory_timing?: string
          tax_inclusive?: boolean
          tax_name?: string
          tax_rate?: number
          track_batch?: boolean
          track_cost?: boolean
          track_expiry?: boolean
          track_locations?: boolean
          track_lot?: boolean
          track_quantity?: boolean
          track_serial?: boolean
          track_variants?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_settings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          address: string | null
          brand_color: string | null
          country: string | null
          created_at: string
          created_by: string
          currency: string
          email: string | null
          id: string
          industry: string | null
          invoice_terms: string | null
          logo_url: string | null
          name: string
          phone: string | null
          slug: string | null
          tax_rate: number
          timezone: string
          type: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          brand_color?: string | null
          country?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          email?: string | null
          id?: string
          industry?: string | null
          invoice_terms?: string | null
          logo_url?: string | null
          name: string
          phone?: string | null
          slug?: string | null
          tax_rate?: number
          timezone?: string
          type?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          brand_color?: string | null
          country?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          email?: string | null
          id?: string
          industry?: string | null
          invoice_terms?: string | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          slug?: string | null
          tax_rate?: number
          timezone?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      cash_registers: {
        Row: {
          actual_cash: number | null
          assigned_user: string | null
          business_id: string
          closed_at: string | null
          created_at: string
          created_by: string | null
          expected_cash: number | null
          id: string
          location_id: string | null
          name: string
          notes: string | null
          opened_at: string
          opening_cash: number
          status: string
          updated_at: string
          variance: number | null
          variance_reason: string | null
        }
        Insert: {
          actual_cash?: number | null
          assigned_user?: string | null
          business_id: string
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          expected_cash?: number | null
          id?: string
          location_id?: string | null
          name: string
          notes?: string | null
          opened_at?: string
          opening_cash?: number
          status?: string
          updated_at?: string
          variance?: number | null
          variance_reason?: string | null
        }
        Update: {
          actual_cash?: number | null
          assigned_user?: string | null
          business_id?: string
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          expected_cash?: number | null
          id?: string
          location_id?: string | null
          name?: string
          notes?: string | null
          opened_at?: string
          opening_cash?: number
          status?: string
          updated_at?: string
          variance?: number | null
          variance_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_registers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_registers_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_transactions: {
        Row: {
          amount: number
          business_id: string
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          reference: string | null
          transaction_date: string
          type: string
        }
        Insert: {
          amount?: number
          business_id: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          reference?: string | null
          transaction_date?: string
          type?: string
        }
        Update: {
          amount?: number
          business_id?: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          reference?: string | null
          transaction_date?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_transactions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          business_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_history: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          id: string
          method: string
          new_cost: number
          old_cost: number | null
          product_id: string
          reason: string | null
          variant_id: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          method?: string
          new_cost: number
          old_cost?: number | null
          product_id: string
          reason?: string | null
          variant_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          method?: string
          new_cost?: number
          old_cost?: number | null
          product_id?: string
          reason?: string | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cost_history_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_history_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          balance: number
          business_id: string
          city: string | null
          code: string | null
          country: string | null
          created_at: string
          credit_limit: number
          currency: string | null
          email: string | null
          id: string
          is_walk_in: boolean
          name: string
          notes: string | null
          payment_terms: string | null
          phone: string | null
          price_tier: string | null
          province: string | null
          status: string
          tax_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          balance?: number
          business_id: string
          city?: string | null
          code?: string | null
          country?: string | null
          created_at?: string
          credit_limit?: number
          currency?: string | null
          email?: string | null
          id?: string
          is_walk_in?: boolean
          name: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          price_tier?: string | null
          province?: string | null
          status?: string
          tax_id?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          balance?: number
          business_id?: string
          city?: string | null
          code?: string | null
          country?: string | null
          created_at?: string
          credit_limit?: number
          currency?: string | null
          email?: string | null
          id?: string
          is_walk_in?: boolean
          name?: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          price_tier?: string | null
          province?: string | null
          status?: string
          tax_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_sequences: {
        Row: {
          business_id: string
          id: string
          last_number: number
          prefix: string
          year: number
        }
        Insert: {
          business_id: string
          id?: string
          last_number?: number
          prefix: string
          year: number
        }
        Update: {
          business_id?: string
          id?: string
          last_number?: number
          prefix?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "doc_sequences_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          address: string | null
          business_id: string
          created_at: string
          department: string | null
          email: string | null
          emergency_contact: string | null
          emergency_phone: string | null
          employee_code: string | null
          full_name: string
          hire_date: string | null
          id: string
          phone: string | null
          position: string | null
          rate_type: string
          salary: number
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          business_id: string
          created_at?: string
          department?: string | null
          email?: string | null
          emergency_contact?: string | null
          emergency_phone?: string | null
          employee_code?: string | null
          full_name: string
          hire_date?: string | null
          id?: string
          phone?: string | null
          position?: string | null
          rate_type?: string
          salary?: number
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          business_id?: string
          created_at?: string
          department?: string | null
          email?: string | null
          emergency_contact?: string | null
          emergency_phone?: string | null
          employee_code?: string | null
          full_name?: string
          hire_date?: string | null
          id?: string
          phone?: string | null
          position?: string | null
          rate_type?: string
          salary?: number
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          attachment_url: string | null
          business_id: string
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          expense_date: string
          id: string
          is_recurring: boolean
          payment_method: string
          recurrence: string | null
          status: string
          updated_at: string
          vendor: string | null
        }
        Insert: {
          amount?: number
          attachment_url?: string | null
          business_id: string
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          expense_date?: string
          id?: string
          is_recurring?: boolean
          payment_method?: string
          recurrence?: string | null
          status?: string
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          amount?: number
          attachment_url?: string | null
          business_id?: string
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          expense_date?: string
          id?: string
          is_recurring?: boolean
          payment_method?: string
          recurrence?: string | null
          status?: string
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      goods_receipt_items: {
        Row: {
          accepted_quantity: number
          batch_number: string | null
          business_id: string
          created_at: string
          damaged_quantity: number
          expiry_date: string | null
          id: string
          manufactured_date: string | null
          notes: string | null
          ordered_quantity: number
          product_id: string
          purchase_order_item_id: string | null
          receipt_id: string
          received_quantity: number
          rejected_quantity: number
          serial_numbers: string[] | null
          unit: string | null
          unit_cost: number
          variant_id: string | null
        }
        Insert: {
          accepted_quantity?: number
          batch_number?: string | null
          business_id: string
          created_at?: string
          damaged_quantity?: number
          expiry_date?: string | null
          id?: string
          manufactured_date?: string | null
          notes?: string | null
          ordered_quantity?: number
          product_id: string
          purchase_order_item_id?: string | null
          receipt_id: string
          received_quantity?: number
          rejected_quantity?: number
          serial_numbers?: string[] | null
          unit?: string | null
          unit_cost?: number
          variant_id?: string | null
        }
        Update: {
          accepted_quantity?: number
          batch_number?: string | null
          business_id?: string
          created_at?: string
          damaged_quantity?: number
          expiry_date?: string | null
          id?: string
          manufactured_date?: string | null
          notes?: string | null
          ordered_quantity?: number
          product_id?: string
          purchase_order_item_id?: string | null
          receipt_id?: string
          received_quantity?: number
          rejected_quantity?: number
          serial_numbers?: string[] | null
          unit?: string | null
          unit_cost?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipt_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_items_purchase_order_item_id_fkey"
            columns: ["purchase_order_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_items_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "goods_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      goods_receipts: {
        Row: {
          attachment_url: string | null
          business_id: string
          confirmed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          purchase_order_id: string | null
          receipt_date: string
          receipt_number: string
          received_by: string | null
          received_by_name: string | null
          reference: string | null
          status: string
          supplier_id: string | null
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          attachment_url?: string | null
          business_id: string
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          purchase_order_id?: string | null
          receipt_date?: string
          receipt_number: string
          received_by?: string | null
          received_by_name?: string | null
          reference?: string | null
          status?: string
          supplier_id?: string | null
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          attachment_url?: string | null
          business_id?: string
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          purchase_order_id?: string | null
          receipt_date?: string
          receipt_number?: string
          received_by?: string | null
          received_by_name?: string | null
          reference?: string | null
          status?: string
          supplier_id?: string | null
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      held_orders: {
        Row: {
          business_id: string
          cart: Json
          created_at: string
          customer_id: string | null
          held_by: string | null
          id: string
          label: string | null
          location_id: string | null
          meta: Json
          register_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          business_id: string
          cart?: Json
          created_at?: string
          customer_id?: string | null
          held_by?: string | null
          id?: string
          label?: string | null
          location_id?: string | null
          meta?: Json
          register_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          cart?: Json
          created_at?: string
          customer_id?: string | null
          held_by?: string | null
          id?: string
          label?: string | null
          location_id?: string | null
          meta?: Json
          register_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "held_orders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "held_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "held_orders_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "held_orders_register_id_fkey"
            columns: ["register_id"]
            isOneToOne: false
            referencedRelation: "cash_registers"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_balances: {
        Row: {
          average_cost: number
          batch_id: string | null
          business_id: string
          created_at: string
          id: string
          product_id: string
          quantity: number
          reserved_quantity: number
          updated_at: string
          variant_id: string | null
          warehouse_id: string | null
        }
        Insert: {
          average_cost?: number
          batch_id?: string | null
          business_id: string
          created_at?: string
          id?: string
          product_id: string
          quantity?: number
          reserved_quantity?: number
          updated_at?: string
          variant_id?: string | null
          warehouse_id?: string | null
        }
        Update: {
          average_cost?: number
          batch_id?: string | null
          business_id?: string
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          reserved_quantity?: number
          updated_at?: string
          variant_id?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_balances_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_balances_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_balances_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_balances_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_balances_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_cost_layers: {
        Row: {
          business_id: string
          created_at: string
          id: string
          movement_id: string | null
          product_id: string
          quantity: number
          remaining_quantity: number
          unit_cost: number
          variant_id: string | null
          warehouse_id: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          movement_id?: string | null
          product_id: string
          quantity: number
          remaining_quantity: number
          unit_cost?: number
          variant_id?: string | null
          warehouse_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          movement_id?: string | null
          product_id?: string
          quantity?: number
          remaining_quantity?: number
          unit_cost?: number
          variant_id?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_cost_layers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_cost_layers_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "inventory_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_cost_layers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_cost_layers_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_cost_layers_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          base_quantity: number | null
          batch_id: string | null
          batch_number: string | null
          business_id: string
          created_at: string
          created_by: string | null
          id: string
          movement_date: string
          notes: string | null
          product_id: string
          quantity: number
          reason: string | null
          reference: string | null
          reference_id: string | null
          reference_type: string | null
          serial_id: string | null
          to_warehouse_id: string | null
          total_cost: number | null
          type: string
          unit: string | null
          unit_cost: number
          variant_id: string | null
          warehouse_id: string | null
        }
        Insert: {
          base_quantity?: number | null
          batch_id?: string | null
          batch_number?: string | null
          business_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          movement_date?: string
          notes?: string | null
          product_id: string
          quantity: number
          reason?: string | null
          reference?: string | null
          reference_id?: string | null
          reference_type?: string | null
          serial_id?: string | null
          to_warehouse_id?: string | null
          total_cost?: number | null
          type: string
          unit?: string | null
          unit_cost?: number
          variant_id?: string | null
          warehouse_id?: string | null
        }
        Update: {
          base_quantity?: number | null
          batch_id?: string | null
          batch_number?: string | null
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          movement_date?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          reason?: string | null
          reference?: string | null
          reference_id?: string | null
          reference_type?: string | null
          serial_id?: string | null
          to_warehouse_id?: string | null
          total_cost?: number | null
          type?: string
          unit?: string | null
          unit_cost?: number
          variant_id?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_serial_id_fkey"
            columns: ["serial_id"]
            isOneToOne: false
            referencedRelation: "serial_numbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_to_warehouse_id_fkey"
            columns: ["to_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_reservations: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          id: string
          product_id: string
          quantity: number
          sale_id: string | null
          status: string
          updated_at: string
          variant_id: string | null
          warehouse_id: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          product_id: string
          quantity: number
          sale_id?: string | null
          status?: string
          updated_at?: string
          variant_id?: string | null
          warehouse_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          product_id?: string
          quantity?: number
          sale_id?: string | null
          status?: string
          updated_at?: string
          variant_id?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_reservations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          business_id: string
          created_at: string
          customer_id: string | null
          discount: number
          due_date: string | null
          id: string
          invoice_number: string
          issue_date: string
          notes: string | null
          paid: number
          sale_id: string | null
          status: string
          subtotal: number
          tax: number
          terms: string | null
          total: number
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          customer_id?: string | null
          discount?: number
          due_date?: string | null
          id?: string
          invoice_number: string
          issue_date?: string
          notes?: string | null
          paid?: number
          sale_id?: string | null
          status?: string
          subtotal?: number
          tax?: number
          terms?: string | null
          total?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          customer_id?: string | null
          discount?: number
          due_date?: string | null
          id?: string
          invoice_number?: string
          issue_date?: string
          notes?: string | null
          paid?: number
          sale_id?: string | null
          status?: string
          subtotal?: number
          tax?: number
          terms?: string | null
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
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
            foreignKeyName: "invoices_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      kpis: {
        Row: {
          business_id: string
          created_at: string
          formula: string | null
          id: string
          name: string
          target: number | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          formula?: string | null
          id?: string
          name: string
          target?: number | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          formula?: string | null
          id?: string
          name?: string
          target?: number | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpis_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          business_id: string
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          message: string | null
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          message?: string | null
          title: string
          type?: string
          user_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          message?: string | null
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll: {
        Row: {
          allowances: number
          basic_pay: number
          business_id: string
          created_at: string
          deductions: number
          employee_id: string
          holiday_pay: number
          id: string
          loans: number
          net_pay: number
          overtime_pay: number
          period_end: string
          period_start: string
          status: string
          updated_at: string
        }
        Insert: {
          allowances?: number
          basic_pay?: number
          business_id: string
          created_at?: string
          deductions?: number
          employee_id: string
          holiday_pay?: number
          id?: string
          loans?: number
          net_pay?: number
          overtime_pay?: number
          period_end: string
          period_start: string
          status?: string
          updated_at?: string
        }
        Update: {
          allowances?: number
          basic_pay?: number
          business_id?: string
          created_at?: string
          deductions?: number
          employee_id?: string
          holiday_pay?: number
          id?: string
          loans?: number
          net_pay?: number
          overtime_pay?: number
          period_end?: string
          period_start?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_entitlements: {
        Row: {
          created_at: string
          enabled: boolean
          feature_key: string
          id: string
          limit_value: number | null
          plan_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          feature_key: string
          id?: string
          limit_value?: number | null
          plan_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          feature_key?: string
          id?: string
          limit_value?: number | null
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_entitlements_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admin_allowlist: {
        Row: {
          created_at: string
          email: string
          note: string | null
        }
        Insert: {
          created_at?: string
          email: string
          note?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          note?: string | null
        }
        Relationships: []
      }
      platform_admin_audit: {
        Row: {
          action: string
          created_at: string
          detail: Json | null
          email: string | null
          id: string
          ip_address: string | null
          success: boolean
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          detail?: Json | null
          email?: string | null
          id?: string
          ip_address?: string | null
          success?: boolean
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          detail?: Json | null
          email?: string | null
          id?: string
          ip_address?: string | null
          success?: boolean
          user_id?: string | null
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          created_at: string
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      price_history: {
        Row: {
          business_id: string
          changed_by: string | null
          created_at: string
          id: string
          new_price: number | null
          old_price: number | null
          product_id: string
          reason: string | null
          variant_id: string | null
        }
        Insert: {
          business_id: string
          changed_by?: string | null
          created_at?: string
          id?: string
          new_price?: number | null
          old_price?: number | null
          product_id: string
          reason?: string | null
          variant_id?: string | null
        }
        Update: {
          business_id?: string
          changed_by?: string | null
          created_at?: string
          id?: string
          new_price?: number | null
          old_price?: number | null
          product_id?: string
          reason?: string | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_history_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_history_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      price_lists: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          currency: string | null
          customer_id: string | null
          ends_on: string | null
          id: string
          min_quantity: number
          price: number
          product_id: string
          starts_on: string | null
          tier: string | null
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          currency?: string | null
          customer_id?: string | null
          ends_on?: string | null
          id?: string
          min_quantity?: number
          price: number
          product_id: string
          starts_on?: string | null
          tier?: string | null
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string | null
          customer_id?: string | null
          ends_on?: string | null
          id?: string
          min_quantity?: number
          price?: number
          product_id?: string
          starts_on?: string | null
          tier?: string | null
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_lists_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_lists_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_lists_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_lists_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          attributes: Json
          barcode: string | null
          business_id: string
          cost_price: number
          created_at: string
          id: string
          name: string
          product_id: string
          reorder_level: number
          selling_price: number
          sku: string | null
          status: string
          stock: number
          updated_at: string
        }
        Insert: {
          attributes?: Json
          barcode?: string | null
          business_id: string
          cost_price?: number
          created_at?: string
          id?: string
          name: string
          product_id: string
          reorder_level?: number
          selling_price?: number
          sku?: string | null
          status?: string
          stock?: number
          updated_at?: string
        }
        Update: {
          attributes?: Json
          barcode?: string | null
          business_id?: string
          cost_price?: number
          created_at?: string
          id?: string
          name?: string
          product_id?: string
          reorder_level?: number
          selling_price?: number
          sku?: string | null
          status?: string
          stock?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      production_orders: {
        Row: {
          bom_id: string | null
          business_id: string
          created_at: string
          created_by: string | null
          end_date: string | null
          id: string
          labor_cost: number
          material_cost: number
          notes: string | null
          order_number: string | null
          overhead_cost: number
          produced_quantity: number
          product_id: string
          quantity: number
          start_date: string | null
          status: string
          total_cost: number
          updated_at: string
          warehouse_id: string | null
          waste_quantity: number
        }
        Insert: {
          bom_id?: string | null
          business_id: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          labor_cost?: number
          material_cost?: number
          notes?: string | null
          order_number?: string | null
          overhead_cost?: number
          produced_quantity?: number
          product_id: string
          quantity?: number
          start_date?: string | null
          status?: string
          total_cost?: number
          updated_at?: string
          warehouse_id?: string | null
          waste_quantity?: number
        }
        Update: {
          bom_id?: string | null
          business_id?: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          labor_cost?: number
          material_cost?: number
          notes?: string | null
          order_number?: string | null
          overhead_cost?: number
          produced_quantity?: number
          product_id?: string
          quantity?: number
          start_date?: string | null
          status?: string
          total_cost?: number
          updated_at?: string
          warehouse_id?: string | null
          waste_quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_orders_bom_id_fkey"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "bill_of_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          average_cost: number
          barcode: string | null
          batch_number: string | null
          brand: string | null
          business_id: string
          category_id: string | null
          cost_price: number
          created_at: string
          default_location_id: string | null
          description: string | null
          expiration_date: string | null
          has_bom: boolean
          has_variants: boolean
          id: string
          image_url: string | null
          inventory_model: string
          is_finished_good: boolean
          max_stock: number | null
          min_stock: number
          name: string
          product_type: string
          purchase_conversion: number
          purchase_unit: string | null
          reorder_level: number
          reserved_stock: number
          selling_price: number
          serial_number: string | null
          sku: string | null
          standard_cost: number
          status: string
          stock: number
          supplier_id: string | null
          tax_rate: number
          track_batch: boolean
          track_expiry: boolean
          track_serial: boolean
          track_warranty: boolean
          unit: string
          updated_at: string
          warranty_months: number | null
        }
        Insert: {
          average_cost?: number
          barcode?: string | null
          batch_number?: string | null
          brand?: string | null
          business_id: string
          category_id?: string | null
          cost_price?: number
          created_at?: string
          default_location_id?: string | null
          description?: string | null
          expiration_date?: string | null
          has_bom?: boolean
          has_variants?: boolean
          id?: string
          image_url?: string | null
          inventory_model?: string
          is_finished_good?: boolean
          max_stock?: number | null
          min_stock?: number
          name: string
          product_type?: string
          purchase_conversion?: number
          purchase_unit?: string | null
          reorder_level?: number
          reserved_stock?: number
          selling_price?: number
          serial_number?: string | null
          sku?: string | null
          standard_cost?: number
          status?: string
          stock?: number
          supplier_id?: string | null
          tax_rate?: number
          track_batch?: boolean
          track_expiry?: boolean
          track_serial?: boolean
          track_warranty?: boolean
          unit?: string
          updated_at?: string
          warranty_months?: number | null
        }
        Update: {
          average_cost?: number
          barcode?: string | null
          batch_number?: string | null
          brand?: string | null
          business_id?: string
          category_id?: string | null
          cost_price?: number
          created_at?: string
          default_location_id?: string | null
          description?: string | null
          expiration_date?: string | null
          has_bom?: boolean
          has_variants?: boolean
          id?: string
          image_url?: string | null
          inventory_model?: string
          is_finished_good?: boolean
          max_stock?: number | null
          min_stock?: number
          name?: string
          product_type?: string
          purchase_conversion?: number
          purchase_unit?: string | null
          reorder_level?: number
          reserved_stock?: number
          selling_price?: number
          serial_number?: string | null
          sku?: string | null
          standard_cost?: number
          status?: string
          stock?: number
          supplier_id?: string | null
          tax_rate?: number
          track_batch?: boolean
          track_expiry?: boolean
          track_serial?: boolean
          track_warranty?: boolean
          unit?: string
          updated_at?: string
          warranty_months?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_default_location_id_fkey"
            columns: ["default_location_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      promo_code_redemptions: {
        Row: {
          business_id: string
          code: string
          created_at: string
          discount_amount: number
          final_amount: number
          id: string
          original_amount: number
          plan_id: string | null
          promo_code_id: string
          redeemed_by: string | null
          subscription_id: string | null
        }
        Insert: {
          business_id: string
          code: string
          created_at?: string
          discount_amount: number
          final_amount: number
          id?: string
          original_amount: number
          plan_id?: string | null
          promo_code_id: string
          redeemed_by?: string | null
          subscription_id?: string | null
        }
        Update: {
          business_id?: string
          code?: string
          created_at?: string
          discount_amount?: number
          final_amount?: number
          id?: string
          original_amount?: number
          plan_id?: string | null
          promo_code_id?: string
          redeemed_by?: string | null
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_code_redemptions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_code_redemptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_code_redemptions_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_code_redemptions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_codes: {
        Row: {
          active: boolean
          affiliate_partner_id: string | null
          applicable_plans: string[]
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          discount_type: string
          discount_value: number
          duration: string
          ends_at: string | null
          id: string
          max_per_business: number
          max_redemptions: number | null
          min_amount: number | null
          redemption_count: number
          starts_at: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          affiliate_partner_id?: string | null
          applicable_plans?: string[]
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_type: string
          discount_value: number
          duration?: string
          ends_at?: string | null
          id?: string
          max_per_business?: number
          max_redemptions?: number | null
          min_amount?: number | null
          redemption_count?: number
          starts_at?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          affiliate_partner_id?: string | null
          applicable_plans?: string[]
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_type?: string
          discount_value?: number
          duration?: string
          ends_at?: string | null
          id?: string
          max_per_business?: number
          max_redemptions?: number | null
          min_amount?: number | null
          redemption_count?: number
          starts_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_codes_affiliate_partner_id_fkey"
            columns: ["affiliate_partner_id"]
            isOneToOne: false
            referencedRelation: "affiliate_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          business_id: string
          created_at: string
          damaged_quantity: number
          discount: number
          expected_date: string | null
          id: string
          notes: string | null
          product_id: string | null
          purchase_order_id: string
          quantity: number
          received_quantity: number
          rejected_quantity: number
          supplier_sku: string | null
          tax: number
          total: number
          unit: string | null
          unit_cost: number
          variant_id: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          damaged_quantity?: number
          discount?: number
          expected_date?: string | null
          id?: string
          notes?: string | null
          product_id?: string | null
          purchase_order_id: string
          quantity?: number
          received_quantity?: number
          rejected_quantity?: number
          supplier_sku?: string | null
          tax?: number
          total?: number
          unit?: string | null
          unit_cost?: number
          variant_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          damaged_quantity?: number
          discount?: number
          expected_date?: string | null
          id?: string
          notes?: string | null
          product_id?: string | null
          purchase_order_id?: string
          quantity?: number
          received_quantity?: number
          rejected_quantity?: number
          supplier_sku?: string | null
          tax?: number
          total?: number
          unit?: string | null
          unit_cost?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          business_id: string
          closed_at: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          discount: number
          exchange_rate: number
          expected_date: string | null
          id: string
          landed_cost_method: string
          notes: string | null
          order_date: string
          other_charges: number
          paid: number
          payment_terms: string | null
          po_number: string
          request_id: string | null
          sent_at: string | null
          shipping_cost: number
          status: string
          subtotal: number
          supplier_id: string | null
          tax: number
          total: number
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          business_id: string
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          discount?: number
          exchange_rate?: number
          expected_date?: string | null
          id?: string
          landed_cost_method?: string
          notes?: string | null
          order_date?: string
          other_charges?: number
          paid?: number
          payment_terms?: string | null
          po_number: string
          request_id?: string | null
          sent_at?: string | null
          shipping_cost?: number
          status?: string
          subtotal?: number
          supplier_id?: string | null
          tax?: number
          total?: number
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          business_id?: string
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          discount?: number
          exchange_rate?: number
          expected_date?: string | null
          id?: string
          landed_cost_method?: string
          notes?: string | null
          order_date?: string
          other_charges?: number
          paid?: number
          payment_terms?: string | null
          po_number?: string
          request_id?: string | null
          sent_at?: string | null
          shipping_cost?: number
          status?: string
          subtotal?: number
          supplier_id?: string | null
          tax?: number
          total?: number
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "purchase_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_request_items: {
        Row: {
          business_id: string
          created_at: string
          estimated_cost: number
          id: string
          notes: string | null
          product_id: string | null
          quantity: number
          request_id: string
          unit: string | null
          variant_id: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          estimated_cost?: number
          id?: string
          notes?: string | null
          product_id?: string | null
          quantity?: number
          request_id: string
          unit?: string | null
          variant_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          estimated_cost?: number
          id?: string
          notes?: string | null
          product_id?: string | null
          quantity?: number
          request_id?: string
          unit?: string | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_request_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_request_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_request_items_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "purchase_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_request_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_requests: {
        Row: {
          business_id: string
          converted_po_id: string | null
          created_at: string
          created_by: string | null
          department: string | null
          id: string
          notes: string | null
          reason: string | null
          request_date: string
          request_number: string
          requester_id: string | null
          requester_name: string | null
          required_date: string | null
          status: string
          supplier_id: string | null
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          business_id: string
          converted_po_id?: string | null
          created_at?: string
          created_by?: string | null
          department?: string | null
          id?: string
          notes?: string | null
          reason?: string | null
          request_date?: string
          request_number: string
          requester_id?: string | null
          requester_name?: string | null
          required_date?: string | null
          status?: string
          supplier_id?: string | null
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          business_id?: string
          converted_po_id?: string | null
          created_at?: string
          created_by?: string | null
          department?: string | null
          id?: string
          notes?: string | null
          reason?: string | null
          request_date?: string
          request_number?: string
          requester_id?: string | null
          requester_name?: string | null
          required_date?: string | null
          status?: string
          supplier_id?: string | null
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_requests_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_converted_po_id_fkey"
            columns: ["converted_po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_return_items: {
        Row: {
          business_id: string
          created_at: string
          id: string
          product_id: string
          quantity: number
          reason: string | null
          return_id: string
          total: number
          unit_cost: number
          variant_id: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          product_id: string
          quantity?: number
          reason?: string | null
          return_id: string
          total?: number
          unit_cost?: number
          variant_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          reason?: string | null
          return_id?: string
          total?: number
          unit_cost?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_return_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "purchase_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_return_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_returns: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          goods_receipt_id: string | null
          id: string
          purchase_order_id: string | null
          reason: string | null
          return_date: string
          return_number: string
          status: string
          supplier_id: string | null
          total: number
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          goods_receipt_id?: string | null
          id?: string
          purchase_order_id?: string | null
          reason?: string | null
          return_date?: string
          return_number: string
          status?: string
          supplier_id?: string | null
          total?: number
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          goods_receipt_id?: string | null
          id?: string
          purchase_order_id?: string | null
          reason?: string | null
          return_date?: string
          return_number?: string
          status?: string
          supplier_id?: string | null
          total?: number
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_returns_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_returns_goods_receipt_id_fkey"
            columns: ["goods_receipt_id"]
            isOneToOne: false
            referencedRelation: "goods_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_returns_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_returns_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_returns_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      register_movements: {
        Row: {
          amount: number
          business_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          reference: string | null
          register_id: string
          type: string
        }
        Insert: {
          amount?: number
          business_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          reference?: string | null
          register_id: string
          type: string
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          reference?: string | null
          register_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "register_movements_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "register_movements_register_id_fkey"
            columns: ["register_id"]
            isOneToOne: false
            referencedRelation: "cash_registers"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          business_id: string
          condition: string | null
          created_at: string
          discount: number
          discount_type: string
          fulfilled_quantity: number
          id: string
          notes: string | null
          product_id: string | null
          product_name: string | null
          quantity: number
          returned_quantity: number
          sale_id: string
          sku: string | null
          tax: number
          tax_rate: number
          total: number
          unit: string | null
          unit_cost: number
          unit_price: number
          variant_id: string | null
        }
        Insert: {
          business_id: string
          condition?: string | null
          created_at?: string
          discount?: number
          discount_type?: string
          fulfilled_quantity?: number
          id?: string
          notes?: string | null
          product_id?: string | null
          product_name?: string | null
          quantity?: number
          returned_quantity?: number
          sale_id: string
          sku?: string | null
          tax?: number
          tax_rate?: number
          total?: number
          unit?: string | null
          unit_cost?: number
          unit_price?: number
          variant_id?: string | null
        }
        Update: {
          business_id?: string
          condition?: string | null
          created_at?: string
          discount?: number
          discount_type?: string
          fulfilled_quantity?: number
          id?: string
          notes?: string | null
          product_id?: string | null
          product_name?: string | null
          quantity?: number
          returned_quantity?: number
          sale_id?: string
          sku?: string | null
          tax?: number
          tax_rate?: number
          total?: number
          unit?: string | null
          unit_cost?: number
          unit_price?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_payments: {
        Row: {
          amount: number
          business_id: string
          change_given: number
          created_at: string
          created_by: string | null
          id: string
          is_refund: boolean
          method: string
          notes: string | null
          paid_at: string
          reference: string | null
          register_id: string | null
          sale_id: string
          tendered: number | null
        }
        Insert: {
          amount: number
          business_id: string
          change_given?: number
          created_at?: string
          created_by?: string | null
          id?: string
          is_refund?: boolean
          method?: string
          notes?: string | null
          paid_at?: string
          reference?: string | null
          register_id?: string | null
          sale_id: string
          tendered?: number | null
        }
        Update: {
          amount?: number
          business_id?: string
          change_given?: number
          created_at?: string
          created_by?: string | null
          id?: string
          is_refund?: boolean
          method?: string
          notes?: string | null
          paid_at?: string
          reference?: string | null
          register_id?: string | null
          sale_id?: string
          tendered?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_payments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_payments_register_id_fkey"
            columns: ["register_id"]
            isOneToOne: false
            referencedRelation: "cash_registers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_payments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          base_total: number | null
          billing_address: string | null
          business_id: string
          channel: string
          cost_total: number
          created_at: string
          created_by: string | null
          currency: string | null
          customer_id: string | null
          customer_status: string
          delivery_status: string | null
          discount: number
          discount_type: string
          discount_value: number
          document_type: string
          due_date: string | null
          exchange_rate: number
          expected_date: string | null
          expires_on: string | null
          fulfillment_status: string
          id: string
          inventory_posted: boolean
          location_id: string | null
          notes: string | null
          original_sale_id: string | null
          other_charges: number
          paid: number
          payment_method: string
          payment_status: string
          payment_terms: string | null
          posted_at: string | null
          quote_id: string | null
          register_id: string | null
          return_reason: string | null
          sale_date: string
          sale_number: string
          sale_type: string
          sales_order_id: string | null
          salesperson_id: string | null
          shipping: number
          shipping_address: string | null
          shipping_method: string | null
          source: string | null
          status: string
          subtotal: number
          tax: number
          tax_inclusive: boolean
          total: number
          tracking_number: string | null
          updated_at: string
          voided_at: string | null
        }
        Insert: {
          base_total?: number | null
          billing_address?: string | null
          business_id: string
          channel?: string
          cost_total?: number
          created_at?: string
          created_by?: string | null
          currency?: string | null
          customer_id?: string | null
          customer_status?: string
          delivery_status?: string | null
          discount?: number
          discount_type?: string
          discount_value?: number
          document_type?: string
          due_date?: string | null
          exchange_rate?: number
          expected_date?: string | null
          expires_on?: string | null
          fulfillment_status?: string
          id?: string
          inventory_posted?: boolean
          location_id?: string | null
          notes?: string | null
          original_sale_id?: string | null
          other_charges?: number
          paid?: number
          payment_method?: string
          payment_status?: string
          payment_terms?: string | null
          posted_at?: string | null
          quote_id?: string | null
          register_id?: string | null
          return_reason?: string | null
          sale_date?: string
          sale_number: string
          sale_type?: string
          sales_order_id?: string | null
          salesperson_id?: string | null
          shipping?: number
          shipping_address?: string | null
          shipping_method?: string | null
          source?: string | null
          status?: string
          subtotal?: number
          tax?: number
          tax_inclusive?: boolean
          total?: number
          tracking_number?: string | null
          updated_at?: string
          voided_at?: string | null
        }
        Update: {
          base_total?: number | null
          billing_address?: string | null
          business_id?: string
          channel?: string
          cost_total?: number
          created_at?: string
          created_by?: string | null
          currency?: string | null
          customer_id?: string | null
          customer_status?: string
          delivery_status?: string | null
          discount?: number
          discount_type?: string
          discount_value?: number
          document_type?: string
          due_date?: string | null
          exchange_rate?: number
          expected_date?: string | null
          expires_on?: string | null
          fulfillment_status?: string
          id?: string
          inventory_posted?: boolean
          location_id?: string | null
          notes?: string | null
          original_sale_id?: string | null
          other_charges?: number
          paid?: number
          payment_method?: string
          payment_status?: string
          payment_terms?: string | null
          posted_at?: string | null
          quote_id?: string | null
          register_id?: string | null
          return_reason?: string | null
          sale_date?: string
          sale_number?: string
          sale_type?: string
          sales_order_id?: string | null
          salesperson_id?: string | null
          shipping?: number
          shipping_address?: string | null
          shipping_method?: string | null
          source?: string | null
          status?: string
          subtotal?: number
          tax?: number
          tax_inclusive?: boolean
          total?: number
          tracking_number?: string | null
          updated_at?: string
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_original_sale_id_fkey"
            columns: ["original_sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      serial_numbers: {
        Row: {
          business_id: string
          created_at: string
          id: string
          notes: string | null
          product_id: string
          purchase_date: string | null
          serial_number: string
          status: string
          supplier_id: string | null
          updated_at: string
          variant_id: string | null
          warehouse_id: string | null
          warranty_expiry: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          notes?: string | null
          product_id: string
          purchase_date?: string | null
          serial_number: string
          status?: string
          supplier_id?: string | null
          updated_at?: string
          variant_id?: string | null
          warehouse_id?: string | null
          warranty_expiry?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          product_id?: string
          purchase_date?: string | null
          serial_number?: string
          status?: string
          supplier_id?: string | null
          updated_at?: string
          variant_id?: string | null
          warehouse_id?: string | null
          warranty_expiry?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "serial_numbers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "serial_numbers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "serial_numbers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "serial_numbers_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "serial_numbers_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_count_items: {
        Row: {
          business_id: string
          counted_quantity: number | null
          created_at: string
          expected_quantity: number
          id: string
          product_id: string
          stock_count_id: string
          variant_id: string | null
        }
        Insert: {
          business_id: string
          counted_quantity?: number | null
          created_at?: string
          expected_quantity?: number
          id?: string
          product_id: string
          stock_count_id: string
          variant_id?: string | null
        }
        Update: {
          business_id?: string
          counted_quantity?: number | null
          created_at?: string
          expected_quantity?: number
          id?: string
          product_id?: string
          stock_count_id?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_count_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_count_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_count_items_stock_count_id_fkey"
            columns: ["stock_count_id"]
            isOneToOne: false
            referencedRelation: "stock_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_count_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_counts: {
        Row: {
          business_id: string
          confirmed_at: string | null
          counted_by: string | null
          created_at: string
          id: string
          notes: string | null
          reference: string | null
          status: string
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          business_id: string
          confirmed_at?: string | null
          counted_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          reference?: string | null
          status?: string
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          business_id?: string
          confirmed_at?: string | null
          counted_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          reference?: string | null
          status?: string
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_counts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_counts_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_discounts: {
        Row: {
          active: boolean
          business_id: string
          code: string
          created_at: string
          discount_amount: number
          discount_type: string
          discount_value: number
          duration: string
          ends_at: string | null
          final_amount: number
          fulfilment_status: string
          id: string
          original_amount: number
          promo_code_id: string | null
          provider_applied: boolean
          remaining_cycles: number | null
          starts_at: string
          subscription_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          business_id: string
          code: string
          created_at?: string
          discount_amount: number
          discount_type: string
          discount_value: number
          duration?: string
          ends_at?: string | null
          final_amount: number
          fulfilment_status?: string
          id?: string
          original_amount: number
          promo_code_id?: string | null
          provider_applied?: boolean
          remaining_cycles?: number | null
          starts_at?: string
          subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          business_id?: string
          code?: string
          created_at?: string
          discount_amount?: number
          discount_type?: string
          discount_value?: number
          duration?: string
          ends_at?: string | null
          final_amount?: number
          fulfilment_status?: string
          id?: string
          original_amount?: number
          promo_code_id?: string | null
          provider_applied?: boolean
          remaining_cycles?: number | null
          starts_at?: string
          subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_discounts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_discounts_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_discounts_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_events: {
        Row: {
          business_id: string | null
          created_at: string
          event_type: string
          external_event_id: string | null
          id: string
          payload: Json | null
          subscription_id: string | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string
          event_type: string
          external_event_id?: string | null
          id?: string
          payload?: Json | null
          subscription_id?: string | null
        }
        Update: {
          business_id?: string | null
          created_at?: string
          event_type?: string
          external_event_id?: string | null
          id?: string
          payload?: Json | null
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_events_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_payments: {
        Row: {
          amount: number
          business_id: string
          created_at: string
          currency: string
          failure_reason: string | null
          id: string
          paid_at: string | null
          paymongo_payment_id: string | null
          status: string
          subscription_id: string | null
        }
        Insert: {
          amount?: number
          business_id: string
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          paid_at?: string | null
          paymongo_payment_id?: string | null
          status?: string
          subscription_id?: string | null
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          paid_at?: string | null
          paymongo_payment_id?: string | null
          status?: string
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_payments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          billing_interval: string
          created_at: string
          currency: string
          description: string | null
          id: string
          name: string
          paymongo_plan_id: string | null
          price: number
          slug: string
          sort_order: number
          status: string
          trial_days: number
          updated_at: string
        }
        Insert: {
          billing_interval?: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          name: string
          paymongo_plan_id?: string | null
          price?: number
          slug: string
          sort_order?: number
          status?: string
          trial_days?: number
          updated_at?: string
        }
        Update: {
          billing_interval?: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          name?: string
          paymongo_plan_id?: string | null
          price?: number
          slug?: string
          sort_order?: number
          status?: string
          trial_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          business_id: string
          cancel_at_period_end: boolean
          cancelled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          payment_method_brand: string | null
          payment_method_last4: string | null
          paymongo_customer_id: string | null
          paymongo_subscription_id: string | null
          pending_plan_effective_at: string | null
          pending_plan_id: string | null
          plan_id: string
          start_date: string
          status: string
          test_mode: boolean
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          payment_method_brand?: string | null
          payment_method_last4?: string | null
          paymongo_customer_id?: string | null
          paymongo_subscription_id?: string | null
          pending_plan_effective_at?: string | null
          pending_plan_id?: string | null
          plan_id: string
          start_date?: string
          status?: string
          test_mode?: boolean
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          payment_method_brand?: string | null
          payment_method_last4?: string | null
          paymongo_customer_id?: string | null
          paymongo_subscription_id?: string | null
          pending_plan_effective_at?: string | null
          pending_plan_id?: string | null
          plan_id?: string
          start_date?: string
          status?: string
          test_mode?: boolean
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_pending_plan_id_fkey"
            columns: ["pending_plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_credits: {
        Row: {
          amount: number
          applied: number
          business_id: string
          created_at: string
          currency: string | null
          id: string
          notes: string | null
          purchase_return_id: string | null
          status: string
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          applied?: number
          business_id: string
          created_at?: string
          currency?: string | null
          id?: string
          notes?: string | null
          purchase_return_id?: string | null
          status?: string
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          applied?: number
          business_id?: string
          created_at?: string
          currency?: string | null
          id?: string
          notes?: string | null
          purchase_return_id?: string | null
          status?: string
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_credits_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_credits_purchase_return_id_fkey"
            columns: ["purchase_return_id"]
            isOneToOne: false
            referencedRelation: "purchase_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_credits_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_invoices: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          currency: string | null
          due_date: string | null
          exchange_rate: number
          goods_receipt_id: string | null
          id: string
          invoice_date: string
          invoice_number: string
          invoiced_quantity: number
          match_notes: string | null
          match_status: string
          notes: string | null
          purchase_order_id: string | null
          status: string
          subtotal: number
          supplier_id: string | null
          tax: number
          total: number
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          currency?: string | null
          due_date?: string | null
          exchange_rate?: number
          goods_receipt_id?: string | null
          id?: string
          invoice_date?: string
          invoice_number: string
          invoiced_quantity?: number
          match_notes?: string | null
          match_status?: string
          notes?: string | null
          purchase_order_id?: string | null
          status?: string
          subtotal?: number
          supplier_id?: string | null
          tax?: number
          total?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string | null
          due_date?: string | null
          exchange_rate?: number
          goods_receipt_id?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string
          invoiced_quantity?: number
          match_notes?: string | null
          match_status?: string
          notes?: string | null
          purchase_order_id?: string | null
          status?: string
          subtotal?: number
          supplier_id?: string | null
          tax?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoices_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoices_goods_receipt_id_fkey"
            columns: ["goods_receipt_id"]
            isOneToOne: false
            referencedRelation: "goods_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoices_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_price_history: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          currency: string | null
          effective_date: string
          id: string
          price: number
          product_id: string | null
          reference: string | null
          source: string
          supplier_id: string | null
          variant_id: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          currency?: string | null
          effective_date?: string
          id?: string
          price?: number
          product_id?: string | null
          reference?: string | null
          source?: string
          supplier_id?: string | null
          variant_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string | null
          effective_date?: string
          id?: string
          price?: number
          product_id?: string | null
          reference?: string | null
          source?: string
          supplier_id?: string | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_price_history_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_price_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_price_history_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_price_history_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_products: {
        Row: {
          business_id: string
          created_at: string
          currency: string | null
          id: string
          is_active: boolean
          is_preferred: boolean
          last_purchase_date: string | null
          last_purchase_price: number | null
          lead_time_days: number
          min_order_quantity: number
          notes: string | null
          product_id: string
          purchase_unit: string | null
          supplier_id: string
          supplier_product_name: string | null
          supplier_sku: string | null
          unit_cost: number
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          currency?: string | null
          id?: string
          is_active?: boolean
          is_preferred?: boolean
          last_purchase_date?: string | null
          last_purchase_price?: number | null
          lead_time_days?: number
          min_order_quantity?: number
          notes?: string | null
          product_id: string
          purchase_unit?: string | null
          supplier_id: string
          supplier_product_name?: string | null
          supplier_sku?: string | null
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          currency?: string | null
          id?: string
          is_active?: boolean
          is_preferred?: boolean
          last_purchase_date?: string | null
          last_purchase_price?: number | null
          lead_time_days?: number
          min_order_quantity?: number
          notes?: string | null
          product_id?: string
          purchase_unit?: string | null
          supplier_id?: string
          supplier_product_name?: string | null
          supplier_sku?: string | null
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_products_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          balance: number
          business_id: string
          city: string | null
          contact_person: string | null
          country: string | null
          created_at: string
          credit_limit: number
          currency: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          payment_terms: string
          phone: string | null
          state: string | null
          status: string
          supplier_type: string
          tax_number: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          balance?: number
          business_id: string
          city?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string
          credit_limit?: number
          currency?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          payment_terms?: string
          phone?: string | null
          state?: string | null
          status?: string
          supplier_type?: string
          tax_number?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          balance?: number
          business_id?: string
          city?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string
          credit_limit?: number
          currency?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          payment_terms?: string
          phone?: string | null
          state?: string | null
          status?: string
          supplier_type?: string
          tax_number?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_conversions: {
        Row: {
          business_id: string
          created_at: string
          factor: number
          from_unit: string
          id: string
          product_id: string | null
          to_unit: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          factor?: number
          from_unit: string
          id?: string
          product_id?: string | null
          to_unit: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          factor?: number
          from_unit?: string
          id?: string
          product_id?: string | null
          to_unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "unit_conversions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_conversions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      units_of_measure: {
        Row: {
          business_id: string
          category: string
          code: string
          created_at: string
          id: string
          is_base: boolean
          name: string
          updated_at: string
        }
        Insert: {
          business_id: string
          category?: string
          code: string
          created_at?: string
          id?: string
          is_base?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          category?: string
          code?: string
          created_at?: string
          id?: string
          is_base?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_of_measure_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      user_businesses: {
        Row: {
          business_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          status: string
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_businesses_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          business_id: string
          code: string | null
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          location: string | null
          name: string
          parent_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          business_id: string
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          location?: string | null
          name: string
          parent_id?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          location?: string | null
          name?: string
          parent_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouses_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      business_role: {
        Args: { _business_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      can_manage_sensitive: { Args: { _business_id: string }; Returns: boolean }
      can_write_business: { Args: { _business_id: string }; Returns: boolean }
      close_register: {
        Args: { _actual: number; _reason: string; _register_id: string }
        Returns: number
      }
      complete_sale: { Args: { _sale_id: string }; Returns: undefined }
      confirm_goods_receipt: {
        Args: { _receipt_id: string }
        Returns: undefined
      }
      current_partner_id: { Args: never; Returns: string }
      gen_referral_code: { Args: { _len?: number }; Returns: string }
      is_business_admin: { Args: { _business_id: string }; Returns: boolean }
      is_business_member: { Args: { _business_id: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      movement_sign: { Args: { _type: string }; Returns: number }
      next_doc_number: {
        Args: { _business_id: string; _prefix: string }
        Returns: string
      }
      notify_business: {
        Args: {
          _business_id: string
          _link: string
          _message: string
          _title: string
          _type: string
        }
        Returns: undefined
      }
      payment_terms_days: { Args: { _terms: string }; Returns: number }
      post_purchase_return: { Args: { _return_id: string }; Returns: undefined }
      post_sales_return: { Args: { _return_id: string }; Returns: undefined }
      produce_from_bom: {
        Args: { _batches?: number; _bom_id: string }
        Returns: number
      }
      recalc_product_cost_from_bom: {
        Args: { _product_id: string }
        Returns: undefined
      }
      scan_business_alerts: { Args: { _business_id: string }; Returns: number }
      seed_business_defaults: {
        Args: { _business_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "owner"
        | "admin"
        | "manager"
        | "accountant"
        | "cashier"
        | "inventory_staff"
        | "warehouse_staff"
        | "employee"
        | "auditor"
        | "hr"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: [
        "owner",
        "admin",
        "manager",
        "accountant",
        "cashier",
        "inventory_staff",
        "warehouse_staff",
        "employee",
        "auditor",
        "hr",
      ],
    },
  },
} as const
