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
          cargo: string | null
          cpf: string | null
          created_at: string
          data_admissao: string | null
          departamento: string | null
          escala: string
          id: string
          matricula: string | null
          name: string
          punch_mode: string
          shift: string
        }
        Insert: {
          active?: boolean
          cargo?: string | null
          cpf?: string | null
          created_at?: string
          data_admissao?: string | null
          departamento?: string | null
          escala?: string
          id?: string
          matricula?: string | null
          name: string
          punch_mode?: string
          shift?: string
        }
        Update: {
          active?: boolean
          cargo?: string | null
          cpf?: string | null
          created_at?: string
          data_admissao?: string | null
          departamento?: string | null
          escala?: string
          id?: string
          matricula?: string | null
          name?: string
          punch_mode?: string
          shift?: string
        }
        Relationships: []
      }
      epi_deliveries: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          delivered_at: string
          delivered_by: string
          employee_id: string
          empresa: string | null
          epi_id: string
          estado: string | null
          expires_at: string
          finalidade: string | null
          id: string
          local_entrega: string | null
          notes: string | null
          quantidade: number | null
          setor: string | null
          signature_url: string | null
          status: string
          tamanho: string | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          delivered_at?: string
          delivered_by?: string
          employee_id: string
          empresa?: string | null
          epi_id: string
          estado?: string | null
          expires_at: string
          finalidade?: string | null
          id?: string
          local_entrega?: string | null
          notes?: string | null
          quantidade?: number | null
          setor?: string | null
          signature_url?: string | null
          status?: string
          tamanho?: string | null
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          delivered_at?: string
          delivered_by?: string
          employee_id?: string
          empresa?: string | null
          epi_id?: string
          estado?: string | null
          expires_at?: string
          finalidade?: string | null
          id?: string
          local_entrega?: string | null
          notes?: string | null
          quantidade?: number | null
          setor?: string | null
          signature_url?: string | null
          status?: string
          tamanho?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "epi_deliveries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "epi_deliveries_epi_id_fkey"
            columns: ["epi_id"]
            isOneToOne: false
            referencedRelation: "epis"
            referencedColumns: ["id"]
          },
        ]
      }
      epis: {
        Row: {
          active: boolean
          ca: string | null
          category: string
          codigo: string | null
          created_at: string
          id: string
          mandatory: boolean
          marca: string | null
          name: string
          updated_at: string
          validity_days: number
        }
        Insert: {
          active?: boolean
          ca?: string | null
          category?: string
          codigo?: string | null
          created_at?: string
          id?: string
          mandatory?: boolean
          marca?: string | null
          name: string
          updated_at?: string
          validity_days?: number
        }
        Update: {
          active?: boolean
          ca?: string | null
          category?: string
          codigo?: string | null
          created_at?: string
          id?: string
          mandatory?: boolean
          marca?: string | null
          name?: string
          updated_at?: string
          validity_days?: number
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
      profiles: {
        Row: {
          active: boolean
          created_at: string
          email: string
          full_name: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
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
      [_ in never]: never
    }
    Functions: {
      accept_epi_delivery: {
        Args: { p_cpf: string; p_delivery_id: string; p_signature_url: string }
        Returns: boolean
      }
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
      get_pending_epi_by_cpf: {
        Args: { p_cpf: string }
        Returns: {
          delivered_at: string
          delivered_by: string
          delivery_id: string
          employee_id: string
          employee_name: string
          epi_category: string
          epi_name: string
          expires_at: string
          notes: string
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
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
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      validate_employee_cpf: {
        Args: { p_cpf: string; p_employee_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "usuario"
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
      app_role: ["admin", "usuario"],
    },
  },
} as const
