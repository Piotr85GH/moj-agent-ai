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
import { useImageAttachment } from "../use-image-attachment";

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

const starterQuestions = [
  "Jakie sa najnowsze wiadomosci o sztucznej inteligencji?",
  "Ile kosztuje iPhone 16 Pro w Polsce?",
  "Kto wygral ostatni mecz reprezentacji Polski?",
  "Jakie filmy sa teraz w kinach?",
];

function getMessageText(parts: UIMessage["parts"]) {
  return parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function getSources(parts: UIMessage["parts"]) {
  return parts
    .filter((part) => part.type === "source-url")
    .map((part) => ({
      id: part.sourceId,
      title: part.title || part.url,
      url: part.url,
    }));
}

function renderInline(text: string) {
  return text.split(/(https?:\/\/[^\s)]+|\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
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

function MarkdownMessage({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (!line.trim()) {
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

    const listItem = /^[-*]\s+(.+)$/.exec(line);
    if (listItem) {
      blocks.push(<p key={index}>- {renderInline(listItem[1])}</p>);
      continue;
    }

    blocks.push(<p key={index}>{renderInline(line)}</p>);
  }

  return <div className="markdown-content">{blocks}</div>;
}

function MessageContent({ parts }: { parts: UIMessage["parts"] }) {
  const text = getMessageText(parts);
  const sources = getSources(parts);

  return (
    <>
      <MarkdownMessage text={text} />
      {sources.length > 0 && (
        <div className="source-links" aria-label="Zrodla">
          {sources.map((source) => (
            <a
              href={source.url}
              key={`${source.id}-${source.url}`}
              rel="noreferrer"
              target="_blank"
            >
              {source.title}
            </a>
          ))}
        </div>
      )}
    </>
  );
}

export default function SearchPage() {
  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/chat" }),
    [],
  );
  const { messages, sendMessage, setMessages, status, error } = useChat({
    transport,
  });
  const [input, setInput] = useState("");
  const [model, setModel] = useState<AIModel>("flash");
  const [exportStatus, setExportStatus] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const imageAttachment = useImageAttachment();

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

  async function sendUserMessage(text: string) {
    if ((!text && !imageAttachment.attachedImage) || isLoading) {
      return;
    }

    await sendMessage(
      { text: text || "Co widzisz na tym obrazie?" },
      {
        body: {
          image: imageAttachment.attachedImage?.dataUrl,
          mode: "search",
          model,
        },
      },
    );
    imageAttachment.clearImage();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = input.trim();
    if (!text && !imageAttachment.attachedImage) {
      return;
    }

    setInput("");
    await sendUserMessage(text);
  }

  function startNewConversation() {
    setMessages([]);
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
      <section className="chat-panel" aria-label="Agent z wyszukiwarka">
        <header className="chat-header">
          <h1>Agent z wyszukiwarka</h1>
          <p>Przeszukuje prawdziwy internet i czytam strony</p>

          <div className="example-questions" aria-label="Pytania startowe">
            {starterQuestions.map((question) => (
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
          <div className="memory-content search-memory">
            <p>
              Wiadomosci: {messages.length} | ~Tokeny: {estimatedTokens}
            </p>
            <div className="memory-actions">
              <button onClick={startNewConversation} type="button">
                Nowa rozmowa
              </button>
              <button
                disabled={messages.length === 0}
                onClick={exportConversation}
                type="button"
              >
                Eksportuj rozmowe
              </button>
              {exportStatus && <span>{exportStatus}</span>}
            </div>
          </div>
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
              <p>Zapytaj o aktualny temat albo wklej URL do przeczytania.</p>
            </div>
          ) : (
            messages.map((message) => (
              <div className={`message-row ${message.role}`} key={message.id}>
                <div className="message-bubble">
                  <MessageContent parts={message.parts} />
                </div>
              </div>
            ))
          )}

          {isLoading && (
            <div className="message-row assistant">
              <div className="message-bubble loading">Szukam...</div>
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
            aria-label="Wiadomosc"
            disabled={isLoading}
            onChange={(event) => setInput(event.target.value)}
            onPaste={imageAttachment.handlePaste}
            placeholder="Zapytaj o cokolwiek aktualnego..."
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
    </main>
  );
}
