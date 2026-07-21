"use client";

import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../auth-provider";

type KnowledgeDocument = {
  title: string;
  chunks: number;
  createdAt: string;
};

type KnowledgeFragment = {
  id: string;
  title: string | null;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

type KnowledgeSearchResult = {
  title: string;
  content: string;
  similarity: number;
  metadata: Record<string, unknown>;
  added_at: string | null;
};

const examples = [
  {
    title: "Cennik 2026",
    content:
      "Pakiet Basic: 99 zł/mies. Pakiet Premium: 299 zł/mies. Pakiet VIP: 599 zł/mies. Wszystkie pakiety mają 14-dniowy okres próbny.",
  },
  {
    title: "FAQ",
    content:
      "Q: Jak mogę anulować subskrypcję? A: Wyślij email do obsługi klienta. Q: Czy wystawiacie fakturę VAT? A: Tak, faktura VAT jest automatyczna.",
  },
  {
    title: "Regulamin firmy",
    content:
      "Paragraf 1. Postanowienia ogólne. Niniejszy regulamin określa zasady korzystania z usług oraz odpowiedzialność stron.",
  },
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function UploadPage() {
  const { getAccessToken } = useAuth();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [selectedDocument, setSelectedDocument] = useState("");
  const [fragments, setFragments] = useState<KnowledgeFragment[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<KnowledgeSearchResult[]>([]);
  const [knowledgeTotals, setKnowledgeTotals] = useState({
    documents: 0,
    chunks: 0,
  });
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(true);
  const [isLoadingFragments, setIsLoadingFragments] = useState(false);
  const [isSearchingKnowledge, setIsSearchingKnowledge] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function getAuthHeaders(): Promise<Record<string, string>> {
    const accessToken = await getAccessToken();

    return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
  }

  async function loadDocuments() {
    setIsLoadingDocuments(true);
    const response = await fetch("/api/upload-knowledge", {
      headers: await getAuthHeaders(),
    });
    const data = await response.json();

    if (!response.ok) {
      setError(data.error ?? "Nie udało się pobrać dokumentów.");
      setIsLoadingDocuments(false);
      return;
    }

    setDocuments(data.documents ?? []);
    setKnowledgeTotals({
      documents: data.total_documents ?? 0,
      chunks: data.total_chunks ?? 0,
    });
    setIsLoadingDocuments(false);
  }

  useEffect(() => {
    void loadDocuments();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!title.trim() || !content.trim() || isUploading) {
      return;
    }

    setError("");
    setStatus("Przygotowuję dokument...");
    setProgress({ current: 0, total: 0 });
    setIsUploading(true);

    try {
      const response = await fetch("/api/upload-knowledge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await getAuthHeaders()),
        },
        body: JSON.stringify({ title, content }),
      });

      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Nie udało się zapisać dokumentu.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const eventBlock of events) {
          const eventName = eventBlock
            .split("\n")
            .find((line) => line.startsWith("event: "))
            ?.slice(7);
          const dataLine = eventBlock
            .split("\n")
            .find((line) => line.startsWith("data: "));

          if (!eventName || !dataLine) {
            continue;
          }

          const payload = JSON.parse(dataLine.slice(6));

          if (eventName === "start") {
            setProgress({ current: 0, total: payload.total });
          }

          if (eventName === "progress") {
            setProgress({ current: payload.current, total: payload.total });
            setStatus(payload.message);
          }

          if (eventName === "done") {
            setStatus(`Zapisano ${payload.chunks_saved} fragmentów!`);
            setTitle("");
            setContent("");
            await loadDocuments();
          }

          if (eventName === "error") {
            throw new Error(payload.error ?? "Nie udało się zapisać dokumentu.");
          }
        }
      }
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : "Nieznany błąd.",
      );
    } finally {
      setIsUploading(false);
    }
  }

  async function deleteDocument(documentTitle: string) {
    if (isUploading) {
      return;
    }

    setError("");
    const response = await fetch("/api/upload-knowledge", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        ...(await getAuthHeaders()),
      },
      body: JSON.stringify({ title: documentTitle }),
    });
    const data = await response.json();

    if (!response.ok) {
      setError(data.error ?? "Nie udało się usunąć dokumentu.");
      return;
    }

    setStatus(`Usunięto dokument: ${documentTitle}`);
    if (selectedDocument === documentTitle) {
      setSelectedDocument("");
      setFragments([]);
    }
    await loadDocuments();
  }

  async function loadFragments(documentTitle: string) {
    setSelectedDocument(documentTitle);
    setFragments([]);
    setIsLoadingFragments(true);
    setError("");

    const response = await fetch(
      `/api/upload-knowledge?title=${encodeURIComponent(documentTitle)}`,
      { headers: await getAuthHeaders() },
    );
    const data = await response.json();

    if (!response.ok) {
      setError(data.error ?? "Nie udało się pobrać fragmentów.");
      setIsLoadingFragments(false);
      return;
    }

    setFragments(data.fragments ?? []);
    setIsLoadingFragments(false);
  }

  async function searchKnowledgeBase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!searchQuery.trim() || isSearchingKnowledge) {
      return;
    }

    setError("");
    setSearchResults([]);
    setIsSearchingKnowledge(true);

    const response = await fetch(
      `/api/upload-knowledge?query=${encodeURIComponent(searchQuery)}`,
      { headers: await getAuthHeaders() },
    );
    const data = await response.json();

    if (!response.ok) {
      setError(data.error ?? "Nie udało się przeszukać bazy wiedzy.");
      setIsSearchingKnowledge(false);
      return;
    }

    setSearchResults(data.results ?? []);
    if ((data.results ?? []).length === 0) {
      setStatus(data.message ?? "Nie znaleziono informacji w bazie wiedzy.");
    }
    setIsSearchingKnowledge(false);
  }

  const progressPercent =
    progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <main className="upload-shell">
      <header className="upload-hero">
        <span className="upload-kicker">RAG - ingestia dokumentów</span>
        <h1>
          <span aria-hidden="true">📚</span>
          Baza wiedzy
        </h1>
        <p>Wklej tekst, a agent będzie mógł korzystać z niego w odpowiedziach.</p>
      </header>

      <section className="upload-panel">

        <form className="upload-form" onSubmit={handleSubmit}>
          <label>
            <span>Tytuł dokumentu</span>
            <input
              disabled={isUploading}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Np. Cennik 2026, FAQ, Regulamin firmy"
              value={title}
            />
          </label>

          <label>
            <span>Treść dokumentu</span>
            <textarea
              disabled={isUploading}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Wklej tutaj treść dokumentu..."
              value={content}
            />
          </label>

          <div className="upload-examples" aria-label="Przykładowe dokumenty">
            <span>Wstaw przykład:</span>
            {examples.map((example) => (
              <button
                disabled={isUploading}
                key={example.title}
                onClick={() => {
                  setTitle(example.title);
                  setContent(example.content);
                }}
                type="button"
              >
                {example.title}
              </button>
            ))}
          </div>

          <button
            className="upload-submit"
            disabled={isUploading || !title.trim() || !content.trim()}
            type="submit"
          >
            <span aria-hidden="true">📥</span>
            Zapisz w bazie wiedzy
          </button>
        </form>

        {(status || isUploading) && (
          <div className="upload-progress" aria-live="polite">
            <div>
              <span>{status || "Przetwarzam dokument..."}</span>
              {progress.total > 0 && (
                <strong>
                  {progress.current}/{progress.total}
                </strong>
              )}
            </div>
            <div className="upload-progress-track">
              <span style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        )}

        {error && <p className="upload-error">{error}</p>}
      </section>

      <section className="upload-panel">
          <span className="upload-kicker">Twój kontekst dla agenta</span>
        <div className="upload-list-header">
          <h2>Zapisane dokumenty</h2>
          <button disabled={isLoadingDocuments} onClick={loadDocuments} type="button">
            <span aria-hidden="true">🔄</span>
            Odśwież
          </button>
        </div>
        <p className="upload-summary">
          {knowledgeTotals.chunks} fragmentów z {knowledgeTotals.documents} dokumentów
        </p>

        {isLoadingDocuments ? (
          <p className="upload-empty">Wczytuję dokumenty...</p>
        ) : documents.length === 0 ? (
          <p className="upload-empty">Nie ma jeszcze zapisanych dokumentów.</p>
        ) : (
          <div className="upload-documents">
            {documents.map((document) => (
              <article key={document.title}>
                <button
                  className="upload-document-main"
                  onClick={() => loadFragments(document.title)}
                  type="button"
                >
                  <h3>{document.title}</h3>
                  <p>
                    {document.chunks} fragmentów | {formatDate(document.createdAt)}
                  </p>
                </button>
                <button
                  disabled={isUploading}
                  onClick={() => deleteDocument(document.title)}
                  type="button"
                >
                  <span aria-hidden="true">🗑️</span>
                  Usuń
                </button>
              </article>
            ))}
          </div>
        )}

        {selectedDocument && (
          <div className="knowledge-preview">
            <h3>Fragmenty: {selectedDocument}</h3>
            {isLoadingFragments ? (
              <p className="upload-empty">Wczytuję fragmenty...</p>
            ) : (
              <div className="knowledge-fragments">
                {fragments.map((fragment, index) => (
                  <article key={fragment.id}>
                    <strong>Fragment {index + 1}</strong>
                    <p>{fragment.content}</p>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        <form className="knowledge-search" onSubmit={searchKnowledgeBase}>
          <label>
            <span>Test wyszukiwania RAG</span>
            <div>
              <input
                disabled={isSearchingKnowledge}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Szukaj w bazie wiedzy..."
                value={searchQuery}
              />
              <button
                disabled={isSearchingKnowledge || !searchQuery.trim()}
                type="submit"
              >
                🔎 Szukaj
              </button>
            </div>
          </label>
        </form>

        {searchResults.length > 0 && (
          <div className="knowledge-results">
            {searchResults.map((result, index) => (
              <article key={`${result.title}-${index}`}>
                <div>
                  <strong>{result.title}</strong>
                  <span>{Math.round(result.similarity * 100)}% trafności</span>
                </div>
                <p>{result.content}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
