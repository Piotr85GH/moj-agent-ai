"use client";

import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { useAuth } from "../auth-provider";

const examples = [
  "Rynek AI w Polsce - trendy, firmy, prognozy na 2026",
  "Porównanie platform e-commerce: Shopify vs WooCommerce vs PrestaShop",
  "Wpływ pracy zdalnej na produktywność - badania i statystyki",
  "Rynek nieruchomości w Krakowie - ceny, trendy, prognozy",
];

function renderInline(text: string) {
  return text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).map((part, index) => {
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

    return <span key={index}>{part}</span>;
  });
}

function parseTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableSeparator(line: string) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function polishReportHeading(text: string) {
  return text
    .replace(/^Zrodla$/i, "Źródła")
    .replace(/^(\d+\.\s*)Kluczowe dane i fakty$/i, "$1Kluczowe dane i fakty")
    .replace(/^(\d+\.\s*)Wprowadzenie$/i, "$1Wprowadzenie")
    .replace(/^(\d+\.\s*)Analiza$/i, "$1Analiza")
    .replace(
      /^(\d+\.\s*)Wnioski i rekomendacje$/i,
      "$1Wnioski i rekomendacje",
    )
    .replace(/^Streszczenie \(Executive Summary\)$/i, "Streszczenie (Executive Summary)")
    .replace(/^Raport:/i, "Raport:");
}

function ReportMarkdown({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  const blocks: ReactNode[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const nextLine = lines[index + 1] ?? "";

    if (!line.trim()) {
      continue;
    }

    if (line.includes("|") && isTableSeparator(nextLine)) {
      const tableLines = [line];
      index += 2;

      while (index < lines.length && lines[index].includes("|")) {
        tableLines.push(lines[index]);
        index += 1;
      }

      index -= 1;
      const [headerLine, ...bodyLines] = tableLines;
      const headers = parseTableRow(headerLine);

      blocks.push(
        <div className="report-table-wrap" key={`table-${index}`}>
          <table className="report-table">
            <thead>
              <tr>
                {headers.map((header, cellIndex) => (
                  <th key={cellIndex}>{renderInline(header)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyLines.map((bodyLine, rowIndex) => (
                <tr key={rowIndex}>
                  {parseTableRow(bodyLine).map((cell, cellIndex) => (
                    <td key={cellIndex}>{renderInline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const content = renderInline(polishReportHeading(heading[2]));

      blocks.push(
        level === 1 ? (
          <h1 key={index}>{content}</h1>
        ) : level === 2 ? (
          <h2 key={index}>{content}</h2>
        ) : (
          <h3 key={index}>{content}</h3>
        ),
      );
      continue;
    }

    const listItem = /^[-*]\s+(.+)$/.exec(line);
    if (listItem) {
      blocks.push(<li key={index}>{renderInline(listItem[1])}</li>);
      continue;
    }

    blocks.push(<p key={index}>{renderInline(line)}</p>);
  }

  return <div className="report-markdown">{blocks}</div>;
}

export default function ReportPage() {
  const { getAccessToken } = useAuth();
  const [topic, setTopic] = useState("");
  const [report, setReport] = useState("");
  const [error, setError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const wordCount = useMemo(
    () => report.trim().split(/\s+/).filter(Boolean).length,
    [report],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanTopic = topic.trim();
    if (!cleanTopic || isLoading) {
      return;
    }

    setError("");
    setReport("");
    setCopyStatus("");
    setSaveStatus("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: cleanTopic }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Nie udalo sie wygenerowac raportu.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        setReport((current) => current + decoder.decode(value, { stream: true }));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nieznany blad.");
    } finally {
      setIsLoading(false);
    }
  }

  async function copyReport() {
    if (!report.trim()) {
      return;
    }

    await navigator.clipboard.writeText(report);
    setCopyStatus("Skopiowano raport.");
    window.setTimeout(() => setCopyStatus(""), 1800);
  }

  async function saveReport() {
    if (!topic.trim() || !report.trim() || isSaving) {
      return;
    }

    setError("");
    setSaveStatus("");
    setIsSaving(true);

    try {
      const accessToken = await getAccessToken();
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ topic, report }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Nie udalo sie zapisac raportu.");
      }

      setSaveStatus("Zapisano raport w bazie.");
      window.setTimeout(() => setSaveStatus(""), 2200);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nieznany blad.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="report-shell">
      <section className="report-panel" aria-label="Generator raportów">
        <header className="report-hero">
          <span>Analiza biznesowa</span>
          <h1>{"\u{1F4CA}"} Generator raportów</h1>
          <p>Opisz temat - agent napisze raport biznesowy.</p>
        </header>

        <section className="report-composer-card">
          <form className="report-form" onSubmit={handleSubmit}>
            <label htmlFor="report-topic">O czym ma być raport?</label>
            <div className="report-input-row">
              <input
                disabled={isLoading}
                id="report-topic"
                onChange={(event) => setTopic(event.target.value)}
                placeholder="Np. Rynek AI w Polsce w 2026 roku..."
                value={topic}
              />
              <button disabled={isLoading || topic.trim().length === 0} type="submit">
                <span aria-hidden="true">{"\u{1F4CA}"}</span>
                {isLoading ? "Generuje..." : "Generuj raport"}
              </button>
            </div>
          </form>

          <div className="report-examples" aria-label="Przykladowe tematy">
            {examples.map((example) => (
              <button
                disabled={isLoading}
                key={example}
                onClick={() => setTopic(example)}
                type="button"
              >
                {example}
              </button>
            ))}
          </div>
        </section>

        {error && <p className="report-error">{error}</p>}

        {(isLoading || report) && (
          <section className="report-result-card" aria-live="polite">
            <div className="report-result-top">
              <div>
                <span>Wynik</span>
                <h2>Raport biznesowy</h2>
              </div>
              <div className="report-actions">
                <small>{wordCount} słów</small>
                <button disabled={!report.trim()} onClick={copyReport} type="button">
                  {"\u{1F4CB}"} Kopiuj do schowka
                </button>
                <button
                  disabled={!report.trim() || isSaving}
                  onClick={saveReport}
                  type="button"
                >
                  {"\u{1F4BE}"} {isSaving ? "Zapisuje..." : "Zapisz w bazie"}
                </button>
              </div>
            </div>

            {copyStatus && <p className="report-copy-status">{copyStatus}</p>}
            {saveStatus && <p className="report-copy-status">{saveStatus}</p>}

            {report ? (
              <ReportMarkdown text={report} />
            ) : (
              <div className="report-loading">Agent zbiera dane i pisze raport...</div>
            )}
          </section>
        )}
      </section>
    </main>
  );
}
