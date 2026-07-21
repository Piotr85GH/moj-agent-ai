"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { FormEvent, useMemo, useState } from "react";

const scenarios = [
  "Planuje weekend w Berlinie. Budzet: 2000 PLN",
  "Lece do Paryza na tydzien w sierpniu",
  "Wycieczka do Pragi z rodzina na 3 dni",
  "Podroz sluzbowa do Londynu w przyszlym tygodniu",
  "Porownaj Barcelone i Lizbone na wakacje",
];

const toolLabels: Record<string, string> = {
  calculator: "🧮 Kalkulator",
  currentDateTime: "🕐 Data",
  getDestinationInfo: "🧭 Destynacja",
  getExchangeRate: "💶 Waluty",
  getHolidays: "📅 Swieta",
  getNotes: "🗒️ Notatki",
  getWeather: "🌤️ Pogoda",
  google_search: "🌐 Google",
  readWebPage: "📄 Strona",
  saveNote: "💾 Zapis",
  searchWikipedia: "📖 Wikipedia",
};

type TravelCard =
  | { type: "weather"; title: string; value: string; detail: string }
  | { type: "currency"; title: string; value: string; detail: string }
  | { type: "holidays"; title: string; value: string; detail: string }
  | { type: "attractions"; title: string; value: string; detail: string };

