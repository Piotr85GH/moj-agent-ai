"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

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

const exampleQuestions = [
  "Firma ma 120 pracownikow na umowe o prace. 40% to kobiety. Sposrod kobiet 25% pracuje zdalnie. Sposrod mezczyzn 15% pracuje zdalnie. Ile osob lacznie pracuje zdalnie i jaki to procent calej firmy?",
  "Mam oferte: 12 000 zl brutto na UoP vs 15 000 zl netto na B2B. Co sie bardziej oplaca?",
  "Jak porownac ryczalt i skale podatkowa przy nieregularnych kosztach?",
  "Czy warto rejestrowac sie do VAT, jesli mam klientow z Polski i UE?",
];

function getMessageText(parts: UIMessage["parts"]) {
  return parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function MessageText({ parts }: { parts: UIMessage["parts"] }) {
  return <>{getMessageText(parts)}</>;
}

export default function ThinkPage() {
  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/think" }),
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
      <section className="chat-panel" aria-label="Tryb glebokiego myslenia">
        <header className="chat-header">
          <h1>🧠 Tryb glebokiego myslenia</h1>
          <p>Agent pokazuje tok rozumowania krok po kroku.</p>

          <div className="example-questions" aria-label="Przykladowe pytania">
            {exampleQuestions.map((question) => (
              <button
                disabled={isLoading}
                key={question}
                onClick={() => sendUserMessage(question)}
                type="button"
              >
                {question}
              </button>
            ))}
          </div>
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
              <p>Wybierz model i zadaj trudne pytanie.</p>
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
            aria-label="Wiadomosc"
            disabled={isLoading}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Zadaj trudne pytanie..."
            value={input}
          />
          <button disabled={isLoading || input.trim().length === 0} type="submit">
            Wyslij
          </button>
        </form>
      </section>
    </main>
  );
}
