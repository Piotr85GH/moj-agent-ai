"use client";

import { type FormEvent, type ReactNode, useMemo, useState } from "react";

type CompetitorExample = {
  label: string;
  companies: [string, string, string];
  context: string;
};

const examples: CompetitorExample[] = [
  {
    label: "Shopify vs WooCommerce vs PrestaShop",
    companies: ["Shopify", "WooCommerce", "PrestaShop"],
    context: "Szukam platformy e-commerce dla małego sklepu.",
  },
  {
    label: "Notion vs Obsidian vs Evernote",
    companies: ["Notion", "Obsidian", "Evernote"],
    context: "Szukam narzędzia do notatek i zarządzania wiedzą.",
  },
  {
    label: "Vercel vs Netlify vs Railway",
    companies: ["Vercel", "Netlify", "Railway"],
    context: "Szukam platformy do wdrażania aplikacji Next.js.",
  },
  {
    label: "ChatGPT vs Claude vs Gemini",
    companies: ["ChatGPT", "Claude", "Gemini"],
    context: "Szukam asystenta AI do pracy biznesowej.",
  },
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

function polishHeading(text: string) {
  return text
    .replace(/^Porownanie$/i, "Porównanie")
    .replace(/^Szczegolowa analiza$/i, "Szczegółowa analiza")
    .replace(/^Zrodla$/i, "Źródła")
    .replace(/^Analiza konkurencji$/i, "Analiza konkurencji");
}

function CompetitorMarkdown({ text }: { text: string }) {
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
        <div className="competitor-table-wrap" key={`table-${index}`}>
          <table className="competitor-table">
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
      const content = renderInline(polishHeading(heading[2]));

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

  return <div className="competitor-markdown">{blocks}</div>;
}

export default function CompetitorPage() {
  const [companies, setCompanies] = useState(["", "", ""]);
  const [context, setContext] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [error, setError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const filledCompanies = useMemo(
    () => companies.map((item) => item.trim()).filter(Boolean),
    [companies],
  );

  function updateCompany(index: number, value: string) {
    setCompanies((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? value : item)),
    );
  }

  function applyExample(example: CompetitorExample) {
    setCompanies(example.companies);
    setContext(example.context);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (filledCompanies.length < 2 || isLoading) {
      return;
    }

    setAnalysis("");
    setError("");
    setCopyStatus("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/competitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companies: filledCompanies, context }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Nie udało się wygenerować analizy.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        setAnalysis((current) => current + decoder.decode(value, { stream: true }));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nieznany błąd.");
    } finally {
      setIsLoading(false);
    }
  }

  async function copyAnalysis() {
    if (!analysis.trim()) {
      return;
    }

    await navigator.clipboard.writeText(analysis);
    setCopyStatus("Skopiowano analizę.");
    window.setTimeout(() => setCopyStatus(""), 1800);
  }

  return (
    <main className="competitor-shell">
      <section className="competitor-panel" aria-label="Analiza konkurencji">
        <header className="competitor-hero">
          <span>Benchmark firm</span>
          <h1>{"\u{1F3E2}"} Analiza konkurencji</h1>
          <p>Podaj firmy - agent porówna je za Ciebie.</p>
        </header>

        <section className="competitor-form-card">
          <form className="competitor-form" onSubmit={handleSubmit}>
            <div className="competitor-company-grid">
              {companies.map((company, index) => (
                <label key={index}>
                  <span>Firma {index + 1}</span>
                  <input
                    disabled={isLoading}
                    onChange={(event) => updateCompany(index, event.target.value)}
                    placeholder={
                      index === 0
                        ? "Np. Shopify"
                        : index === 1
                          ? "Np. WooCommerce"
                          : "Np. PrestaShop"
                    }
                    value={company}
                  />
                </label>
              ))}
            </div>

            <label>
              <span>Kontekst</span>
              <textarea
                disabled={isLoading}
                onChange={(event) => setContext(event.target.value)}
                placeholder="Szukam platformy e-commerce dla małego sklepu..."
                value={context}
              />
            </label>

            <button disabled={filledCompanies.length < 2 || isLoading} type="submit">
              <span aria-hidden="true">{"\u{1F50D}"}</span>
              {isLoading ? "Porównuje..." : "Porównaj"}
            </button>
          </form>

          <div className="competitor-examples" aria-label="Przykładowe porównania">
            {examples.map((example) => (
              <button
                disabled={isLoading}
                key={example.label}
                onClick={() => applyExample(example)}
                type="button"
              >
                {example.label}
              </button>
            ))}
          </div>
        </section>

        {error && <p className="competitor-error">{error}</p>}

        {(isLoading || analysis) && (
          <section className="competitor-result-card" aria-live="polite">
            <div className="competitor-result-top">
              <div>
                <span>Wynik analizy</span>
                <h2>Porównanie konkurencji</h2>
              </div>
              <button disabled={!analysis.trim()} onClick={copyAnalysis} type="button">
                {"\u{1F4CB}"} Kopiuj analizę
              </button>
            </div>

            {copyStatus && <p className="competitor-copy-status">{copyStatus}</p>}

            {analysis ? (
              <CompetitorMarkdown text={analysis} />
            ) : (
              <div className="competitor-loading">
                Agent szuka informacji i buduje porównanie...
              </div>
            )}
          </section>
        )}
      </section>
    </main>
  );
}
