"use client";

import { type FormEvent, useMemo, useState } from "react";

type SocialExample = {
  label: string;
  topic: string;
  context: string;
};

type PlatformPost = {
  key: "linkedin" | "twitter" | "instagram";
  label: string;
  limit: string;
  content: string;
};

const examples: SocialExample[] = [
  {
    label: "AI w małej firmie",
    topic: "Jak mała firma może zacząć korzystać z AI bez dużego budżetu",
    context: "Ton ekspercki, ale prosty. Odbiorcy: właściciele małych firm.",
  },
  {
    label: "Nowy produkt SaaS",
    topic: "Premiera aplikacji SaaS do automatyzacji raportów sprzedażowych",
    context: "Ton energiczny i konkretny. Cel: zachęcić do zapisów na demo.",
  },
  {
    label: "Kulisy pracy",
    topic: "Czego nauczył nas pierwszy miesiąc pracy z agentami AI",
    context: "Ton ludzki, szczery, lekko edukacyjny.",
  },
];

const platformMeta = [
  { key: "linkedin", label: "LinkedIn", limit: "900-1300 znaków" },
  { key: "twitter", label: "Twitter/X", limit: "do 280 znaków" },
  { key: "instagram", label: "Instagram", limit: "700-1100 znaków" },
] as const;

function splitPosts(text: string): PlatformPost[] {
  return platformMeta.map((platform, index) => {
    const current = new RegExp(`##\\s*${platform.label.replace("/", "\\/")}\\s*\\n`, "i");
    const nextPlatform = platformMeta[index + 1];
    const next = nextPlatform
      ? new RegExp(`\\n##\\s*${nextPlatform.label.replace("/", "\\/")}\\s*\\n`, "i")
      : null;
    const start = text.search(current);

    if (start === -1) {
      return { ...platform, content: "" };
    }

    const afterHeading = text.slice(start).replace(current, "");
    const nextMatch = next ? afterHeading.search(next) : -1;
    const content =
      nextMatch === -1 ? afterHeading.trim() : afterHeading.slice(0, nextMatch).trim();

    return { ...platform, content };
  });
}

function cleanPostForCopy(label: string, content: string) {
  return `${label}\n\n${content}`.trim();
}

export default function SocialPage() {
  const [topic, setTopic] = useState("");
  const [context, setContext] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const posts = useMemo(() => splitPosts(result), [result]);
  const allPosts = posts
    .map((post) => cleanPostForCopy(post.label, post.content))
    .filter(Boolean)
    .join("\n\n---\n\n");

  function applyExample(example: SocialExample) {
    setTopic(example.topic);
    setContext(example.context);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!topic.trim() || isLoading) {
      return;
    }

    setResult("");
    setError("");
    setCopyStatus("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, context }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Nie udało się wygenerować postów.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        setResult((current) => current + decoder.decode(value, { stream: true }));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nieznany błąd.");
    } finally {
      setIsLoading(false);
    }
  }

  async function copyText(label: string, text: string) {
    if (!text.trim()) {
      return;
    }

    await navigator.clipboard.writeText(text);
    setCopyStatus(`Skopiowano: ${label}.`);
    window.setTimeout(() => setCopyStatus(""), 1800);
  }

  return (
    <main className="social-shell">
      <section className="social-panel" aria-label="Generator postów social media">
        <header className="social-hero">
          <span>Social media agent</span>
          <h1>{"\u{1F4F1}"} Generator postów</h1>
          <p>Podaj temat - agent przygotuje wersje na LinkedIn, Twitter/X i Instagram.</p>
        </header>

        <section className="social-form-card">
          <form className="social-form" onSubmit={handleSubmit}>
            <label htmlFor="social-topic">
              <span>Temat posta</span>
              <input
                disabled={isLoading}
                id="social-topic"
                onChange={(event) => setTopic(event.target.value)}
                placeholder="Np. Jak AI pomaga oszczędzać czas w małej firmie..."
                value={topic}
              />
            </label>

            <label htmlFor="social-context">
              <span>Kontekst lub ton</span>
              <textarea
                disabled={isLoading}
                id="social-context"
                onChange={(event) => setContext(event.target.value)}
                placeholder="Np. Ton ekspercki, prosty język, odbiorcy: właściciele firm..."
                value={context}
              />
            </label>

            <button disabled={isLoading || topic.trim().length === 0} type="submit">
              <span aria-hidden="true">{"\u{2728}"}</span>
              {isLoading ? "Piszę posty..." : "Generuj posty"}
            </button>
          </form>

          <div className="social-examples" aria-label="Przykładowe tematy">
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

        {error && <p className="social-error">{error}</p>}

        {(isLoading || result) && (
          <section className="social-result-card" aria-live="polite">
            <div className="social-result-top">
              <div>
                <span>Wynik</span>
                <h2>Gotowe wersje postów</h2>
              </div>
              <button
                disabled={!allPosts.trim()}
                onClick={() => copyText("wszystkie posty", allPosts)}
                type="button"
              >
                {"\u{1F4CB}"} Kopiuj wszystko
              </button>
            </div>

            {copyStatus && <p className="social-copy-status">{copyStatus}</p>}

            <div className="social-post-grid">
              {posts.map((post) => (
                <article className={`social-post-card ${post.key}`} key={post.key}>
                  <div className="social-post-top">
                    <div>
                      <span>{post.limit}</span>
                      <h3>{post.label}</h3>
                    </div>
                    <button
                      disabled={!post.content.trim()}
                      onClick={() =>
                        copyText(post.label, cleanPostForCopy(post.label, post.content))
                      }
                      type="button"
                    >
                      Kopiuj
                    </button>
                  </div>
                  <p>
                    {post.content ||
                      (isLoading ? "Agent pisze wersję posta..." : "Brak treści.")}
                  </p>
                </article>
              ))}
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
