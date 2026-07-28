"use client";

import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "../auth-provider";

type RecipeExample = {
  label: string;
  products: [string, string, string, string, string];
  context: string;
};

type SavedRecipe = {
  id: string;
  title: string | null;
  products: string[];
  context: string | null;
  content: string;
  word_count: number;
  created_at: string;
};

const examples: RecipeExample[] = [
  {
    label: "Makaron z lodówki",
    products: ["makaron", "pomidory", "cukinia", "ser feta", "czosnek"],
    context: "Szybki obiad, maksymalnie 30 minut.",
  },
  {
    label: "Kolacja zero waste",
    products: ["ryż", "jajka", "marchew", "groszek", "sos sojowy"],
    context: "Prosto, tanio i bez mięsa.",
  },
  {
    label: "Coś z kurczakiem",
    products: ["kurczak", "ziemniaki", "brokuł", "jogurt", "cytryna"],
    context: "Danie rodzinne, łagodne przyprawy.",
  },
];

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInline(text: string) {
  return text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s)]+)/g).map((part, index) => {
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

function RecipeMarkdown({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let stepNumber = 0;

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
          <h1 key={index}>{content}</h1>
        ) : level === 2 ? (
          <h2 key={index}>{content}</h2>
        ) : (
          <h3 key={index}>{content}</h3>
        ),
      );
      continue;
    }

    const orderedItem = /^\d+\.\s+(.+)$/.exec(line);
    if (orderedItem) {
      stepNumber += 1;
      blocks.push(
        <div className="recipe-step" key={index}>
          <span>{stepNumber}</span>
          <p>{renderInline(orderedItem[1])}</p>
        </div>,
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

  return <div className="recipe-markdown">{blocks}</div>;
}

function recipeTitle(text: string, products: string[]) {
  return /^#\s+(.+)$/m.exec(text)?.[1]?.trim() ?? `Przepis: ${products.join(", ")}`;
}

function exportRecipePdf(title: string, content: string) {
  const printWindow = window.open("", "_blank", "width=900,height=1100");

  if (!printWindow) {
    window.print();
    return;
  }

  const htmlContent = escapeHtml(content)
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^\d+\. (.+)$/gm, "<p class=\"step\">$&</p>")
    .replace(/^- (.+)$/gm, "<p class=\"bullet\">• $1</p>")
    .replace(/\n/g, "<br />");

  printWindow.document.write(`<!doctype html>
<html lang="pl">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { color: #171717; font-family: Arial, sans-serif; line-height: 1.55; padding: 32px; }
    h1 { font-size: 30px; margin: 0 0 18px; }
    h2 { border-top: 1px solid #d7d7d7; font-size: 20px; margin-top: 22px; padding-top: 14px; }
    h3 { font-size: 16px; }
    a { color: #1455b5; }
    .step, .bullet { margin: 8px 0; }
    @page { margin: 18mm; }
  </style>
</head>
<body>${htmlContent}</body>
</html>`);
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => printWindow.print(), 250);
}

