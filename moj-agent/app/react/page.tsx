"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { FormEvent, useEffect, useMemo, useState } from "react";

const scenarios = [
  "Planuje weekend w Krakowie. Sprawdz pogode, znajdz ciekawe miejsca w Wikipedii, i powiedz czy sa jakies swieta w ten weekend",
  "Mam 5000 EUR do wydania. Przelicz na PLN, sprawdz ile to w dolarach, i zapisz wszystkie kursy w notatkach",
  "Porownaj pogode w Warszawie, Berlinie i Paryzu. Ktore z tych miast ma dzis najlepsza pogode?",
  "Ile dni do nastepnego swieta w Polsce? Jaka bedzie wtedy pogoda?",
];

const toolEmoji: Record<string, string> = {
  calculator: "🧮",
  currentDateTime: "🕐",
  getExchangeRate: "💱",
  getHolidays: "📅",
  getNotes: "🗒️",
  getWeather: "🌦️",
  google_search: "🌐",
  readWebPage: "📄",
  saveNote: "💾",
  searchWikipedia: "📚",
};

type ReactSection = {
  type: "thought" | "observation" | "final" | "text";
  title: string;
  body: string;
};

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
  const value = part as {
    output?: unknown;
    result?: unknown;
  };

  return value.output ?? value.result;
}

function summarizeOutput(output: unknown) {
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

    if (typeof data.description === "string" && data.temperatureC !== undefined) {
      return `${data.temperatureC}C, ${data.description}`;
    }

    if (data.converted !== undefined && data.to) {
      return `${data.converted} ${data.to}`;
    }

    if (data.saved) {
      return "notatka zapisana";
    }

    if (Array.isArray(data.notes)) {
      return `${data.notes.length} notatek`;
    }

    if (Array.isArray(data.results)) {
      return `${data.results.length} wynikow`;
    }

    if (Array.isArray(data.holidays)) {
      return `${data.holidays.length} swiat`;
    }

    if (data.result !== undefined) {
      return String(data.result);
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
      errors.push({ tool, message: summarizeOutput(output) });
    }
  }

  return { counts, errors };
}

function parseReactSections(text: string): ReactSection[] {
  const lines = text.split("\n");
  const sections: ReactSection[] = [];
  let current: ReactSection | null = null;

  function sectionType(title: string): ReactSection["type"] {
    const lower = title.toLowerCase();

    if (lower.includes("mysle")) {
      return "thought";
    }

    if (lower.includes("obserwuje")) {
      return "observation";
    }

    if (lower.includes("wynik")) {
      return "final";
    }

    return "text";
  }

  for (const line of lines) {
    if (line.startsWith("### ")) {
      if (current) {
        sections.push(current);
      }

      const title = line.replace(/^###\s*/, "").trim();
      current = { type: sectionType(title), title, body: "" };
      continue;
    }

    if (!current) {
      current = { type: "text", title: "Odpowiedz", body: "" };
    }

    current.body += `${line}\n`;
  }

  if (current) {
    sections.push(current);
  }

  return sections.filter((section) => section.title || section.body.trim());
}

function ReactProgress({ text, toolCount }: { text: string; toolCount: number }) {
  const sections = parseReactSections(text);
  const stepCount = Math.max(
    1,
    sections.filter((section) => section.type === "thought").length,
    Math.ceil(toolCount / 2),
  );
  const currentStep = Math.min(5, stepCount);
  const progress = `${(currentStep / 5) * 100}%`;

  return (
    <div className="react-progress" aria-label={`Krok ${currentStep} z 5`}>
      <div>
        <span>Krok {currentStep} z 5</span>
        <strong>{toolCount} narzedzi</strong>
      </div>
      <div className="react-progress-track">
        <span style={{ width: progress }} />
      </div>
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
  const stepCount = Math.max(
    0,
    parseReactSections(text).filter((section) => section.type === "thought").length,
    message ? Math.ceil(Object.values(toolInfo.counts).reduce((a, b) => a + b, 0) / 2) : 0,
  );
  const cappedSteps = Math.min(5, stepCount);
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

function ToolTimeline({ parts }: { parts: UIMessage["parts"] }) {
  const toolParts = parts.filter((part) => getToolName(part));

  if (toolParts.length === 0) {
    return null;
  }

  return (
    <div className="react-tool-timeline">
      <strong>⚡ Narzedzia</strong>
      {toolParts.map((part, index) => {
        const toolName = getToolName(part);

        return (
          <div className="react-tool-step" key={`${toolName}-${index}`}>
            <span>
              {index + 1}. {toolEmoji[toolName] ?? "🔧"} {toolName}
            </span>
            <small>{summarizeOutput(getToolOutput(part))}</small>
          </div>
        );
      })}
    </div>
  );
}

function ReactSections({ text }: { text: string }) {
  const sections = parseReactSections(text);

  return (
    <div className="react-sections">
      {sections.map((section, index) => (
        <section className={`react-section ${section.type}`} key={index}>
          <h3>{section.title}</h3>
          {section.body.trim() && <p>{section.body.trim()}</p>}
        </section>
      ))}
    </div>
  );
}

function MessageContent({ message }: { message: UIMessage }) {
  const text = getMessageText(message.parts);
  const toolCount = message.parts.filter((part) => getToolName(part)).length;

  if (message.role === "user") {
    return <>{text}</>;
  }

  return (
    <>
      <ReactProgress text={text} toolCount={toolCount} />
      <ToolTimeline parts={message.parts} />
      {text && <ReactSections text={text} />}
    </>
  );
}

export default function ReActPage() {
  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/react" }),
    [],
  );
  const { messages, sendMessage, status, error } = useChat({ transport });
  const [input, setInput] = useState("");
  const [elapsedMs, setElapsedMs] = useState(0);

  const isLoading = status === "submitted" || status === "streaming";
  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");

  useEffect(() => {
    const prompt = new URLSearchParams(window.location.search).get("prompt");

    if (prompt) {
      setInput(prompt);
    }
  }, []);

  async function sendTask(text: string) {
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
    await sendTask(text);
  }

  return (
    <main className="chat-shell react-shell">
      <section className="chat-panel react-panel" aria-label="Agent ReAct">
        <header className="chat-header">
          <h1>🔄 Agent ReAct - Autonomiczne rozumowanie</h1>
          <p>Opisz cel → agent sam planuje i realizuje</p>

          <div className="example-questions" aria-label="Scenariusze ReAct">
            {scenarios.map((scenario) => (
              <button
                disabled={isLoading}
                key={scenario}
                onClick={() => void sendTask(scenario)}
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
              <p>Wpisz cel, a agent zaplanuje kroki, uzyje narzedzi i pokaze obserwacje.</p>
            </div>
          ) : (
            messages.map((message) => (
              <div className={`message-row ${message.role}`} key={message.id}>
                <div className="message-bubble react-bubble">
                  <MessageContent message={message} />
                </div>
              </div>
            ))
          )}

          {isLoading && (
            <div className="message-row assistant">
              <div className="message-bubble loading">Agent ReAct pracuje...</div>
            </div>
          )}

          {error && (
            <div className="message-row assistant">
              <div className="message-bubble">
                Wystapil problem z agentem ReAct. Sprobuj ponownie.
              </div>
            </div>
          )}
        </div>

        <form className="composer" onSubmit={handleSubmit}>
          <input
            aria-label="Cel dla agenta ReAct"
            disabled={isLoading}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Opisz co chcesz osiagnac..."
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
