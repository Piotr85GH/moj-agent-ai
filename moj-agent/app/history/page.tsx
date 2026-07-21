"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type ConversationRow = {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  conversation_id: string | null;
  content: string | null;
  created_at: string;
};

type ConversationSummary = ConversationRow & {
  messageCount: number;
  preview: string;
  searchableText: string;
};

function formatRelativeDate(value: string) {
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) {
    return "przed chwila";
  }

  if (minutes < 60) {
    return `${minutes} min temu`;
  }

  if (hours < 24) {
    return `${hours} godz. temu`;
  }

  if (days === 1) {
    return "wczoraj";
  }

  return new Intl.DateTimeFormat("pl-PL", {
    day: "numeric",
    month: "long",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  }).format(date);
}

function shorten(text: string, maxLength: number) {
  const normalized = text.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
}

export default function HistoryPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");

  async function loadConversations() {
    setIsLoading(true);
    setStatus("");

    const { data: conversationRows, error: conversationsError } = await supabase
      .from("conversations")
      .select("id, title, created_at, updated_at")
      .order("updated_at", { ascending: false });

    if (conversationsError) {
      setStatus(`Nie udalo sie pobrac rozmow: ${conversationsError.message}`);
      setIsLoading(false);
      return;
    }

    const ids = (conversationRows ?? []).map((conversation) => conversation.id);
    const { data: messageRows, error: messagesError } = ids.length
      ? await supabase
          .from("messages")
          .select("conversation_id, content, created_at")
          .in("conversation_id", ids)
          .order("created_at", { ascending: true })
      : { data: [] as MessageRow[], error: null };

    if (messagesError) {
      setStatus(`Nie udalo sie pobrac wiadomosci: ${messagesError.message}`);
      setIsLoading(false);
      return;
    }

    const messagesByConversation = new Map<string, MessageRow[]>();

    for (const message of messageRows ?? []) {
      if (!message.conversation_id) {
        continue;
      }

      const current = messagesByConversation.get(message.conversation_id) ?? [];
      current.push(message);
      messagesByConversation.set(message.conversation_id, current);
    }

    const summaries = (conversationRows ?? []).map((conversation) => {
      const messages = messagesByConversation.get(conversation.id) ?? [];
      const lastMessage = messages.at(-1)?.content ?? "";
      const allMessageText = messages
        .map((message) => message.content ?? "")
        .join(" ");

      return {
        ...conversation,
        messageCount: messages.length,
        preview: lastMessage ? shorten(lastMessage, 100) : "Brak wiadomosci.",
        searchableText: `${conversation.title ?? ""} ${allMessageText}`.toLowerCase(),
      };
    });

    setConversations(summaries);
    setIsLoading(false);
  }

  useEffect(() => {
    loadConversations();
  }, []);

  const filteredConversations = useMemo(() => {
    const phrase = search.trim().toLowerCase();

    if (!phrase) {
      return conversations;
    }

    return conversations.filter((conversation) =>
      conversation.searchableText.includes(phrase),
    );
  }, [conversations, search]);

  async function deleteConversation(id: string) {
    const confirmed = window.confirm(
      "Czy na pewno chcesz usunac te rozmowe? Tej operacji nie mozna cofnac.",
    );

    if (!confirmed) {
      return;
    }

    const { error: messagesError } = await supabase
      .from("messages")
      .delete()
      .eq("conversation_id", id);

    if (messagesError) {
      setStatus(`Nie udalo sie usunac wiadomosci: ${messagesError.message}`);
      return;
    }

    const { error: conversationError } = await supabase
      .from("conversations")
      .delete()
      .eq("id", id);

    if (conversationError) {
      setStatus(`Nie udalo sie usunac rozmowy: ${conversationError.message}`);
      return;
    }

    setConversations((current) =>
      current.filter((conversation) => conversation.id !== id),
    );
    setStatus("Rozmowa usunieta");
  }

  return (
    <main className="history-shell">
      <section className="history-panel" aria-label="Historia rozmow">
        <header className="history-header">
          <div>
            <h1>Historia rozmow</h1>
            <p>Wszystkie Twoje rozmowy z agentem</p>
          </div>
          <Link className="history-primary-link" href="/chat">
            Rozpocznij rozmowe
          </Link>
        </header>

        <div className="history-toolbar">
          <input
            aria-label="Szukaj w rozmowach"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Szukaj w rozmowach..."
            value={search}
          />
          {status && <span>{status}</span>}
        </div>

        {isLoading ? (
          <div className="history-empty">Wczytuje historie rozmow...</div>
        ) : filteredConversations.length === 0 ? (
          <div className="history-empty">
            <p>Nie masz jeszcze zadnych rozmow. Zacznij nowa!</p>
            <Link className="history-primary-link" href="/chat">
              Rozpocznij rozmowe
            </Link>
          </div>
        ) : (
          <div className="history-list">
            {filteredConversations.map((conversation) => (
              <article
                className="history-card"
                key={conversation.id}
                onClick={() => router.push(`/history/${conversation.id}`)}
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    router.push(`/history/${conversation.id}`);
                  }
                }}
              >
                <div className="history-card-main">
                  <h2>{conversation.title || "Nowa rozmowa"}</h2>
                  <p className="history-meta">
                    {formatRelativeDate(conversation.updated_at)} |{" "}
                    {conversation.messageCount} wiad.
                  </p>
                  <p className="history-preview">{conversation.preview}</p>
                </div>
                <button
                  aria-label="Usun rozmowe"
                  className="history-delete"
                  onClick={(event) => {
                    event.stopPropagation();
                    void deleteConversation(conversation.id);
                  }}
                  type="button"
                >
                  Usun
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
