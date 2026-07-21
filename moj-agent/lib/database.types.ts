export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      conversations: {
        Row: {
          id: string;
          created_at: string;
          title: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          created_at?: string;
          title?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          created_at?: string;
          title?: string | null;
          updated_at?: string;
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
        };
        Insert: {
          id?: string;
          created_at?: string;
          title?: string | null;
          content: string;
          embedding?: number[] | null;
          metadata?: Json;
        };
        Update: {
          id?: string;
          created_at?: string;
          title?: string | null;
          content?: string;
          embedding?: number[] | null;
          metadata?: Json;
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
      user_profiles: {
        Row: {
          id: string;
          created_at: string;
          name: string | null;
          preferences: Json;
        };
        Insert: {
          id?: string;
          created_at?: string;
          name?: string | null;
          preferences?: Json;
        };
        Update: {
          id?: string;
          created_at?: string;
          name?: string | null;
          preferences?: Json;
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