export default function PrzepisomatPage() {
  const { getAccessToken } = useAuth();
  const [products, setProducts] = useState(["", "", "", "", ""]);
  const [context, setContext] = useState("");
  const [recipe, setRecipe] = useState("");
  const [error, setError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [savedRecipes, setSavedRecipes] = useState<SavedRecipe[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState<SavedRecipe | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingSaved, setIsLoadingSaved] = useState(false);
  const filledProducts = useMemo(
    () => products.map((product) => product.trim()).filter(Boolean),
    [products],
  );

  async function loadSavedRecipes() {
    setIsLoadingSaved(true);

    try {
      const accessToken = await getAccessToken();
      const response = await fetch("/api/recipes", {
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        recipes?: SavedRecipe[];
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Nie udało się pobrać przepisów.");
      }

      setSavedRecipes(data.recipes ?? []);
      setSelectedRecipe((current) => {
        if (!current) {
          return null;
        }

        return data.recipes?.find((item) => item.id === current.id) ?? null;
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nieznany błąd.");
    } finally {
      setIsLoadingSaved(false);
    }
  }

  useEffect(() => {
    void loadSavedRecipes();
  }, []);

  function updateProduct(index: number, value: string) {
    setProducts((current) =>
      current.map((product, productIndex) =>
        productIndex === index ? value : product,
      ),
    );
  }

  function applyExample(example: RecipeExample) {
    setProducts(example.products);
    setContext(example.context);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (filledProducts.length === 0 || isLoading) {
      return;
    }

    setRecipe("");
    setError("");
    setCopyStatus("");
    setSaveStatus("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/przepisomat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ products: filledProducts, context }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Nie udało się wygenerować przepisu.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        setRecipe((current) => current + decoder.decode(value, { stream: true }));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nieznany błąd.");
    } finally {
      setIsLoading(false);
    }
  }

  async function copyRecipe() {
    if (!recipe.trim()) {
      return;
    }

    await navigator.clipboard.writeText(recipe);
    setCopyStatus("Skopiowano przepis.");
    window.setTimeout(() => setCopyStatus(""), 1800);
  }

  async function saveRecipe() {
    if (filledProducts.length === 0 || !recipe.trim() || isSaving) {
      return;
    }

    setError("");
    setSaveStatus("");
    setIsSaving(true);

    try {
      const accessToken = await getAccessToken();
      const response = await fetch("/api/recipes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ products: filledProducts, context, recipe }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Nie udało się zapisać przepisu.");
      }

      setSaveStatus("Zapisano przepis w bazie.");
      await loadSavedRecipes();
      window.setTimeout(() => setSaveStatus(""), 2200);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nieznany błąd.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="recipe-shell">
      <section className="recipe-panel" aria-label="Przepisomat">
        <header className="recipe-hero">
          <span>Kuchnia zero waste</span>
          <h1>{"\u{1F37D}\u{FE0F}"} Przepisomat</h1>
          <p>Podaj produkty - agent ułoży przepis, żeby nic się nie zmarnowało.</p>
        </header>

        <section className="recipe-form-card">
          <form className="recipe-form" onSubmit={handleSubmit}>
            <div className="recipe-product-grid">
              {products.map((product, index) => (
                <label key={index}>
                  <span>Produkt {index + 1}</span>
                  <input
                    disabled={isLoading}
                    onChange={(event) => updateProduct(index, event.target.value)}
                    placeholder={
                      index === 0
                        ? "Np. makaron"
                        : index === 1
                          ? "Np. pomidory"
                          : index === 2
                            ? "Np. cukinia"
                            : index === 3
                              ? "Np. feta"
                              : "Np. czosnek"
                    }
                    value={product}
                  />
                </label>
              ))}
            </div>

            <label>
              <span>Kontekst</span>
              <textarea
                disabled={isLoading}
                onChange={(event) => setContext(event.target.value)}
                placeholder="Np. szybki obiad, bez mięsa, łagodne przyprawy, 2 porcje..."
                value={context}
              />
            </label>

            <button disabled={filledProducts.length === 0 || isLoading} type="submit">
              <span aria-hidden="true">{"\u{1F958}"}</span>
              {isLoading ? "Gotuję pomysł..." : "Wygeneruj przepis"}
            </button>
          </form>

          <div className="recipe-examples" aria-label="Przykładowe zestawy">
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

        {error && <p className="recipe-error">{error}</p>}

        <section className="recipe-saved-card" aria-label="Zapisane przepisy">
          <div className="recipe-saved-top">
            <div>
              <span>Baza przepisów</span>
              <h2>Zapisane przepisy</h2>
            </div>
            <button
              disabled={isLoadingSaved}
              onClick={() => void loadSavedRecipes()}
              type="button"
            >
              {isLoadingSaved ? "Odświeżam..." : "Odśwież"}
            </button>
          </div>

          {savedRecipes.length === 0 ? (
            <p className="recipe-saved-empty">
              {isLoadingSaved
                ? "Pobieram zapisane przepisy..."
                : "Nie masz jeszcze zapisanych przepisów."}
            </p>
          ) : (
            <div className="recipe-saved-layout">
              <div className="recipe-saved-list">
                {savedRecipes.map((savedRecipe) => (
                  <button
                    className={
                      selectedRecipe?.id === savedRecipe.id ? "active" : ""
                    }
                    key={savedRecipe.id}
                    onClick={() => setSelectedRecipe(savedRecipe)}
                    type="button"
                  >
                    <strong>{savedRecipe.title ?? "Przepis"}</strong>
                    <span>
                      {new Intl.DateTimeFormat("pl-PL", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(savedRecipe.created_at))}
                    </span>
                    <small>{savedRecipe.products.join(", ")}</small>
                  </button>
                ))}
              </div>

              <article className="recipe-saved-preview">
                {selectedRecipe ? (
                  <>
                    <div className="recipe-saved-preview-top">
                      <div>
                        <span>Podgląd</span>
                        <h3>{selectedRecipe.title ?? "Przepis"}</h3>
                      </div>
                      <div className="recipe-saved-actions">
                        <button
                          onClick={() => {
                            void navigator.clipboard.writeText(selectedRecipe.content);
                          }}
                          type="button"
                        >
                          Kopiuj
                        </button>
                        <button
                          onClick={() =>
                            exportRecipePdf(
                              selectedRecipe.title ?? "Przepis",
                              selectedRecipe.content,
                            )
                          }
                          type="button"
                        >
                          Eksport PDF
                        </button>
                      </div>
                    </div>
                    <RecipeMarkdown text={selectedRecipe.content} />
                  </>
                ) : (
                  <p>Wybierz przepis z listy, żeby zobaczyć podgląd.</p>
                )}
              </article>
            </div>
          )}
        </section>

        {(isLoading || recipe) && (
          <section className="recipe-result-card" aria-live="polite">
            <div className="recipe-result-top">
              <div>
                <span>Wynik</span>
                <h2>Propozycja dania</h2>
              </div>
              <div className="recipe-actions">
                <button disabled={!recipe.trim()} onClick={copyRecipe} type="button">
                  {"\u{1F4CB}"} Kopiuj
                </button>
                <button
                  disabled={!recipe.trim() || isSaving}
                  onClick={saveRecipe}
                  type="button"
                >
                  {"\u{1F4BE}"} {isSaving ? "Zapisuję..." : "Zapisz"}
                </button>
                <button
                  disabled={!recipe.trim()}
                  onClick={() =>
                    exportRecipePdf(recipeTitle(recipe, filledProducts), recipe)
                  }
                  type="button"
                >
                  Eksport PDF
                </button>
              </div>
            </div>

            {copyStatus && <p className="recipe-copy-status">{copyStatus}</p>}
            {saveStatus && <p className="recipe-copy-status">{saveStatus}</p>}

            {recipe ? (
              <RecipeMarkdown text={recipe} />
            ) : (
              <div className="recipe-loading">
                Agent dobiera składniki, proporcje i kolejność przygotowania...
              </div>
            )}
          </section>
        )}
      </section>
    </main>
  );
}
