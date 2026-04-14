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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      absence_justifications: {
        Row: {
          admin_notes: string | null
          created_at: string
          date: string
          employee_id: string
          file_url: string | null
          id: string
          reason: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          date: string
          employee_id: string
          file_url?: string | null
          id?: string
          reason: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          date?: string
          employee_id?: string
          file_url?: string | null
          id?: string
          reason?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "absence_justifications_employee_id_fkey"
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
          admin_user_id: string | null
          created_at: string
          details: Json | null
          id: string
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          admin_user_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          admin_user_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type?: string
        }
        Relationships: []
      }
      employees: {
        Row: {
          active: boolean
          cpf: string | null
          created_at: string
          id: string
          name: string
          punch_mode: string
          shift: string
        }
        Insert: {
          active?: boolean
          cpf?: string | null
          created_at?: string
          id?: string
          name: string
          punch_mode?: string
          shift?: string
        }
        Update: {
          active?: boolean
          cpf?: string | null
          created_at?: string
          id?: string
          name?: string
          punch_mode?: string
          shift?: string
        }
        Relationships: []
      }
      manual_punches: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          punched_at: string
          reason: string | null
          step: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          punched_at: string
          reason?: string | null
          step: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          punched_at?: string
          reason?: string | null
          step?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_punches_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      punch_records: {
        Row: {
          address: string | null
          created_at: string
          employee_id: string
          id: string
          latitude: number | null
          longitude: number | null
          photo_url: string | null
          punched_at: string
          step: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          employee_id: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          photo_url?: string | null
          punched_at?: string
          step: string
        }
        Update: {
          address?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          photo_url?: string | null
          punched_at?: string
          step?: string
        }
        Relationships: [
          {
            foreignKeyName: "punch_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      time_records: {
        Row: {
          address: string | null
          created_at: string
          employee_id: string
          id: string
          latitude: number | null
          longitude: number | null
          mode: string
          record_type: string
          recorded_at: string
          sync_status: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          employee_id: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          mode?: string
          record_type: string
          recorded_at?: string
          sync_status?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          mode?: string
          record_type?: string
          recorded_at?: string
          sync_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_active_employee_by_cpf: {
        Args: { p_cpf: string }
        Returns: {
          cpf: string
          id: string
          name: string
          punch_mode: string
          shift: string
        }[]
      }
      get_active_employee_public_by_id: {
        Args: { p_employee_id: string }
        Returns: {
          has_cpf: boolean
          id: string
          name: string
          punch_mode: string
          shift: string
        }[]
      }
      get_active_employees_public: {
        Args: never
        Returns: {
          has_cpf: boolean
          id: string
          name: string
          punch_mode: string
          shift: string
        }[]
      }
      get_active_employees_with_cpf: {
        Args: never
        Returns: {
          cpf: string
          id: string
          name: string
          punch_mode: string
          shift: string
        }[]
      }
      get_next_record_step_by_cpf: {
        Args: { p_cpf: string }
        Returns: {
          cpf: string
          day_complete: boolean
          employee_id: string
          jornada: string
          name: string
          next_step: string
          records_today: Json
          shift: string
        }[]
      }
      get_today_records_for_employee: {
        Args: { p_employee_id: string; p_end_ts: string; p_start_ts: string }
        Returns: {
          created_at: string
          employee_id: string
          id: string
          latitude: number
          longitude: number
          mode: string
          record_type: string
          recorded_at: string
          sync_status: string
        }[]
      }
      insert_justification_with_cpf: {
        Args: {
          p_cpf: string
          p_date: string
          p_file_url?: string
          p_reason: string
        }
        Returns: string
      }
      insert_manual_punch_with_cpf: {
        Args: {
          p_cpf: string
          p_punched_at: string
          p_reason?: string
          p_step: string
        }
        Returns: string
      }
      insert_time_record_with_cpf: {
        Args: {
          p_cpf: string
          p_latitude?: number
          p_longitude?: number
          p_mode?: string
          p_record_type: string
          p_recorded_at: string
          p_sync_status?: string
        }
        Returns: string
      }
      is_active_employee: { Args: { p_employee_id: string }; Returns: boolean }
      validate_employee_cpf: {
        Args: { p_cpf: string; p_employee_id: string }
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
