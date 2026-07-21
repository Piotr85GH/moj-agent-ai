"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Conversation = {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
};

type Message = {
  id: string;
  created_at: string;
  role: string | null;
  content: string | null;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function HistoryDetailPage() {
  const params = useParams<{ id: string }>();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let isCancelled = false;

    async function loadConversation() {
      setIsLoading(true);
      setStatus("");

      const { data: conversationRow, error: conversationError } = await supabase
        .from("conversations")
        .select("id, title, created_at, updated_at")
        .eq("id", params.id)
        .maybeSingle();

      if (isCancelled) {
        return;
      }

      if (conversationError) {
        setStatus(`Nie udalo sie pobrac rozmowy: ${conversationError.message}`);
        setIsLoading(false);
        return;
      }

      if (!conversationRow) {
        setStatus("Nie znaleziono rozmowy.");
        setIsLoading(false);
        return;
      }

      const { data: messageRows, error: messagesError } = await supabase
        .from("messages")
        .select("id, created_at, role, content")
        .eq("conversation_id", params.id)
        .order("created_at", { ascending: true });

      if (isCancelled) {
        return;
      }

      if (messagesError) {
        setStatus(`Nie udalo sie pobrac wiadomosci: ${messagesError.message}`);
        setIsLoading(false);
        return;
      }

      setConversation(conversationRow);
      setMessages(messageRows ?? []);
      setIsLoading(false);
    }

    loadConversation();

    return () => {
      isCancelled = true;
    };
  }, [params.id]);

  return (
    <main className="history-shell">
      <section className="history-panel" aria-label="Podglad rozmowy">
        <header className="history-header">
          <div>
            <h1>{conversation?.title || "Rozmowa"}</h1>
            <p>
              {conversation
                ? `Ostatnia aktywnosc: ${formatDateTime(conversation.updated_at)}`
                : "Wczytuje rozmowe..."}
            </p>
          </div>
          <div className="history-header-actions">
            <Link className="history-secondary-link" href="/history">
              Wroc do listy
            </Link>
            <Link
              className="history-primary-link"
              href={`/chat?conversation=${params.id}`}
            >
              Kontynuuj rozmowe
            </Link>
          </div>
        </header>

        {isLoading ? (
          <div className="history-empty">Wczytuje wiadomosci...</div>
        ) : status ? (
          <div className="history-empty">{status}</div>
        ) : (
          <div className="history-message-list">
            {messages.map((message) => {
              const role = message.role === "user" ? "user" : "assistant";

              return (
                <div className={`history-message-row ${role}`} key={message.id}>
                  <div className="history-message-bubble">
                    <div className="history-message-meta">
                      <span>{role === "user" ? "Ty" : "Agent"}</span>
                      <time>{formatTime(message.created_at)}</time>
                    </div>
                    <p>{message.content || ""}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
