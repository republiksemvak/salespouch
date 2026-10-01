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
          created_at: string
          id: string
          map_location: string | null
          name: string
          owner_phone: string | null
          store_photo: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          map_location?: string | null
          name: string
          owner_phone?: string | null
          store_photo?: string | null
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          map_location?: string | null
          name?: string
          owner_phone?: string | null
          store_photo?: string | null
          user_id?: string
        }
        Relationships: []
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
          business_name: string | null
          business_phone: string | null
          created_at: string
          id: string
          license_until: string | null
          user_email: string | null
        }
        Insert: {
          business_address?: string | null
          business_name?: string | null
          business_phone?: string | null
          created_at?: string
          id: string
          license_until?: string | null
          user_email?: string | null
        }
        Update: {
          business_address?: string | null
          business_name?: string | null
          business_phone?: string | null
          created_at?: string
          id?: string
          license_until?: string | null
          user_email?: string | null
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
      team_members: {
        Row: {
          created_at: string
          owner_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          owner_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          owner_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
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
    }
    Views: {
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
    }
    Functions: {
      business_owner_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_business_owner: { Args: never; Returns: boolean }
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
