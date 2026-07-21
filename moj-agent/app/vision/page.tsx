"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { FormEvent, useMemo, useState } from "react";
import { useImageAttachment } from "../use-image-attachment";

const visionQuestions = [
  "Co widzisz na tym obrazie?",
  "Wyciagnij caly tekst z tego screena",
  "Opisz to w 3 zdaniach",
  "Jakie kolory dominuja? Podaj kody HEX",
  "Wygeneruj podobny obraz w innym stylu",
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

export default function VisionPage() {
  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/chat" }),
    [],
  );
  const { messages, sendMessage, status, error } = useChat({ transport });
  const imageAttachment = useImageAttachment();
  const [input, setInput] = useState("");
  const [generatedImage, setGeneratedImage] = useState("");
  const [generateError, setGenerateError] = useState("");
  const [isGeneratingVariant, setIsGeneratingVariant] = useState(false);

  const isLoading = status === "submitted" || status === "streaming";

  async function sendVisionMessage(text: string) {
    if ((!text && !imageAttachment.attachedImage) || isLoading) {
      return;
    }

    await sendMessage(
      { text: text || "Co widzisz na tym obrazie?" },
      {
        body: {
          image: imageAttachment.attachedImage?.dataUrl,
          mode: "vision",
          model: "flash",
        },
      },
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();

    if (!text && !imageAttachment.attachedImage) {
      return;
    }

    setInput("");
    await sendVisionMessage(text);
  }

  async function generateSimilar() {
    if (!imageAttachment.attachedImage || isGeneratingVariant) {
      return;
    }

    setIsGeneratingVariant(true);
    setGenerateError("");
    setGeneratedImage("");
    await sendVisionMessage(
      "Opisz obraz tak, zeby mozna bylo wygenerowac podobny obraz w innym stylu.",
    );

    try {
      const response = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt:
            "Wygeneruj podobny obraz w innym stylu. Zachowaj ogolna kompozycje, temat i najwazniejsze elementy z obrazu referencyjnego, ale uzyj nowej estetyki.",
        }),
      });
      const data = (await response.json()) as { image?: string; error?: string };

      if (!response.ok || !data.image) {
        throw new Error(data.error || "Nie udalo sie wygenerowac wariantu.");
      }

      setGeneratedImage(data.image);
    } catch (caughtError) {
      setGenerateError(
        caughtError instanceof Error
          ? caughtError.message
          : "Nie udalo sie wygenerowac wariantu.",
      );
    } finally {
      setIsGeneratingVariant(false);
    }
  }

  return (
    <main
      className="chat-shell"
      onDragLeave={imageAttachment.handleDragLeave}
      onDragOver={imageAttachment.handleDragOver}
      onDrop={imageAttachment.handleDrop}
    >
      {imageAttachment.isDragActive && (
        <div className="drop-overlay">Upusc obraz</div>
      )}

      <section className="chat-panel vision-panel" aria-label="Agent Vision">
        <header className="chat-header">
          <h1>👁️ Agent Vision</h1>
          <p>Wklej screenshot, wrzuc plik lub przeciagnij obraz</p>
        </header>

        <input
          accept="image/*"
          hidden
          onChange={imageAttachment.handleFileChange}
          ref={imageAttachment.fileInputRef}
          type="file"
        />

        {!imageAttachment.attachedImage ? (
          <button
            className="vision-dropzone"
            onClick={imageAttachment.openFilePicker}
            onPaste={imageAttachment.handlePaste}
            type="button"
          >
            <span>📸 Ctrl+V - wklej screenshot</span>
            <span>📁 Kliknij - wybierz plik</span>
            <span>🖱️ Przeciagnij - upusc obraz</span>
          </button>
        ) : (
          <div className="vision-workspace">
            <div className="vision-images">
              <div>
                <strong>Oryginal</strong>
                <img
                  alt="Obraz do analizy"
                  src={imageAttachment.attachedImage.dataUrl}
                />
              </div>
              {generatedImage && (
                <div>
                  <strong>Nowa wersja</strong>
                  <img alt="Wygenerowany wariant" src={generatedImage} />
                </div>
              )}
            </div>

            <button
              className="remove-image"
              onClick={() => {
                imageAttachment.clearImage();
                setGeneratedImage("");
                setGenerateError("");
              }}
              type="button"
            >
              X Usun obraz
            </button>

            <div className="example-questions" aria-label="Pytania o obraz">
              {visionQuestions.map((question) => (
                <button
                  disabled={isLoading || isGeneratingVariant}
                  key={question}
                  onClick={() =>
                    question.startsWith("Wygeneruj")
                      ? void generateSimilar()
                      : void sendVisionMessage(question)
                  }
                  type="button"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        )}

        {imageAttachment.imageError && (
          <div className="attachment-error">{imageAttachment.imageError}</div>
        )}
        {generateError && <div className="attachment-error">{generateError}</div>}

        <div className="messages" aria-live="polite">
          {messages.map((message) => (
            <div className={`message-row ${message.role}`} key={message.id}>
              <div className="message-bubble">
                <MessageText parts={message.parts} />
              </div>
            </div>
          ))}

          {(isLoading || isGeneratingVariant) && (
            <div className="message-row assistant">
              <div className="message-bubble loading">
                {isGeneratingVariant ? "Generuje wariant..." : "Analizuje obraz..."}
              </div>
            </div>
          )}

          {error && (
            <div className="message-row assistant">
              <div className="message-bubble">
                Wystapil problem z analiza obrazu. Sprobuj ponownie.
              </div>
            </div>
          )}
        </div>

        <form className="composer" onSubmit={handleSubmit}>
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
            aria-label="Pytanie o obraz"
            disabled={isLoading}
            onChange={(event) => setInput(event.target.value)}
            onPaste={imageAttachment.handlePaste}
            placeholder="Zadaj pytanie o obraz..."
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
