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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      fitting_blueprints: {
        Row: {
          payload: Json
          session_hash: string
          updated_at: string
        }
        Insert: {
          payload: Json
          session_hash: string
          updated_at?: string
        }
        Update: {
          payload?: Json
          session_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fitting_blueprints_session_hash_fkey"
            columns: ["session_hash"]
            isOneToOne: true
            referencedRelation: "fitting_sessions"
            referencedColumns: ["session_hash"]
          },
        ]
      }
      fitting_enrichment: {
        Row: {
          payload: Json
          session_hash: string
          updated_at: string
        }
        Insert: {
          payload?: Json
          session_hash: string
          updated_at?: string
        }
        Update: {
          payload?: Json
          session_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fitting_enrichment_session_hash_fkey"
            columns: ["session_hash"]
            isOneToOne: true
            referencedRelation: "fitting_sessions"
            referencedColumns: ["session_hash"]
          },
        ]
      }
      fitting_head_selections: {
        Row: {
          payload: Json
          session_hash: string
          updated_at: string
        }
        Insert: {
          payload: Json
          session_hash: string
          updated_at?: string
        }
        Update: {
          payload?: Json
          session_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fitting_head_selections_session_hash_fkey"
            columns: ["session_hash"]
            isOneToOne: true
            referencedRelation: "fitting_sessions"
            referencedColumns: ["session_hash"]
          },
        ]
      }
      fitting_sessions: {
        Row: {
          session_hash: string
          snapshot: Json
          updated_at: string
        }
        Insert: {
          session_hash: string
          snapshot: Json
          updated_at?: string
        }
        Update: {
          session_hash?: string
          snapshot?: Json
          updated_at?: string
        }
        Relationships: []
      }
      swing_submissions: {
        Row: {
          filename: string
          metadata: Json
          mime_type: string
          object_path: string
          session_hash: string
          size_bytes: number
          status: string
          updated_at: string
        }
        Insert: {
          filename: string
          metadata?: Json
          mime_type: string
          object_path: string
          session_hash: string
          size_bytes: number
          status?: string
          updated_at?: string
        }
        Update: {
          filename?: string
          metadata?: Json
          mime_type?: string
          object_path?: string
          session_hash?: string
          size_bytes?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "swing_submissions_session_hash_fkey"
            columns: ["session_hash"]
            isOneToOne: true
            referencedRelation: "fitting_sessions"
            referencedColumns: ["session_hash"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
