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
      bill_of_materials: {
        Row: {
          business_id: string
          created_at: string
          id: string
          name: string
          notes: string | null
          output_quantity: number
          product_id: string
          type: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          output_quantity?: number
          product_id: string
          type?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          output_quantity?: number
          product_id?: string
          type?: string
          updated_at?: string
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
      bom_items: {
        Row: {
          bom_id: string
          business_id: string
          component_product_id: string | null
          created_at: string
          id: string
          quantity: number
        }
        Insert: {
          bom_id: string
          business_id: string
          component_product_id?: string | null
          created_at?: string
          id?: string
          quantity?: number
        }
        Update: {
          bom_id?: string
          business_id?: string
          component_product_id?: string | null
          created_at?: string
          id?: string
          quantity?: number
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
      businesses: {
        Row: {
          address: string | null
          brand_color: string | null
          created_at: string
          created_by: string
          currency: string
          email: string | null
          id: string
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
          created_at?: string
          created_by?: string
          currency?: string
          email?: string | null
          id?: string
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
          created_at?: string
          created_by?: string
          currency?: string
          email?: string | null
          id?: string
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
      customers: {
        Row: {
          address: string | null
          balance: number
          business_id: string
          created_at: string
          credit_limit: number
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          balance?: number
          business_id: string
          created_at?: string
          credit_limit?: number
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          status?: string
          type?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          balance?: number
          business_id?: string
          created_at?: string
          credit_limit?: number
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          status?: string
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
      inventory_movements: {
        Row: {
          batch_number: string | null
          business_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          product_id: string
          quantity: number
          reference: string | null
          type: string
          unit_cost: number
          warehouse_id: string | null
        }
        Insert: {
          batch_number?: string | null
          business_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          product_id: string
          quantity: number
          reference?: string | null
          type: string
          unit_cost?: number
          warehouse_id?: string | null
        }
        Update: {
          batch_number?: string | null
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          reference?: string | null
          type?: string
          unit_cost?: number
          warehouse_id?: string | null
        }
        Relationships: [
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
            foreignKeyName: "inventory_movements_warehouse_id_fkey"
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
      products: {
        Row: {
          barcode: string | null
          batch_number: string | null
          brand: string | null
          business_id: string
          category_id: string | null
          cost_price: number
          created_at: string
          description: string | null
          expiration_date: string | null
          id: string
          image_url: string | null
          is_finished_good: boolean
          name: string
          reorder_level: number
          reserved_stock: number
          selling_price: number
          serial_number: string | null
          sku: string | null
          status: string
          stock: number
          supplier_id: string | null
          tax_rate: number
          unit: string
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          batch_number?: string | null
          brand?: string | null
          business_id: string
          category_id?: string | null
          cost_price?: number
          created_at?: string
          description?: string | null
          expiration_date?: string | null
          id?: string
          image_url?: string | null
          is_finished_good?: boolean
          name: string
          reorder_level?: number
          reserved_stock?: number
          selling_price?: number
          serial_number?: string | null
          sku?: string | null
          status?: string
          stock?: number
          supplier_id?: string | null
          tax_rate?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          batch_number?: string | null
          brand?: string | null
          business_id?: string
          category_id?: string | null
          cost_price?: number
          created_at?: string
          description?: string | null
          expiration_date?: string | null
          id?: string
          image_url?: string | null
          is_finished_good?: boolean
          name?: string
          reorder_level?: number
          reserved_stock?: number
          selling_price?: number
          serial_number?: string | null
          sku?: string | null
          status?: string
          stock?: number
          supplier_id?: string | null
          tax_rate?: number
          unit?: string
          updated_at?: string
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
      purchase_order_items: {
        Row: {
          business_id: string
          created_at: string
          id: string
          product_id: string | null
          purchase_order_id: string
          quantity: number
          received_quantity: number
          total: number
          unit_cost: number
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          product_id?: string | null
          purchase_order_id: string
          quantity?: number
          received_quantity?: number
          total?: number
          unit_cost?: number
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          product_id?: string | null
          purchase_order_id?: string
          quantity?: number
          received_quantity?: number
          total?: number
          unit_cost?: number
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
        ]
      }
      purchase_orders: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          expected_date: string | null
          id: string
          notes: string | null
          order_date: string
          paid: number
          po_number: string
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
          expected_date?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          paid?: number
          po_number: string
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
          expected_date?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          paid?: number
          po_number?: string
          status?: string
          subtotal?: number
          supplier_id?: string | null
          tax?: number
          total?: number
          updated_at?: string
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
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          business_id: string
          created_at: string
          discount: number
          id: string
          product_id: string | null
          product_name: string | null
          quantity: number
          sale_id: string
          tax: number
          total: number
          unit_cost: number
          unit_price: number
        }
        Insert: {
          business_id: string
          created_at?: string
          discount?: number
          id?: string
          product_id?: string | null
          product_name?: string | null
          quantity?: number
          sale_id: string
          tax?: number
          total?: number
          unit_cost?: number
          unit_price?: number
        }
        Update: {
          business_id?: string
          created_at?: string
          discount?: number
          id?: string
          product_id?: string | null
          product_name?: string | null
          quantity?: number
          sale_id?: string
          tax?: number
          total?: number
          unit_cost?: number
          unit_price?: number
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
        ]
      }
      sales: {
        Row: {
          business_id: string
          cost_total: number
          created_at: string
          created_by: string | null
          customer_id: string | null
          discount: number
          id: string
          notes: string | null
          paid: number
          payment_method: string
          payment_status: string
          sale_date: string
          sale_number: string
          sale_type: string
          status: string
          subtotal: number
          tax: number
          total: number
          updated_at: string
        }
        Insert: {
          business_id: string
          cost_total?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          discount?: number
          id?: string
          notes?: string | null
          paid?: number
          payment_method?: string
          payment_status?: string
          sale_date?: string
          sale_number: string
          sale_type?: string
          status?: string
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          cost_total?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          discount?: number
          id?: string
          notes?: string | null
          paid?: number
          payment_method?: string
          payment_status?: string
          sale_date?: string
          sale_number?: string
          sale_type?: string
          status?: string
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
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
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          balance: number
          business_id: string
          contact_person: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          status: string
          tax_number: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          balance?: number
          business_id: string
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          status?: string
          tax_number?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          balance?: number
          business_id?: string
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          status?: string
          tax_number?: string | null
          updated_at?: string
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
          created_at: string
          id: string
          is_default: boolean
          location: string | null
          name: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          is_default?: boolean
          location?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          is_default?: boolean
          location?: string | null
          name?: string
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
      is_business_admin: { Args: { _business_id: string }; Returns: boolean }
      is_business_member: { Args: { _business_id: string }; Returns: boolean }
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
      ],
    },
  },
} as const