function getMessageText(parts: UIMessage["parts"]) {
  return parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function getToolName(part: unknown) {
  const value = part as { type?: string; toolName?: string };

  if (value.toolName) {
    return value.toolName;
  }

  if (value.type?.startsWith("tool-")) {
    return value.type.slice(5);
  }

  return "";
}

function getToolOutput(part: unknown) {
  const value = part as { output?: unknown; result?: unknown };
  return value.output ?? value.result;
}

function formatToolOutput(output: unknown) {
  if (!output) {
    return "w trakcie...";
  }

  if (typeof output === "string") {
    return output.slice(0, 180);
  }

  if (typeof output === "object") {
    const data = output as Record<string, unknown>;

    if (typeof data.error === "string") {
      return data.error;
    }

    if (data.city && data.temperatureC !== undefined) {
      return `${data.city}: ${data.temperatureC}C, ${data.description}`;
    }

    if (data.converted !== undefined) {
      return `${data.amount} ${data.from} = ${data.converted} ${data.to}`;
    }

    if (Array.isArray(data.holidays)) {
      return `${data.holidays.length} swiat w ${data.countryCode}`;
    }

    if (Array.isArray(data.results)) {
      return `${data.results.length} wynikow`;
    }

    if (data.result !== undefined) {
      return String(data.result);
    }

    if (data.saved) {
      return "zapisano";
    }
  }

  return "wynik narzedzia";
}

function hasToolError(output: unknown) {
  if (!output) {
    return false;
  }

  if (typeof output === "string") {
    return output.toLowerCase().includes("blad") || output.toLowerCase().includes("error");
  }

  return (
    typeof output === "object" &&
    output !== null &&
    typeof (output as { error?: unknown }).error === "string"
  );
}

function getToolDiagnostics(parts: UIMessage["parts"]) {
  const counts: Record<string, number> = {};
  const errors: Array<{ tool: string; message: string }> = [];

  for (const part of parts) {
    const tool = getToolName(part);

    if (!tool) {
      continue;
    }

    counts[tool] = (counts[tool] ?? 0) + 1;
    const output = getToolOutput(part);

    if (hasToolError(output)) {
      errors.push({ tool, message: formatToolOutput(output) });
    }
  }

  return { counts, errors };
}

function buildTravelCards(parts: UIMessage["parts"]) {
  const cards: TravelCard[] = [];

  for (const part of parts) {
    const name = getToolName(part);
    const output = getToolOutput(part);

    if (!output || typeof output !== "object") {
      continue;
    }

    const data = output as Record<string, unknown>;

    if (name === "getWeather" && data.temperatureC !== undefined) {
      cards.push({
        type: "weather",
        title: `Pogoda: ${data.city ?? "miasto"}`,
        value: `${data.temperatureC}C`,
        detail: `${data.description ?? ""} · odczuwalnie ${data.apparentTemperatureC ?? "?"}C · wiatr ${data.windKmh ?? "?"} km/h`,
      });
    }

    if (name === "getExchangeRate" && data.converted !== undefined) {
      cards.push({
        type: "currency",
        title: `Waluta: ${data.from} → ${data.to}`,
        value: `${data.converted} ${data.to}`,
        detail: `${data.amount} ${data.from}; kurs z ${data.date ?? "dzisiaj"}`,
      });
    }

    if (name === "getHolidays" && Array.isArray(data.holidays)) {
      const holidays = data.holidays as Array<{ date?: string; localName?: string }>;
      const first = holidays
        .slice(0, 3)
        .map((holiday) => `${holiday.date}: ${holiday.localName}`)
        .join(" · ");

      cards.push({
        type: "holidays",
        title: `Swieta: ${data.countryCode}`,
        value: `${holidays.length}`,
        detail: first || "Brak swiat w danych API.",
      });
    }

    if (name === "searchWikipedia" && Array.isArray(data.results)) {
      const results = data.results as Array<{ title?: string; description?: string }>;

      cards.push({
        type: "attractions",
        title: "Atrakcje i kontekst",
        value: `${results.length} wynikow`,
        detail:
          results
            .slice(0, 4)
            .map((item) => item.title || item.description)
            .filter(Boolean)
            .join(" · ") || "Wikipedia nie zwrocila listy.",
      });
    }
  }

  return cards;
}

function splitSections(text: string) {
  const lines = text.split("\n");
  const sections: Array<{ title: string; body: string }> = [];
  let current: { title: string; body: string } | null = null;

  for (const line of lines) {
    if (line.startsWith("## ") || line.startsWith("### ")) {
      if (current) {
        sections.push(current);
      }

      current = { title: line.replace(/^#{2,3}\s*/, ""), body: "" };
      continue;
    }

    if (!current) {
      current = { title: "Plan", body: "" };
    }

    current.body += `${line}\n`;
  }

  if (current) {
    sections.push(current);
  }

  return sections.filter((section) => section.title || section.body.trim());
}

function TravelCards({ cards }: { cards: TravelCard[] }) {
  if (cards.length === 0) {
    return null;
  }

  return (
    <div className="travel-card-grid" aria-label="Dane podrozy">
      {cards.map((card, index) => (
        <article className={`travel-data-card ${card.type}`} key={`${card.type}-${index}`}>
          <span>
            {card.type === "weather"
              ? "🌤️"
              : card.type === "currency"
                ? "💶"
                : card.type === "holidays"
                  ? "📅"
                  : "🏛️"}
          </span>
          <h3>{card.title}</h3>
          <strong>{card.value}</strong>
          <p>{card.detail}</p>
        </article>
      ))}
    </div>
  );
}

function ToolTimeline({ parts }: { parts: UIMessage["parts"] }) {
  const toolParts = parts.filter((part) => getToolName(part));

  if (toolParts.length === 0) {
    return null;
  }

  return (
    <div className="travel-tool-strip">
      {toolParts.map((part, index) => {
        const name = getToolName(part);

        return (
          <div className="travel-tool-pill" key={`${name}-${index}`}>
            <strong>{toolLabels[name] ?? name}</strong>
            <small>{formatToolOutput(getToolOutput(part))}</small>
          </div>
        );
      })}
    </div>
  );
}

function TravelPlan({ text }: { text: string }) {
  const sections = splitSections(text);

  return (
    <div className="travel-plan">
      {sections.map((section, index) => (
        <section className="travel-plan-section" key={index}>
          <h3>{section.title}</h3>
          {section.body.trim() && <p>{section.body.trim()}</p>}
        </section>
      ))}
    </div>
  );
}

function SafetyDiagnostics({
  elapsedMs,
  isLoading,
  message,
}: {
  elapsedMs: number;
  isLoading: boolean;
  message?: UIMessage;
}) {
  const text = message ? getMessageText(message.parts) : "";
  const toolInfo = message ? getToolDiagnostics(message.parts) : { counts: {}, errors: [] };
  const toolTotal = Object.values(toolInfo.counts).reduce((a, b) => a + b, 0);
  const sectionSteps = splitSections(text).filter((section) =>
    /pogoda|budzet|daty|zobaczyc|checklist|podsumowanie/i.test(section.title),
  ).length;
  const cappedSteps = Math.min(5, Math.max(0, sectionSteps || Math.ceil(toolTotal / 2)));
  const level = cappedSteps <= 3 ? "safe" : cappedSteps === 4 ? "warn" : "danger";
  const status = isLoading
    ? "W trakcie..."
    : cappedSteps >= 5
      ? "⚠️ Limit krokow"
      : "✅ Status: Zadanie ukonczone";

  return (
    <section className="safety-panel" aria-label="Diagnostyka">
      <h2>🛡️ Diagnostyka</h2>
      <div className={`safety-progress ${level}`}>
        <span style={{ width: `${(cappedSteps / 5) * 100}%` }} />
      </div>
      <p>Kroki: {cappedSteps}/5</p>
      <p>
        Narzedzia:{" "}
        {Object.keys(toolInfo.counts).length
          ? Object.entries(toolInfo.counts)
              .map(([tool, count]) => `${tool}(${count})`)
              .join(", ")
          : "brak"}
      </p>
      <p>Bledy: {toolInfo.errors.length}</p>
      <p>Czas: {(elapsedMs / 1000).toFixed(1)}s</p>
      <strong>{status}</strong>
      {toolInfo.errors.map((error, index) => (
        <div className="safety-alert" key={`${error.tool}-${index}`}>
          🔴 {error.tool} - {error.message}
        </div>
      ))}
    </section>
  );
}

function MessageContent({ message }: { message: UIMessage }) {
  const text = getMessageText(message.parts);

  if (message.role === "user") {
    return <>{text}</>;
  }

  return (
    <>
      <TravelCards cards={buildTravelCards(message.parts)} />
      <ToolTimeline parts={message.parts} />
      {text && <TravelPlan text={text} />}
    </>
  );
}

export default function TravelPage() {
  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/travel" }),
    [],
  );
  const { messages, sendMessage, status, error } = useChat({ transport });
  const [input, setInput] = useState("");
  const [elapsedMs, setElapsedMs] = useState(0);

  const isLoading = status === "submitted" || status === "streaming";
  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");

  async function sendTravelTask(text: string) {
    const trimmed = text.trim();

    if (!trimmed || isLoading) {
      return;
    }

    const start = performance.now();
    setElapsedMs(0);
    await sendMessage({ text: trimmed });
    setElapsedMs(performance.now() - start);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();

    if (!text) {
      return;
    }

    setInput("");
    await sendTravelTask(text);
  }

  return (
    <main className="chat-shell travel-shell">
      <section className="chat-panel travel-panel" aria-label="Asystent podrozy AI">
        <header className="chat-header travel-header">
          <h1>✈️ Asystent podrozy AI</h1>
          <p>Powiedz dokad jedziesz - agent zaplanuje wszystko</p>

          <div className="example-questions" aria-label="Scenariusze podrozy">
            {scenarios.map((scenario) => (
              <button
                disabled={isLoading}
                key={scenario}
                onClick={() => void sendTravelTask(scenario)}
                type="button"
              >
                {scenario}
              </button>
            ))}
          </div>
        </header>

        <div className="messages" aria-live="polite">
          {messages.length === 0 ? (
            <div className="empty-state">
              <p>Podaj cel, termin i budzet. Agent sprawdzi pogode, waluty, swieta i atrakcje.</p>
            </div>
          ) : (
            messages.map((message) => (
              <div className={`message-row ${message.role}`} key={message.id}>
                <div className="message-bubble travel-bubble">
                  <MessageContent message={message} />
                </div>
              </div>
            ))
          )}

          {isLoading && (
            <div className="message-row assistant">
              <div className="message-bubble loading">Asystent planuje podroz...</div>
            </div>
          )}

          {error && (
            <div className="message-row assistant">
              <div className="message-bubble">
                Wystapil problem z asystentem podrozy. Sprobuj ponownie.
              </div>
            </div>
          )}
        </div>

        <form className="composer" onSubmit={handleSubmit}>
          <input
            aria-label="Opis planowanej podrozy"
            disabled={isLoading}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Np. Lece do Barcelony na weekend..."
            value={input}
          />
          <button disabled={isLoading || input.trim().length === 0} type="submit">
            Wyslij
          </button>
        </form>

        <SafetyDiagnostics
          elapsedMs={elapsedMs}
          isLoading={isLoading}
          message={lastAssistant}
        />
      </section>
    </main>
  );
}
