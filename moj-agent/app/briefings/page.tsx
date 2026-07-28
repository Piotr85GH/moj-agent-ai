"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";

import { useAuth } from "../auth-provider";

type Briefing = {
  id: string;
  created_at: string;
  content: string;
  date: string;
};

function shorten(text: string, maxLength: number) {
  const normalized = text.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
}

function formatBriefingDate(value: string) {
  const date = new Date(`${value}T12:00:00`);

  return new Intl.DateTimeFormat("pl-PL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    weekday: "long",
  }).format(date);
}

function formatCreatedAt(value: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function renderInline(text: string) {
  return text
    .split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s)]+)/g)
    .map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={index}>{part.slice(2, -2)}</strong>;
      }

      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
      if (link) {
        return (
          <a href={link[2]} key={index} rel="noreferrer" target="_blank">
            {link[1]}
          </a>
        );
      }

      if (/^https?:\/\//.test(part)) {
        return (
          <a href={part} key={index} rel="noreferrer" target="_blank">
            {part}
          </a>
        );
      }

      return <span key={index}>{part}</span>;
    });
}

function BriefingMarkdown({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let listItems: ReactNode[] = [];

  function flushList(key: string) {
    if (listItems.length === 0) {
      return;
    }

    blocks.push(<ul key={key}>{listItems}</ul>);
    listItems = [];
  }

  lines.forEach((line, index) => {
    if (!line.trim()) {
      flushList(`list-${index}`);
      return;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flushList(`list-${index}`);
      const level = heading[1].length;
      const content = renderInline(heading[2]);

      blocks.push(
        level === 1 ? (
          <h1 key={index}>{content}</h1>
        ) : level === 2 ? (
          <h2 key={index}>{content}</h2>
        ) : (
          <h3 key={index}>{content}</h3>
        ),
      );
      return;
    }

    const listItem = /^[-*]\s+(.+)$/.exec(line);
    if (listItem) {
      listItems.push(<li key={index}>{renderInline(listItem[1])}</li>);
      return;
    }

    flushList(`list-${index}`);
    blocks.push(<p key={index}>{renderInline(line)}</p>);
  });

  flushList("list-end");

  return <div className="briefing-markdown">{blocks}</div>;
}

export default function BriefingsPage() {
  const { getAccessToken } = useAuth();
  const [briefings, setBriefings] = useState<Briefing[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState("");
  const [copyStatus, setCopyStatus] = useState("");

  const selectedBriefing = useMemo(
    () => briefings.find((briefing) => briefing.id === selectedId) ?? null,
    [briefings, selectedId],
  );

  async function loadBriefings(clearStatus = true) {
    setIsLoading(true);
    if (clearStatus) {
      setStatus("");
    }

    try {
      const accessToken = await getAccessToken();
      const response = await fetch("/api/briefings", {
        cache: "no-store",
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        briefings?: Briefing[];
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Nie udalo sie pobrac briefingow.");
      }

      setBriefings(data.briefings ?? []);
      setSelectedId((current) => {
        if (!data.briefings?.length) {
          return null;
        }

        if (!current) {
          return data.briefings[0].id;
        }

        return data.briefings?.some((briefing) => briefing.id === current)
          ? current
          : data.briefings[0].id;
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Nieznany blad.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadBriefings();
  }, []);

  async function generateBriefing() {
    if (isGenerating) {
      return;
    }

    setIsGenerating(true);
    setStatus("");
    setCopyStatus("");

    try {
      const accessToken = await getAccessToken();
      const response = await fetch("/api/briefings", {
        method: "POST",
        cache: "no-store",
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Nie udalo sie wygenerowac briefingu.");
      }

      setStatus("Wygenerowano nowy briefing.");
      await loadBriefings(false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Nieznany blad.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function copySelectedBriefing() {
    if (!selectedBriefing) {
      return;
    }

    await navigator.clipboard.writeText(selectedBriefing.content);
    setCopyStatus("Skopiowano briefing.");
    window.setTimeout(() => setCopyStatus(""), 1800);
  }

  return (
    <main className="briefings-shell">
      <section className="briefings-panel" aria-label="Briefingi">
        <header className="briefings-header">
          <div>
            <h1>Briefingi</h1>
            <p>Automatyczne podsumowania dnia od Twojego agenta</p>
          </div>
          <button
            className="briefings-primary-button"
            disabled={isGenerating}
            onClick={() => void generateBriefing()}
            type="button"
          >
            {isGenerating ? "Generuje..." : "Wygeneruj teraz"}
          </button>
        </header>

        {status && <p className="briefings-status">{status}</p>}

        {isLoading ? (
          <div className="briefings-empty">Wczytuje briefingi...</div>
        ) : briefings.length === 0 ? (
          <div className="briefings-empty">
            <p>Brak briefingow. Cron job wygeneruje pierwszy jutro rano!</p>
            <button
              className="briefings-primary-button"
              disabled={isGenerating}
              onClick={() => void generateBriefing()}
              type="button"
            >
              {isGenerating ? "Generuje..." : "Wygeneruj teraz"}
            </button>
          </div>
        ) : (
          <div className="briefings-layout">
            <aside className="briefings-list-card" aria-label="Lista briefingow">
              <div className="briefings-list-top">
                <div>
                  <span>Archiwum</span>
                  <h2>Ostatnie briefingi</h2>
                </div>
                <small>{briefings.length}/30</small>
              </div>
              <div className="briefings-list">
                {briefings.map((briefing, index) => (
                  <button
                    className={
                      selectedBriefing?.id === briefing.id
                        ? "briefing-card active"
                        : "briefing-card"
                    }
                    key={briefing.id}
                    onClick={() => {
                      setSelectedId(briefing.id);
                      setCopyStatus("");
                    }}
                    type="button"
                  >
                    <div className="briefing-card-main">
                      <div className="briefing-card-title-row">
                        <h3>{formatBriefingDate(briefing.date)}</h3>
                        {index === 0 && <span>Najnowszy</span>}
                      </div>
                      <p className="briefing-meta">
                        Cron | {formatCreatedAt(briefing.created_at)}
                      </p>
                      <p className="briefing-preview">
                        {shorten(briefing.content, 130)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </aside>

            {selectedBriefing && (
              <article className="briefings-detail">
                <div className="briefings-detail-top">
                  <div>
                    <span>{formatCreatedAt(selectedBriefing.created_at)}</span>
                    <h2>{formatBriefingDate(selectedBriefing.date)}</h2>
                  </div>
                  <div className="briefings-detail-actions">
                    <button onClick={() => void copySelectedBriefing()} type="button">
                      Kopiuj
                    </button>
                  </div>
                </div>
                {copyStatus && (
                  <p className="briefings-copy-status">{copyStatus}</p>
                )}
                <BriefingMarkdown text={selectedBriefing.content} />
              </article>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
