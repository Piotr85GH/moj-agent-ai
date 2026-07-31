export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      api_usage: {
        Row: {
          id: string;
          user_id: string;
          created_at: string;
          tokens_input: number;
          tokens_output: number;
          model: string;
          endpoint: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          created_at?: string;
          tokens_input?: number;
          tokens_output?: number;
          model: string;
          endpoint: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          created_at?: string;
          tokens_input?: number;
          tokens_output?: number;
          model?: string;
          endpoint?: string;
        };
        Relationships: [];
      };
      briefings: {
        Row: {
          id: string;
          created_at: string;
          content: string;
          date: string;
          user_id: string | null;
          metadata: Json;
        };
        Insert: {
          id?: string;
          created_at?: string;
          content: string;
          date: string;
          user_id?: string | null;
          metadata?: Json;
        };
        Update: {
          id?: string;
          created_at?: string;
          content?: string;
          date?: string;
          user_id?: string | null;
          metadata?: Json;
        };
        Relationships: [];
      };
      conversations: {
        Row: {
          id: string;
          created_at: string;
          title: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          id?: string;
          created_at?: string;
          title?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          id?: string;
          created_at?: string;
          title?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      documents: {
        Row: {
          id: string;
          created_at: string;
          title: string | null;
          content: string;
          embedding: number[] | null;
          metadata: Json;
          user_id: string;
        };
        Insert: {
          id?: string;
          created_at?: string;
          title?: string | null;
          content: string;
          embedding?: number[] | null;
          metadata?: Json;
          user_id: string;
        };
        Update: {
          id?: string;
          created_at?: string;
          title?: string | null;
          content?: string;
          embedding?: number[] | null;
          metadata?: Json;
          user_id?: string;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          created_at: string;
          conversation_id: string | null;
          role: string | null;
          content: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          conversation_id?: string | null;
          role?: string | null;
          content?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          conversation_id?: string | null;
          role?: string | null;
          content?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      reports: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          user_id: string;
          topic: string;
          title: string | null;
          content: string;
          word_count: number;
          metadata: Json;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          user_id: string;
          topic: string;
          title?: string | null;
          content: string;
          word_count?: number;
          metadata?: Json;
        };
        Update: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          user_id?: string;
          topic?: string;
          title?: string | null;
          content?: string;
          word_count?: number;
          metadata?: Json;
        };
        Relationships: [];
      };
      recipes: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          user_id: string;
          title: string | null;
          products: string[];
          context: string | null;
          content: string;
          word_count: number;
          metadata: Json;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          user_id: string;
          title?: string | null;
          products?: string[];
          context?: string | null;
          content: string;
          word_count?: number;
          metadata?: Json;
        };
        Update: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          user_id?: string;
          title?: string | null;
          products?: string[];
          context?: string | null;
          content?: string;
          word_count?: number;
          metadata?: Json;
        };
        Relationships: [];
      };
      user_profiles: {
        Row: {
          id: string;
          created_at: string;
          name: string | null;
          display_name: string | null;
          preferences: Json;
        };
        Insert: {
          id?: string;
          created_at?: string;
          name?: string | null;
          display_name?: string | null;
          preferences?: Json;
        };
        Update: {
          id?: string;
          created_at?: string;
          name?: string | null;
          display_name?: string | null;
          preferences?: Json;
        };
        Relationships: [];
      };
      webhook_events: {
        Row: {
          id: string;
          created_at: string;
          type: string;
          data: Json;
          analysis: string;
        };
        Insert: {
          id?: string;
          created_at?: string;
          type: string;
          data?: Json;
          analysis: string;
        };
        Update: {
          id?: string;
          created_at?: string;
          type?: string;
          data?: Json;
          analysis?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      match_documents: {
        Args: {
          query_embedding: number[];
          match_threshold?: number;
          match_count?: number;
          p_user_id: string;
        };
        Returns: Array<{
          id: string;
          title: string | null;
          content: string;
          metadata: Json;
          similarity: number;
        }>;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
