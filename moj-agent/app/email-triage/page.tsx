"use client";

import { FormEvent, useMemo, useState } from "react";

type Priority = "high" | "medium" | "low" | "spam" | "unknown";

type MailCard = {
  id: string;
  title: string;
  category: string;
  priority: Priority;
  priorityLabel: string;
  reason: string;
  draft: string;
};

const sampleEmails = `Mail 1 - PILNY:
Od: jan.kowalski@firma.pl
Temat: PILNE - Problem z faktura
Tresc: Dzien dobry, mam problem z faktura FV/2026/001. Kwota jest nieprawidlowa - powinno byc 5000 zl a jest 3000 zl. Prosze o PILNA korekte. Termin platnosci mija jutro.

Mail 2 - SPAM:
Od: winner@lucky-prize.com
Temat: Congratulations! You won $1,000,000
Tresc: Click here to claim your prize! Limited time offer. Act now!

Mail 3 - OFERTA:
Od: anna.nowak@partner.pl
Temat: Propozycja wspolpracy
Tresc: Dzien dobry, reprezentuje firme ABC Solutions. Chcielibysmy omowic mozliwosc wspolpracy w zakresie dostarczania uslug IT. Czy mozemy umowic sie na spotkanie w przyszlym tygodniu?

Mail 4 - REKLAMACJA:
Od: klient123@gmail.com
Temat: Nie dziala usluga od 3 dni
Tresc: Witam, od poniedzialku nie moge sie zalogowac do panelu klienta. Probowalem resetowac haslo ale nie dostaje maila. To juz trzeci dzien! Jesli nie rozwiazecie tego dzis, zrezygnuje z uslugi.

Mail 5 - INFO:
Od: newsletter@branzowy-portal.pl
Temat: Nowe trendy AI w biznesie - raport 2026
Tresc: Zapraszamy do lektury naszego najnowszego raportu o zastosowaniach AI w polskich firmach. Pobierz za darmo na naszej stronie.`;

function splitEmails(value: string) {
  return value
    .split(/\n\s*\n(?=Mail\s+\d+\s+-|Od:|Temat:)/i)
    .map((email) => email.trim())
    .filter(Boolean);
}

function extractTableValue(block: string, label: string) {
  const expression = new RegExp(`\\|\\s*${label}\\s*\\|\\s*([^|]+)\\|`, "i");
  return expression.exec(block)?.[1].trim() ?? "";
}

function detectPriority(priorityText: string, category: string): Priority {
  const categoryText = category.toLowerCase();
  const text = priorityText.toLowerCase();

  if (categoryText.includes("spam") || text.includes("spam")) {
    return "spam";
  }

  if (text.includes("wysoki") || text.includes("pilne")) {
    return "high";
  }

  if (text.includes("sredni") || text.includes("średni")) {
    return "medium";
  }

  if (text.includes("niski")) {
    return "low";
  }

  return "unknown";
}

function priorityLabel(priority: Priority, fallback: string) {
  if (priority === "high") {
    return "Wysoki";
  }

  if (priority === "medium") {
    return "Sredni";
  }

  if (priority === "low") {
    return "Niski";
  }

  if (priority === "spam") {
    return "Spam";
  }

  return fallback || "Nieustalony";
}

