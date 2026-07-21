"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { FormEvent, useMemo, useRef, useState } from "react";
import { useImageAttachment } from "../use-image-attachment";

type AIModel = "flash" | "pro";

const tools = [
  ["🧮", "Kalkulator"],
  ["🕐", "Data i czas"],
  ["🌐", "Google Search"],
  ["📄", "Czytanie stron"],
  ["🎨", "Generowanie obrazow"],
  ["👁️", "Analiza obrazow"],
];

const scenarios = [
  "Znajdz w Google co robi firma Syntelligence i wygeneruj dla nich logo",
  "Przeczytaj strone apple.com i opisz ich aktualna oferte iPhone",
  "Ile to 23% VAT z 8500 PLN? Podaj kwote brutto i netto",
  "Jakie sa najnowsze wiadomosci o AI? Wygeneruj grafike do posta o tym",
  "Wyszukaj w Google 'best coffee shops Krakow' i streszcz wyniki",
];

const toolEmoji: Record<string, string> = {
  calculator: "🧮",
  currentDateTime: "🕐",
  generateImage: "🎨",
  google_search: "🌐",
  readWebPage: "📄",
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
    state?: string;
  };

  return value.output ?? value.result;
}

function summarizeOutput(output: unknown) {
  if (!output) {
    return "w trakcie...";
  }

  if (typeof output === "string") {
    return output.slice(0, 120);
  }

  if (typeof output === "object") {
    const data = output as { error?: string; image?: string; result?: unknown; text?: string };

    if (data.error) {
      return data.error;
    }

    if (data.image) {
      return "wygenerowany obraz";
    }

    if (data.result !== undefined) {
      return String(data.result);
    }

    if (data.text) {
      return data.text.slice(0, 120);
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

function SafetyDiagnostics({
  elapsedMs,
  isLoading,
  message,
}: {
  elapsedMs: number;
  isLoading: boolean;
  message?: UIMessage;
}) {
  const toolInfo = message ? getToolDiagnostics(message.parts) : { counts: {}, errors: [] };
  const toolTotal = Object.values(toolInfo.counts).reduce((a, b) => a + b, 0);
  const cappedSteps = Math.min(5, Math.max(0, Math.ceil(toolTotal / 2)));
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

function findGeneratedImages(parts: UIMessage["parts"]) {
  return parts
    .map((part) => getToolOutput(part))
    .filter((output): output is { image: string; text?: string } => {
      return (
        typeof output === "object" &&
        output !== null &&
        typeof (output as { image?: unknown }).image === "string"
      );
    });
}

function ToolTimeline({ parts }: { parts: UIMessage["parts"] }) {
  const toolParts = parts.filter((part) => getToolName(part));

  if (toolParts.length === 0) {
    return null;
  }

  return (
    <div className="tool-timeline">
      <strong>Agent wykonuje zadanie...</strong>
      {toolParts.map((part, index) => {
        const toolName = getToolName(part);
        const output = getToolOutput(part);

        return (
          <div className="tool-step" key={`${toolName}-${index}`}>
            <span>
              {index + 1}. {toolEmoji[toolName] ?? "🔧"} {toolName}
            </span>
            <small>{summarizeOutput(output)}</small>
          </div>
        );
      })}
    </div>
  );
}

function MessageContent({ message }: { message: UIMessage }) {
  const text = getMessageText(message.parts);
  const generatedImages = findGeneratedImages(message.parts);

  return (
    <>
      {message.role === "assistant" && <ToolTimeline parts={message.parts} />}
      {text && <div className="markdown-content">{text}</div>}
      {generatedImages.map((item, index) => (
        <div className="inline-generated" key={index}>
          <img alt={item.text || "Wygenerowany obraz"} src={item.image} />
          {item.text && <p>{item.text}</p>}
          <button
            onClick={() => {
              const link = document.createElement("a");
              link.href = item.image;
              link.download = "ai-generated.png";
              document.body.appendChild(link);
              link.click();
              link.remove();
            }}
            type="button"
          >
            💾 Pobierz
          </button>
        </div>
      ))}
    </>
  );
}

export default function AgentPage() {
  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/chat" }),
    [],
  );
  const { messages, sendMessage, status, error } = useChat({ transport });
  const [input, setInput] = useState("");
  const [model, setModel] = useState<AIModel>("flash");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const imageAttachment = useImageAttachment();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const isLoading = status === "submitted" || status === "streaming";
  const lastAssistant = [...messages].reverse().find((item) => item.role === "assistant");
  const toolCount =
    lastAssistant?.parts.filter((part) => Boolean(getToolName(part))).length ?? 0;

  async function sendAgentMessage(text: string) {
    if ((!text && !imageAttachment.attachedImage) || isLoading) {
      return;
    }

    const start = performance.now();
    setStartedAt(start);
    setElapsedMs(0);
    await sendMessage(
      { text: text || "Co widzisz na tym obrazie?" },
      {
        body: {
          image: imageAttachment.attachedImage?.dataUrl,
          mode: "agent",
          model,
        },
      },
    );
    setElapsedMs(performance.now() - start);
    imageAttachment.clearImage();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();

    if (!text && !imageAttachment.attachedImage) {
      return;
    }

    setInput("");
    await sendAgentMessage(text);
  }

  return (
    <main
      className="chat-shell agent-shell"
      onDragLeave={imageAttachment.handleDragLeave}
      onDragOver={imageAttachment.handleDragOver}
      onDrop={imageAttachment.handleDrop}
    >
      {imageAttachment.isDragActive && <div className="drop-overlay">Upusc obraz</div>}

      <section className="agent-layout">
        <aside className="tools-panel" aria-label="Moje narzedzia">
          <h2>Moje narzedzia</h2>
          {tools.map(([icon, label]) => (
            <div className="tool-row" key={label}>
              <span>
                {icon} {label}
              </span>
              <strong>aktywny</strong>
            </div>
          ))}
        </aside>

        <section className="chat-panel" aria-label="Agent AI pelna moc">
          <header className="chat-header">
            <h1>🤖 Agent AI - Pelna moc</h1>
            <p>{tools.length} narzedzi • autonomiczne decyzje</p>

            <div className="example-questions" aria-label="Scenariusze">
              {scenarios.map((scenario) => (
                <button
                  disabled={isLoading}
                  key={scenario}
                  onClick={() => void sendAgentMessage(scenario)}
                  type="button"
                >
                  {scenario}
                </button>
              ))}
            </div>
          </header>

          <div className="model-switcher" aria-label="Model AI">
            {(["flash", "pro"] as AIModel[]).map((item) => (
              <button
                className={model === item ? "active" : ""}
                disabled={isLoading}
                key={item}
                onClick={() => setModel(item)}
                type="button"
              >
                <strong>{item === "flash" ? "⚡ Flash" : "🧠 Pro"}</strong>
              </button>
            ))}
          </div>

          <div className="messages" aria-live="polite">
            {messages.length === 0 ? (
              <div className="empty-state">
                <p>Wybierz scenariusz albo zlec agentowi zadanie laczace narzedzia.</p>
              </div>
            ) : (
              messages.map((message) => (
                <div className={`message-row ${message.role}`} key={message.id}>
                  <div className="message-bubble">
                    <MessageContent message={message} />
                  </div>
                </div>
              ))
            )}

            {isLoading && (
              <div className="message-row assistant">
                <div className="message-bubble loading">Agent pracuje...</div>
              </div>
            )}

            {error && (
              <div className="message-row assistant">
                <div className="message-bubble">
                  Wystapil problem z agentem. Sprobuj ponownie.
                </div>
              </div>
            )}
          </div>

          {lastAssistant && (
            <div className="tool-counter">
              Uzyto {toolCount} narzedzi | {(elapsedMs / 1000).toFixed(1)}s |
              Model: gemini-3.1-flash-lite
            </div>
          )}

          <SafetyDiagnostics
            elapsedMs={elapsedMs}
            isLoading={isLoading}
            message={lastAssistant}
          />

          {imageAttachment.attachedImage && (
            <div className="attachment-preview">
              <img alt="Zalaczony obraz" src={imageAttachment.attachedImage.dataUrl} />
              <div>
                <strong>📎 Screenshot - zadaj pytanie o ten obraz</strong>
                <span>{imageAttachment.attachedImage.name}</span>
              </div>
              <button onClick={imageAttachment.clearImage} type="button">
                X
              </button>
            </div>
          )}
          {imageAttachment.imageError && (
            <div className="attachment-error">{imageAttachment.imageError}</div>
          )}

          <form className="composer" onSubmit={handleSubmit}>
            <input
              accept="image/*"
              hidden
              onChange={imageAttachment.handleFileChange}
              ref={imageAttachment.fileInputRef}
              type="file"
            />
            <button
              className="icon-button"
              disabled={isLoading}
              onClick={imageAttachment.openFilePicker}
              type="button"
              title="Dodaj obraz"
            >
              📎
            </button>
            <input
              aria-label="Zadanie dla agenta"
              disabled={isLoading}
              onChange={(event) => setInput(event.target.value)}
              onPaste={imageAttachment.handlePaste}
              placeholder="Zlec zadanie agentowi..."
              ref={inputRef}
              value={input}
            />
            <button
              disabled={
                isLoading ||
                (input.trim().length === 0 && !imageAttachment.attachedImage)
              }
              type="submit"
            >
              Wyslij
            </button>
          </form>
        </section>
      </section>
    </main>
  );
}
