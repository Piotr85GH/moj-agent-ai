import { google } from "@ai-sdk/google";
import { stepCountIs, streamText, tool } from "ai";
import { z } from "zod";

const enableSearchGrounding = process.env.ENABLE_SEARCH_GROUNDING === "true";

if (enableSearchGrounding) {
  console.warn(
    "UWAGA: Search Grounding jest WLACZONY. " +
      "To jest najdrozsza funkcja API ($14/1000 zapytan). " +
      "Uzywaj TYLKO do testow. Wylacz po testach usuwajac ENABLE_SEARCH_GROUNDING z .env.local.",
  );
}

export const maxDuration = 60;

const systemPrompt = `
Jesteś kreatywnym kucharzem i doradcą zero waste.
Uzytkownik podaje do pieciu produktow, a Ty tworzysz najlepszy przepis,
ktory sensownie wykorzystuje te składniki.

FORMAT ODPOWIEDZI:

# [Nazwa dania]

## Dlaczego ten przepis
[2-3 zdania: dlaczego te produkty pasuja do siebie i jak ograniczasz marnowanie.]

## Składniki
- [produkt od użytkownika] - [ilość]
- [dodatkowe podstawowe składniki, np. sól, pieprz, oliwa]

## Przygotowanie
1. [krok]
2. [krok]
3. [krok]

## Czas i porcje
- Czas: [liczba] minut
- Porcje: [liczba]
- Trudność: [łatwe/średnie]

## Wskazówki
- [jak podmienić składnik]
- [jak przechowac resztki]
- [co podać obok]

## Źródła
- [Nazwa źródła](https://adres-url)

ZASADY:
- Pisz po polsku.
- Wszystkie nazwy sekcji i etykiety pisz z polskimi znakami: Składniki, Wskazówki, Źródła, Trudność.
- Użyj wszystkich produktów podanych przez użytkownika, chyba że produkt jest niejadalny lub sprzeczny z kontekstem.
- Jeśli brakuje ważnego składnika, zaproponuj najprostszy zamiennik z typowej kuchni domowej.
- W sekcji Źródła dodaj 1-3 linki do inspiracji kulinarnej lub wiedzy o składnikach. Każde źródło musi mieć URL.
- Jeśli nie użyłeś Google Search, podaj linki do ogólnych, wiarygodnych stron kulinarnych lub encyklopedycznych pasujących do dania.
- Nie dawaj porad medycznych. Przy alergiach jasno zaznacz ostrożność.
- Nie dodawaj wstępu poza formatem odpowiedzi.
`;

function normalizeProducts(input: unknown) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter((product): product is string => typeof product === "string")
    .map((product) => product.trim())
    .filter(Boolean)
    .slice(0, 5);
}

function calculateExpression(expression: string) {
  if (/(import|require|eval|process)/i.test(expression)) {
    return "Wyrazenie zawiera niedozwolone znaki.";
  }

  if (!/^[\d\s+\-*/().,%]+$/.test(expression)) {
    return "Wyrazenie zawiera niedozwolone znaki.";
  }

  try {
    const normalized = expression.replace(/,/g, ".").replace(/%/g, "/100");
    const result = Function(`"use strict"; return (${normalized});`)();

    if (typeof result !== "number" || !Number.isFinite(result)) {
      return `Nie moge obliczyc: ${expression}`;
    }

    return result;
  } catch {
    return `Nie moge obliczyc: ${expression}`;
  }
}

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError;
}

function connectionError(error: unknown) {
  if (error instanceof Error && error.name === "AbortError") {
    return "Timeout - serwer nie odpowiedzial w 5 sekund. Sprobuj ponownie.";
  }

  return `Blad polaczenia: ${
    error instanceof Error ? error.message : "nieznany blad"
  }`;
}

async function searchWikipedia(query: string, language: string) {
  const lang = language.toLowerCase().replace(/[^a-z-]/g, "") || "pl";
  const url = `https://${lang}.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(
    query,
  )}&limit=5`;
  let response: Response;

  try {
    response = await fetchWithTimeout(url, {
      headers: {
        "api-user-agent": "MojAgentPrzepisomat/1.0 (local workshop)",
      },
    });
  } catch (error) {
    return { query, error: connectionError(error), source: url };
  }

  if (!response.ok) {
    return {
      query,
      error: `API zwrocilo blad ${response.status}. Sprawdz parametry.`,
      source: url,
    };
  }

  const data = (await response.json()) as {
    pages?: Array<{
      title: string;
      description?: string;
      excerpt?: string;
      key: string;
    }>;
  };

  return {
    query,
    language: lang,
    results:
      data.pages?.map((page) => ({
        title: page.title,
        description: page.description,
        excerpt: page.excerpt?.replace(/<\/?span[^>]*>/g, ""),
        url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(page.key)}`,
      })) ?? [],
    source: url,
  };
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    products?: unknown;
    context?: unknown;
  };
  const products = normalizeProducts(body.products);
  const context = typeof body.context === "string" ? body.context.trim() : "";

  if (products.length === 0) {
    return Response.json(
      { error: "Podaj przynajmniej jeden produkt." },
      { status: 400 },
    );
  }

  const result = streamText({
    model: google("gemini-3.1-flash-lite"),
    system: systemPrompt,
    prompt: `Produkty: ${products.join(", ")}.${
      context ? `\nKontekst uzytkownika: ${context}` : ""
    }`,
    stopWhen: stepCountIs(6),
    tools: {
      calculator: tool({
        description:
          "Wykonuje proste obliczenia kulinarne: proporcje, porcje, czas i przeliczenia.",
        inputSchema: z.object({
          expression: z.string().describe("Wyrazenie, np. 250 * 1.5."),
        }),
        execute: async ({ expression }) => ({
          expression,
          result: calculateExpression(expression),
        }),
      }),
      searchWikipedia: tool({
        description:
          "Wyszukuje hasla w Wikipedii i zwraca tytuly, opisy oraz linki. Uzywaj do zrodel o skladnikach lub technikach.",
        inputSchema: z.object({
          query: z.string().describe("Szukana fraza, np. risotto albo cukinia."),
          language: z.string().default("pl").describe("Kod jezyka Wikipedii."),
        }),
        execute: async ({ query, language }) => searchWikipedia(query, language),
      }),
      ...(enableSearchGrounding
        ? { google_search: google.tools.googleSearch({}) }
        : {}),
    },
  });

  return result.toTextStreamResponse({
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