function parseDraft(block: string) {
  const draftMatch = /\*\*Proponowana odpowiedz:\*\*\s*([\s\S]*)/i.exec(block);
  const draftBlock = (draftMatch?.[1] ?? "")
    .split(/\n---|\n###\s+PODSUMOWANIE/i)[0]
    .trim();

  return draftBlock
    .split(/\r?\n/)
    .map((line) => line.replace(/^>\s?/, "").trim())
    .filter(Boolean)
    .join("\n");
}

function parseCards(text: string): MailCard[] {
  const sections = text
    .split(/(?=^###\s+Mail\s+\d+)/gim)
    .filter((section) => /^###\s+Mail\s+\d+/im.test(section));

  return sections.map((section, index) => {
    const heading = /^###\s+Mail\s+(\d+):?\s*(.*)$/im.exec(section);
    const category = extractTableValue(section, "Kategoria");
    const priorityText = extractTableValue(section, "Priorytet");
    const priority = detectPriority(priorityText, category);

    return {
      id: heading?.[1] ?? String(index + 1),
      title: heading?.[2]?.trim() || `Mail ${index + 1}`,
      category: category || "W trakcie analizy",
      priority,
      priorityLabel: priorityLabel(priority, priorityText),
      reason: extractTableValue(section, "Uzasadnienie"),
      draft: parseDraft(section),
    };
  });
}

function summarize(cards: MailCard[]) {
  return cards.reduce(
    (summary, card) => {
      summary[card.priority] += 1;
      return summary;
    },
    { high: 0, medium: 0, low: 0, spam: 0, unknown: 0 } as Record<
      Priority,
      number
    >,
  );
}

const summaryItems: Array<{
  key: Priority;
  label: string;
  dotClass: string;
}> = [
  { key: "high", label: "Pilne", dotClass: "red" },
  { key: "medium", label: "Srednie", dotClass: "yellow" },
  { key: "low", label: "Niskie", dotClass: "green" },
  { key: "spam", label: "Spam", dotClass: "gray" },
];

export default function EmailTriagePage() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const cards = useMemo(() => parseCards(result), [result]);
  const summary = useMemo(() => summarize(cards), [cards]);
  const rawSummary = useMemo(() => {
    const match = /###\s+PODSUMOWANIE[\s\S]*$/i.exec(result);
    return match?.[0]?.trim() ?? "";
  }, [result]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const emails = splitEmails(input);
    if (emails.length === 0 || isLoading) {
      return;
    }

    setError("");
    setResult("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/email-triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Nie udalo sie uruchomic analizy.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        setResult((current) => current + decoder.decode(value, { stream: true }));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nieznany blad.");
    } finally {
      setIsLoading(false);
    }
  }

  async function copyDraft(card: MailCard) {
    if (!card.draft) {
      return;
    }

    await navigator.clipboard.writeText(card.draft);
    setCopiedId(card.id);
    window.setTimeout(() => setCopiedId(""), 1800);
  }

  return (
    <main className="email-triage-shell">
      <section className="email-triage-panel" aria-label="E-mail Triage">
        <header className="email-triage-header">
          <span className="email-triage-kicker">Inteligentna skrzynka</span>
          <div className="email-triage-title-row">
            <span className="email-triage-icon" aria-hidden="true">
              {"\u{1F4E7}"}
            </span>
            <h1>E-mail Triage</h1>
          </div>
          <p>Wklej maile - agent posortuje i napisze odpowiedzi</p>
        </header>

        <section className="email-input-card" aria-label="Maile do analizy">
          <div className="email-input-top">
            <strong>Maile do analizy</strong>
            <button
              className="email-example-button"
              disabled={isLoading}
              onClick={() => setInput(sampleEmails)}
              type="button"
            >
              {"\u{1F4CB}"} Wklej przyklad
            </button>
          </div>

          <form className="email-triage-form" onSubmit={handleSubmit}>
            <textarea
              aria-label="Maile do analizy"
              disabled={isLoading}
              minLength={10}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Wklej maile tutaj - oddziel je pusta linia..."
              value={input}
            />
            <button
              className="email-analyze-button"
              disabled={isLoading || splitEmails(input).length === 0}
              type="submit"
            >
              <span aria-hidden="true">{"\u{1F4E7}"}</span>
              {isLoading ? "Analizuje..." : "Analizuj maile"}
            </button>
          </form>
        </section>

        {error && <p className="email-triage-error">{error}</p>}

        {(isLoading || result) && (
          <section className="email-triage-results" aria-live="polite">
            <div className="email-triage-summary">
              <div className="email-summary-heading">
                <span>Wynik analizy</span>
                <h2>Podsumowanie skrzynki</h2>
              </div>
              <span className="email-summary-status">
                {isLoading ? "W toku" : "Gotowe"}
              </span>
              <div className="email-summary-grid">
                {summaryItems.map((item) => (
                  <article className="email-summary-tile" key={item.key}>
                    <span className={`email-summary-dot ${item.dotClass}`} />
                    <strong>{summary[item.key]}</strong>
                    <small>{item.label}</small>
                  </article>
                ))}
              </div>
            </div>

            <div className="email-triage-cards">
              {cards.map((card) => (
                <article
                  className={`email-card priority-${card.priority}`}
                  key={card.id}
                >
                  <div className="email-card-top">
                    <div>
                      <span>Mail {card.id}</span>
                      <h2>{card.title}</h2>
                    </div>
                    <strong>{card.priorityLabel}</strong>
                  </div>
                  <dl>
                    <div>
                      <dt>Kategoria</dt>
                      <dd>{card.category}</dd>
                    </div>
                    <div>
                      <dt>Uzasadnienie</dt>
                      <dd>{card.reason || "Analiza w toku..."}</dd>
                    </div>
                  </dl>
                  <div className="email-draft">
                    <div>
                      <h3>Proponowana odpowiedz</h3>
                      <button
                        disabled={!card.draft}
                        onClick={() => void copyDraft(card)}
                        type="button"
                      >
                        {copiedId === card.id ? "Skopiowano" : "Kopiuj draft"}
                      </button>
                    </div>
                    <blockquote>
                      {card.draft || "Draft pojawi sie za chwile..."}
                    </blockquote>
                  </div>
                </article>
              ))}
            </div>

            {cards.length === 0 && (
              <pre className="email-triage-stream">{result || "Czekam na model..."}</pre>
            )}

            {rawSummary && <pre className="email-triage-final">{rawSummary}</pre>}
          </section>
        )}
      </section>
    </main>
  );
}
