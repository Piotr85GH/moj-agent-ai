"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type AIModel = "flash" | "pro";

const aiModels: Array<{
  id: AIModel;
  label: string;
  icon: string;
  description: string;
}> = [
  { id: "flash", label: "Flash", icon: "⚡", description: "szybki" },
  { id: "pro", label: "Pro", icon: "🧠", description: "zaawansowany" },
];

const formatCommands = [
  "/tabela jezyki programowania 2026",
  "/porownanie ChatGPT vs Claude",
  "/lista 5 krokow do pierwszego agenta AI",
  "/faq sztuczna inteligencja dla poczatkujacych",
  "/email podziekowanie za udana rekrutacje",
];

function getMessageText(parts: UIMessage["parts"]) {
  return parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function renderInline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
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

function MarkdownMessage({ text }: { text: string }) {
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
        <div className="markdown-table-wrap" key={`table-${index}`}>
          <table className="markdown-table">
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
      const content = renderInline(heading[2]);

      blocks.push(
        level === 1 ? (
          <h2 key={index}>{content}</h2>
        ) : level === 2 ? (
          <h3 key={index}>{content}</h3>
        ) : (
          <h4 key={index}>{content}</h4>
        ),
      );
      continue;
    }

    const unordered = /^[-*]\s+(.+)$/.exec(line);
    if (unordered) {
      blocks.push(<p key={index}>• {renderInline(unordered[1])}</p>);
      continue;
    }

    blocks.push(<p key={index}>{renderInline(line)}</p>);
  }

  return <div className="markdown-content">{blocks}</div>;
}

function MessageText({ parts }: { parts: UIMessage["parts"] }) {
  return <MarkdownMessage text={getMessageText(parts)} />;
}

export default function FormatPage() {
  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/format" }),
    [],
  );
  const { messages, sendMessage, setMessages, status, error } = useChat({
    transport,
  });
  const [input, setInput] = useState("");
  const [model, setModel] = useState<AIModel>("flash");
  const [messageModels, setMessageModels] = useState<Record<string, AIModel>>(
    {},
  );
  const [memoryOpen, setMemoryOpen] = useState(true);
  const [exportStatus, setExportStatus] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const lastSentModelRef = useRef<AIModel>("flash");

  const isLoading = status === "submitted" || status === "streaming";
  const textHistory = useMemo(
    () =>
      messages.map((message) => ({
        ...message,
        text: getMessageText(message.parts),
      })),
    [messages],
  );
  const characterCount = textHistory.reduce(
    (total, message) => total + message.text.length,
    0,
  );
  const estimatedTokens = Math.ceil(characterCount / 4);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  useEffect(() => {
    setMessageModels((current) => {
      let changed = false;
      const next = { ...current };

      for (const message of messages) {
        if (message.role === "assistant" && !next[message.id]) {
          next[message.id] = lastSentModelRef.current;
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [messages]);

  async function sendUserMessage(text: string) {
    if (!text || isLoading) {
      return;
    }

    lastSentModelRef.current = model;
    await sendMessage({ text }, { body: { model } });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = input.trim();
    if (!text) {
      return;
    }

    setInput("");
    await sendUserMessage(text);
  }

  function chooseCommand(command: string) {
    setInput(command);
    inputRef.current?.focus();
  }

  function startNewConversation() {
    setMessages([]);
    setMessageModels({});
    setInput("");
    setExportStatus("");
  }

  async function exportConversation() {
    const exportText = textHistory
      .map((message) => {
        const author = message.role === "user" ? "User" : "Agent";
        return `${author}: ${message.text}`;
      })
      .join("\n");

    if (!exportText) {
      return;
    }

    await navigator.clipboard.writeText(exportText);
    setExportStatus("Skopiowano!");
    window.setTimeout(() => setExportStatus(""), 1800);
  }

  return (
    <main className="chat-shell">
      <section className="chat-panel" aria-label="Formatowanie">
        <header className="chat-header">
          <h1>📐 Formatowanie</h1>
          <p>Agent odpowiada w tabeli, liscie, porownaniu - na zadanie.</p>
        </header>

        <section className="memory-panel" aria-label="Kontekst rozmowy">
          <button
            className="memory-toggle"
            onClick={() => setMemoryOpen((isOpen) => !isOpen)}
            type="button"
          >
            <span>Kontekst rozmowy</span>
            <span>{memoryOpen ? "Ukryj" : "Pokaz"}</span>
          </button>

          {memoryOpen && (
            <div className="memory-content">
              <p>
                Wiadomosci: {messages.length} | ~Tokeny: {estimatedTokens}
              </p>
              <div className="memory-actions">
                <button onClick={startNewConversation} type="button">
                  🗑 Nowa rozmowa
                </button>
                <button
                  disabled={messages.length === 0}
                  onClick={exportConversation}
                  type="button"
                >
                  📋 Eksportuj rozmowe
                </button>
                {exportStatus && <span>{exportStatus}</span>}
              </div>
            </div>
          )}
        </section>

        <div className="model-switcher" aria-label="Model AI">
          {aiModels.map((item) => (
            <button
              className={model === item.id ? "active" : ""}
              disabled={isLoading}
              key={item.id}
              onClick={() => setModel(item.id)}
              type="button"
            >
              <span>{item.icon}</span>
              <strong>{item.label}</strong>
              <small>{item.description}</small>
            </button>
          ))}
        </div>

        <div className="messages" aria-live="polite">
          {messages.length === 0 ? (
            <div className="empty-state">
              <p>Wybierz komende formatu albo wpisz wlasna.</p>
            </div>
          ) : (
            messages.map((message) => (
              <div className={`message-row ${message.role}`} key={message.id}>
                <div className="message-bubble">
                  {message.role === "assistant" && (
                    <span
                      className={`model-badge ${
                        messageModels[message.id] ?? model
                      }`}
                    >
                      {
                        aiModels.find(
                          (item) =>
                            item.id === (messageModels[message.id] ?? model),
                        )?.icon
                      }{" "}
                      {messageModels[message.id] ?? model}
                    </span>
                  )}
                  <MessageText parts={message.parts} />
                </div>
              </div>
            ))
          )}

          {isLoading && (
            <div className="message-row assistant">
              <div className="message-bubble loading">Mysle...</div>
            </div>
          )}

          {error && (
            <div className="message-row assistant">
              <div className="message-bubble">
                Wystapil problem z odpowiedzia AI. Sprobuj ponownie.
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <form className="composer" onSubmit={handleSubmit}>
          <input
            aria-label="Komenda formatowania"
            disabled={isLoading}
            onChange={(event) => setInput(event.target.value)}
            placeholder="/tabela, /lista, /porownanie, /faq albo /email..."
            ref={inputRef}
            value={input}
          />
          <button disabled={isLoading || input.trim().length === 0} type="submit">
            Wyslij
          </button>
        </form>

        <div className="term-buttons" aria-label="Przykladowe komendy">
          {formatCommands.map((command) => (
            <button
              disabled={isLoading}
              key={command}
              onClick={() => chooseCommand(command)}
              type="button"
            >
              {command}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
