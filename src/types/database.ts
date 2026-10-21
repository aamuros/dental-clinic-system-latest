export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      appointments: {
        Row: {
          branch_id: string
          clinic_id: string
          created_at: string
          dentist_staff_id: string | null
          ends_at: string
          id: string
          patient_id: string
          starts_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
        }
        Insert: {
          branch_id: string
          clinic_id: string
          created_at?: string
          dentist_staff_id?: string | null
          ends_at: string
          id?: string
          patient_id: string
          starts_at: string
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Update: {
          branch_id?: string
          clinic_id?: string
          created_at?: string
          dentist_staff_id?: string | null
          ends_at?: string
          id?: string
          patient_id?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_branch_id_clinic_id_fkey"
            columns: ["branch_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "appointments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_dentist_staff_id_clinic_id_fkey"
            columns: ["dentist_staff_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "appointments_patient_id_branch_id_fkey"
            columns: ["patient_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "patient_branch_access"
            referencedColumns: ["patient_id", "branch_id"]
          },
          {
            foreignKeyName: "appointments_patient_id_clinic_id_fkey"
            columns: ["patient_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id", "clinic_id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_staff_id: string
          branch_id: string | null
          clinic_id: string
          id: string
          occurred_at: string
          resource_id: string | null
          resource_type: string
        }
        Insert: {
          action: string
          actor_staff_id: string
          branch_id?: string | null
          clinic_id: string
          id?: string
          occurred_at?: string
          resource_id?: string | null
          resource_type: string
        }
        Update: {
          action?: string
          actor_staff_id?: string
          branch_id?: string | null
          clinic_id?: string
          id?: string
          occurred_at?: string
          resource_id?: string | null
          resource_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_staff_id_clinic_id_fkey"
            columns: ["actor_staff_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "audit_logs_branch_id_clinic_id_fkey"
            columns: ["branch_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "audit_logs_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinics: {
        Row: {
          created_at: string
          id: string
          name: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      patient_branch_access: {
        Row: {
          branch_id: string
          clinic_id: string
          created_at: string
          patient_id: string
        }
        Insert: {
          branch_id: string
          clinic_id: string
          created_at?: string
          patient_id: string
        }
        Update: {
          branch_id?: string
          clinic_id?: string
          created_at?: string
          patient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_branch_access_branch_id_clinic_id_fkey"
            columns: ["branch_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "patient_branch_access_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_branch_access_patient_id_clinic_id_fkey"
            columns: ["patient_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id", "clinic_id"]
          },
        ]
      }
      patients: {
        Row: {
          address: string | null
          birth_date: string | null
          clinic_id: string
          created_at: string
          email: string | null
          first_name: string
          gender: string
          id: string
          last_name: string
          middle_name: string | null
          phone: string | null
          search_text: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          birth_date?: string | null
          clinic_id: string
          created_at?: string
          email?: string | null
          first_name: string
          gender?: string
          id?: string
          last_name: string
          middle_name?: string | null
          phone?: string | null
          search_text?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          birth_date?: string | null
          clinic_id?: string
          created_at?: string
          email?: string | null
          first_name?: string
          gender?: string
          id?: string
          last_name?: string
          middle_name?: string | null
          phone?: string | null
          search_text?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patients_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_profiles: {
        Row: {
          clinic_id: string
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          display_name: string
          id: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_profiles_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_role_assignments: {
        Row: {
          branch_id: string | null
          clinic_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["staff_role"]
          staff_id: string
        }
        Insert: {
          branch_id?: string | null
          clinic_id: string
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["staff_role"]
          staff_id: string
        }
        Update: {
          branch_id?: string | null
          clinic_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["staff_role"]
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_role_assignments_branch_id_clinic_id_fkey"
            columns: ["branch_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "staff_role_assignments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_role_assignments_staff_id_clinic_id_fkey"
            columns: ["staff_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id", "clinic_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      appointment_dentists: { Args: never; Returns: Json }
      appointment_patients: {
        Args: { p_branch: string; p_query?: string }
        Returns: Json
      }
      appointment_schedule: {
        Args: {
          p_branch?: string
          p_dentist?: string
          p_from: string
          p_page?: number
          p_patient?: string
          p_status?: Database["public"]["Enums"]["appointment_status"]
          p_to: string
        }
        Returns: Json
      }
      save_appointment: {
        Args: {
          p_branch: string
          p_dentist: string
          p_duration: number
          p_expected_updated_at?: string
          p_id?: string
          p_patient: string
          p_start: string
          p_status: Database["public"]["Enums"]["appointment_status"]
        }
        Returns: string
      }
      save_patient: {
        Args: {
          p_allow_duplicate?: boolean
          p_branch_ids: string[]
          p_details: Json
          p_expected_updated_at?: string
          p_patient_id?: string
        }
        Returns: Json
      }
    }
    Enums: {
      appointment_status: "scheduled" | "confirmed" | "completed" | "cancelled"
      staff_role:
        | "administrator"
        | "dentist"
        | "dental_assistant"
        | "receptionist"
        | "billing_staff"
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
      appointment_status: ["scheduled", "confirmed", "completed", "cancelled"],
      staff_role: [
        "administrator",
        "dentist",
        "dental_assistant",
        "receptionist",
        "billing_staff",
      ],
    },
  },
} as const

