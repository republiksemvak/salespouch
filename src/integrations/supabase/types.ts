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
      expense_categories: {
        Row: {
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          name: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          name: string
          owner_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          name?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_categories_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      license_packages: {
        Row: {
          active: boolean
          created_at: string
          days: number
          id: string
          name: string
          price: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          days: number
          id?: string
          name: string
          price?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          days?: number
          id?: string
          name?: string
          price?: number
        }
        Relationships: []
      }
      outlets: {
        Row: {
          address: string | null
          created_at: string
          id: string
          map_location: string | null
          name: string
          owner_name: string | null
          owner_phone: string | null
          route_notes: string | null
          store_photo: string | null
          user_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          map_location?: string | null
          name: string
          owner_name?: string | null
          owner_phone?: string | null
          route_notes?: string | null
          store_photo?: string | null
          user_id?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          map_location?: string | null
          name?: string
          owner_name?: string | null
          owner_phone?: string | null
          route_notes?: string | null
          store_photo?: string | null
          user_id?: string
        }
        Relationships: []
      }
      personal_reminders: {
        Row: {
          account_id: string
          created_at: string
          id: string
          note: string | null
          reminder_date: string | null
          title: string
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          note?: string | null
          reminder_date?: string | null
          title: string
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          note?: string | null
          reminder_date?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_reminders_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          cost_price: number
          created_at: string
          id: string
          name: string
          pcs_per_pack: number
          price: number
          price_agen: number
          price_grosir: number
          user_id: string
          warehouse_stock: number
        }
        Insert: {
          cost_price?: number
          created_at?: string
          id?: string
          name: string
          pcs_per_pack?: number
          price?: number
          price_agen?: number
          price_grosir?: number
          user_id?: string
          warehouse_stock?: number
        }
        Update: {
          cost_price?: number
          created_at?: string
          id?: string
          name?: string
          pcs_per_pack?: number
          price?: number
          price_agen?: number
          price_grosir?: number
          user_id?: string
          warehouse_stock?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          business_address: string | null
          business_category: string | null
          business_model: string | null
          business_name: string | null
          business_phone: string | null
          created_at: string
          display_name: string | null
          id: string
          license_until: string | null
          main_product: string | null
          stock_scheme: string
          user_email: string | null
          username: string | null
        }
        Insert: {
          business_address?: string | null
          business_category?: string | null
          business_model?: string | null
          business_name?: string | null
          business_phone?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          license_until?: string | null
          main_product?: string | null
          stock_scheme?: string
          user_email?: string | null
          username?: string | null
        }
        Update: {
          business_address?: string | null
          business_category?: string | null
          business_model?: string | null
          business_name?: string | null
          business_phone?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          license_until?: string | null
          main_product?: string | null
          stock_scheme?: string
          user_email?: string | null
          username?: string | null
        }
        Relationships: []
      }
      promos: {
        Row: {
          active: boolean
          bonus_days: number
          code: string
          created_at: string
          description: string | null
          discount_percent: number
          id: string
          valid_until: string | null
        }
        Insert: {
          active?: boolean
          bonus_days?: number
          code: string
          created_at?: string
          description?: string | null
          discount_percent?: number
          id?: string
          valid_until?: string | null
        }
        Update: {
          active?: boolean
          bonus_days?: number
          code?: string
          created_at?: string
          description?: string | null
          discount_percent?: number
          id?: string
          valid_until?: string | null
        }
        Relationships: []
      }
      sales_expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          id: string
          note: string | null
          owner_id: string
          sales_id: string
          spent_at: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          id?: string
          note?: string | null
          owner_id: string
          sales_id: string
          spent_at?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          id?: string
          note?: string | null
          owner_id?: string
          sales_id?: string
          spent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_expenses_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_expenses_sales_id_fkey"
            columns: ["sales_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_stock_day_loads: {
        Row: {
          created_at: string
          day_id: string
          id: string
          movement_id: string | null
          owner_id: string
          product_id: string
          quantity: number
        }
        Insert: {
          created_at?: string
          day_id: string
          id?: string
          movement_id?: string | null
          owner_id: string
          product_id: string
          quantity: number
        }
        Update: {
          created_at?: string
          day_id?: string
          id?: string
          movement_id?: string | null
          owner_id?: string
          product_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_stock_day_loads_day_id_fkey"
            columns: ["day_id"]
            isOneToOne: false
            referencedRelation: "sales_stock_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_stock_day_loads_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "stock_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_stock_day_loads_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_stock_day_loads_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_stock_day_loads_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "sales_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_stock_day_loads_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "warehouse_stock_ledger"
            referencedColumns: ["product_id"]
          },
        ]
      }
      sales_stock_days: {
        Row: {
          closed_at: string | null
          created_at: string
          id: string
          opened_at: string
          owner_id: string
          sales_location_id: string
          sales_user_id: string
          status: string
          stock_date: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          id?: string
          opened_at?: string
          owner_id: string
          sales_location_id: string
          sales_user_id: string
          status?: string
          stock_date: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          id?: string
          opened_at?: string
          owner_id?: string
          sales_location_id?: string
          sales_user_id?: string
          status?: string
          stock_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_stock_days_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_stock_days_sales_location_id_fkey"
            columns: ["sales_location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_stock_days_sales_user_id_fkey"
            columns: ["sales_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_travel_funds: {
        Row: {
          amount: number
          created_at: string
          given_at: string
          id: string
          note: string | null
          owner_id: string
          sales_id: string
          transaction_type: string
        }
        Insert: {
          amount: number
          created_at?: string
          given_at?: string
          id?: string
          note?: string | null
          owner_id: string
          sales_id: string
          transaction_type?: string
        }
        Update: {
          amount?: number
          created_at?: string
          given_at?: string
          id?: string
          note?: string | null
          owner_id?: string
          sales_id?: string
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_travel_funds_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_travel_funds_sales_id_fkey"
            columns: ["sales_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_locations: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          location_type: string
          name: string
          outlet_id: string | null
          owner_id: string
          team_member_user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          location_type: string
          name: string
          outlet_id?: string | null
          owner_id: string
          team_member_user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          location_type?: string
          name?: string
          outlet_id?: string | null
          owner_id?: string
          team_member_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_locations_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_locations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_locations_team_member_user_id_fkey"
            columns: ["team_member_user_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["user_id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_at: string
          from_location_id: string | null
          id: string
          movement_type: string
          notes: string | null
          occurred_at: string
          owner_id: string
          product_id: string
          quantity: number
          reference_id: string | null
          reference_type: string | null
          to_location_id: string | null
        }
        Insert: {
          created_at?: string
          from_location_id?: string | null
          id?: string
          movement_type: string
          notes?: string | null
          occurred_at?: string
          owner_id: string
          product_id: string
          quantity: number
          reference_id?: string | null
          reference_type?: string | null
          to_location_id?: string | null
        }
        Update: {
          created_at?: string
          from_location_id?: string | null
          id?: string
          movement_type?: string
          notes?: string | null
          occurred_at?: string
          owner_id?: string
          product_id?: string
          quantity?: number
          reference_id?: string | null
          reference_type?: string | null
          to_location_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_from_location_id_fkey"
            columns: ["from_location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "sales_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "warehouse_stock_ledger"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "stock_movements_to_location_id_fkey"
            columns: ["to_location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_opening_items: {
        Row: {
          counted_at: string
          created_at: string
          id: string
          location_id: string
          owner_id: string
          product_id: string
          quantity: number
          setup_id: string
          updated_at: string
        }
        Insert: {
          counted_at?: string
          created_at?: string
          id?: string
          location_id: string
          owner_id: string
          product_id: string
          quantity?: number
          setup_id: string
          updated_at?: string
        }
        Update: {
          counted_at?: string
          created_at?: string
          id?: string
          location_id?: string
          owner_id?: string
          product_id?: string
          quantity?: number
          setup_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_opening_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_opening_items_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_opening_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_opening_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "sales_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_opening_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "warehouse_stock_ledger"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "stock_opening_items_setup_id_fkey"
            columns: ["setup_id"]
            isOneToOne: false
            referencedRelation: "stock_setups"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_setups: {
        Row: {
          created_at: string
          finalized_at: string | null
          id: string
          mode: string
          owner_id: string
          started_at: string
          status: string
        }
        Insert: {
          created_at?: string
          finalized_at?: string | null
          id?: string
          mode: string
          owner_id: string
          started_at?: string
          status?: string
        }
        Update: {
          created_at?: string
          finalized_at?: string | null
          id?: string
          mode?: string
          owner_id?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_setups_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      store_schedules: {
        Row: {
          created_at: string
          day_of_week: number
          id: string
          note: string | null
          outlet_id: string
          owner_id: string
          sales_id: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          id?: string
          note?: string | null
          outlet_id: string
          owner_id: string
          sales_id: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          id?: string
          note?: string | null
          outlet_id?: string
          owner_id?: string
          sales_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_schedules_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_schedules_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_schedules_sales_id_fkey"
            columns: ["sales_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      system_maintenance: {
        Row: {
          enabled: boolean
          eta: string | null
          id: number
          message: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled?: boolean
          eta?: string | null
          id?: number
          message?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          eta?: string | null
          id?: number
          message?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      team_members: {
        Row: {
          created_at: string
          manager_id: string | null
          owner_id: string
          position: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          manager_id?: string | null
          owner_id: string
          position?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          manager_id?: string | null
          owner_id?: string
          position?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "team_members_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      team_permissions: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          permission_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id: string
          permission_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          permission_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_permissions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount_paid: number
          created_at: string
          custom_note: string | null
          discount_amount: number
          id: string
          line_items: Json
          new_consignment_items: Json
          outlet_id: string
          previous_debt: number
          receipt_number: string
          remaining_debt: number
          revised_at: string | null
          sales_name: string
          sales_user_id: string | null
          stock_scheme: string
          stock_source: string | null
          total_due: number
          total_sales: number
          transaction_type: string
          user_id: string
          visit_date: string
        }
        Insert: {
          amount_paid?: number
          created_at?: string
          custom_note?: string | null
          discount_amount?: number
          id?: string
          line_items?: Json
          new_consignment_items?: Json
          outlet_id: string
          previous_debt?: number
          receipt_number: string
          remaining_debt?: number
          revised_at?: string | null
          sales_name: string
          sales_user_id?: string | null
          stock_scheme?: string
          stock_source?: string | null
          total_due?: number
          total_sales?: number
          transaction_type?: string
          user_id?: string
          visit_date?: string
        }
        Update: {
          amount_paid?: number
          created_at?: string
          custom_note?: string | null
          discount_amount?: number
          id?: string
          line_items?: Json
          new_consignment_items?: Json
          outlet_id?: string
          previous_debt?: number
          receipt_number?: string
          remaining_debt?: number
          revised_at?: string | null
          sales_name?: string
          sales_user_id?: string | null
          stock_scheme?: string
          stock_source?: string | null
          total_due?: number
          total_sales?: number
          transaction_type?: string
          user_id?: string
          visit_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_sales_user_id_fkey"
            columns: ["sales_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      warehouse_direct_sales: {
        Row: {
          amount_paid: number
          buyer_name: string
          buyer_outlet_id: string | null
          created_at: string
          custom_note: string | null
          discount_amount: number
          id: string
          line_items: Json
          owner_id: string
          receipt_number: string
          return_items: Json
          sale_date: string
          total_sales: number
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          buyer_name: string
          buyer_outlet_id?: string | null
          created_at?: string
          custom_note?: string | null
          discount_amount?: number
          id?: string
          line_items?: Json
          owner_id: string
          receipt_number: string
          return_items?: Json
          sale_date?: string
          total_sales?: number
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          buyer_name?: string
          buyer_outlet_id?: string | null
          created_at?: string
          custom_note?: string | null
          discount_amount?: number
          id?: string
          line_items?: Json
          owner_id?: string
          receipt_number?: string
          return_items?: Json
          sale_date?: string
          total_sales?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_direct_sales_buyer_outlet_id_fkey"
            columns: ["buyer_outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_direct_sales_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      master_stock_global: {
        Row: {
          global_quantity: number | null
          owner_id: string | null
          product_id: string | null
          product_name: string | null
        }
        Relationships: []
      }
      sales_catalog: {
        Row: {
          id: string | null
          name: string | null
          pcs_per_pack: number | null
          price: number | null
          price_agen: number | null
          price_grosir: number | null
          user_id: string | null
          warehouse_stock: number | null
        }
        Insert: {
          id?: string | null
          name?: string | null
          pcs_per_pack?: number | null
          price?: number | null
          price_agen?: number | null
          price_grosir?: number | null
          user_id?: string | null
          warehouse_stock?: number | null
        }
        Update: {
          id?: string | null
          name?: string | null
          pcs_per_pack?: number | null
          price?: number | null
          price_agen?: number | null
          price_grosir?: number | null
          user_id?: string | null
          warehouse_stock?: number | null
        }
        Relationships: []
      }
      warehouse_stock_ledger: {
        Row: {
          owner_id: string | null
          product_id: string | null
          product_name: string | null
          warehouse_stock: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      business_owner_id: { Args: never; Returns: string }
      close_sales_stock_day: {
        Args: {
          _occurred_at?: string
          _sales_user_id: string
          _stock_date?: string
        }
        Returns: string
      }
      ensure_stock_location: {
        Args: {
          _location_type: string
          _name: string
          _outlet_id?: string
          _owner_id: string
          _team_member_user_id?: string
        }
        Returns: string
      }
      get_sales_current_stock: {
        Args: { _sales_user_id: string }
        Returns: {
          product_id: string
          quantity: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_team_permission: {
        Args: { _permission_key: string; _user_id?: string }
        Returns: boolean
      }
      is_business_manager: { Args: never; Returns: boolean }
      is_business_owner: { Args: never; Returns: boolean }
      is_owner_of_team_member: { Args: { _user_id: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      rebuild_product_warehouse_stock: {
        Args: { _owner_id: string; _product_id: string }
        Returns: undefined
      }
      record_physical_opening_snapshot: {
        Args: {
          _counted_at?: string
          _location_id: string
          _note?: string
          _physical_quantity: number
          _product_id: string
        }
        Returns: string
      }
      record_sales_expense: {
        Args: {
          p_amount: number
          p_category: string
          p_note?: string | null
          p_spent_at?: string
        }
        Returns: {
          amount: number
          category: string
          created_at: string
          id: string
          note: string | null
          owner_id: string
          sales_id: string
          spent_at: string
        }
      }
      record_sales_morning_load: {
        Args: {
          _items: Json
          _occurred_at?: string
          _sales_user_id: string
          _stock_date?: string
        }
        Returns: string
      }
      replace_team_permissions: {
        Args: { _permission_keys: string[]; _user_id: string }
        Returns: undefined
      }
      revise_transaction: {
        Args: {
          _amount_paid: number
          _custom_note: string
          _discount_amount: number
          _line_items: Json
          _new_consignment_items: Json
          _transaction_id: string
        }
        Returns: {
          amount_paid: number
          created_at: string
          custom_note: string | null
          discount_amount: number
          id: string
          line_items: Json
          new_consignment_items: Json
          outlet_id: string
          previous_debt: number
          receipt_number: string
          remaining_debt: number
          revised_at: string | null
          sales_name: string
          sales_user_id: string | null
          stock_scheme: string
          stock_source: string | null
          total_due: number
          total_sales: number
          transaction_type: string
          user_id: string
          visit_date: string
        }
        SetofOptions: {
          from: "*"
          to: "transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sales_location_balance: {
        Args: {
          _owner_id: string
          _product_id: string
          _sales_location_id: string
        }
        Returns: number
      }
      set_team_member_access: {
        Args: {
          _permission_keys: string[]
          _position: string
          _user_id: string
        }
        Returns: undefined
      }
      set_team_member_role: {
        Args: { _position: string; _user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
