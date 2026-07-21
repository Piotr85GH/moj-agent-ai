"use client";

import { FormEvent, useState } from "react";

const examplePrompts = [
  "Minimalistyczne logo kawiarni w stylu japonskim",
  "Post na Instagram: kawa latte art, cieple swiatlo, widok z gory",
  "Kreacja reklamowa: wyprzedaz letnia -50%, nowoczesny design",
  "Ikona aplikacji: robot AI, gradient fioletowo-niebieski, flat design",
  "Infografika: 5 krokow do produktywnosci, pastelowe kolory",
  "Zdjecie produktowe: elegancki zegarek na ciemnym tle",
];

type GenerateResponse = {
  image?: string;
  text?: string;
  error?: string;
};

export default function GeneratePage() {
  const [prompt, setPrompt] = useState("");
  const [lastPrompt, setLastPrompt] = useState("");
  const [image, setImage] = useState("");
  const [modelText, setModelText] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function generateImage(nextPrompt = prompt.trim()) {
    if (!nextPrompt || isLoading) {
      return;
    }

    setIsLoading(true);
    setError("");
    setImage("");
    setModelText("");
    setLastPrompt(nextPrompt);

    try {
      const response = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: nextPrompt }),
      });
      const data = (await response.json()) as GenerateResponse;

      if (!response.ok || !data.image) {
        throw new Error(data.error || "Nie udalo sie wygenerowac obrazu.");
      }

      setImage(data.image);
      setModelText(data.text ?? "");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Nie udalo sie wygenerowac obrazu.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await generateImage();
  }

  function downloadImage() {
    if (!image) {
      return;
    }

    const link = document.createElement("a");
    link.href = image;
    link.download = "ai-generated.png";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  return (
    <main className="chat-shell">
      <section className="chat-panel generate-panel" aria-label="Generator grafik">
        <header className="chat-header">
          <h1>🎨 Generator grafik AI</h1>
          <p>Opisz co chcesz - AI stworzy obraz w kilka sekund</p>

          <div className="example-questions" aria-label="Przykladowe prompty">
            {examplePrompts.map((item) => (
              <button
                disabled={isLoading}
                key={item}
                onClick={() => setPrompt(item)}
                type="button"
              >
                {item}
              </button>
            ))}
          </div>
        </header>

        <form className="generate-form" onSubmit={handleSubmit}>
          <textarea
            aria-label="Opis obrazu"
            disabled={isLoading}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Opisz obraz ktory chcesz wygenerowac..."
            value={prompt}
          />
          <button disabled={isLoading || prompt.trim().length === 0} type="submit">
            🎨 Generuj
          </button>
        </form>

        <section className="generate-result" aria-live="polite">
          {isLoading && (
            <div className="image-placeholder">Generuje... (5-15 sekund)</div>
          )}

          {error && <div className="generate-error">{error}</div>}

          {image && !isLoading && (
            <>
              <img alt={lastPrompt} className="generated-image" src={image} />
              {modelText && <p className="generated-caption">{modelText}</p>}
              <div className="generate-actions">
                <button onClick={downloadImage} type="button">
                  💾 Pobierz
                </button>
                <button
                  disabled={!lastPrompt || isLoading}
                  onClick={() => generateImage(lastPrompt)}
                  type="button"
                >
                  🔄 Ponownie
                </button>
              </div>
            </>
          )}
        </section>
      </section>
    </main>
  );
}
