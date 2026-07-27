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
Jestes analitykiem konkurencji. Gdy uzytkownik poda nazwy firm,
AUTONOMICZNIE zbierasz informacje i porownujesz je.

## TWOJ PROCES:
1. Dla KAZDEJ firmy: szukaj informacji (Google, Wikipedia, strony firmowe).
2. Zbierz: opis, branza, wielkosc, produkty, ceny, mocne i slabe strony.
3. Stworz tabele porownawcza.
4. Napisz rekomendacje w kontekscie potrzeb uzytkownika.

## FORMAT:

# Analiza konkurencji

## Porownanie

| Aspekt | [Firma 1] | [Firma 2] | [Firma 3] |
|--------|-----------|-----------|-----------|
| Branza | ... | ... | ... |
| Wielkosc | ... | ... | ... |
| Glowny produkt | ... | ... | ... |
| Mocne strony | ... | ... | ... |
| Slabe strony | ... | ... | ... |
| Ceny (orientacyjne) | ... | ... | ... |

## Szczegolowa analiza
[Rozwiniecie dla kazdej firmy - 3-4 zdania]

## Rekomendacja
[Ktora firma jest najlepsza i dlaczego - w kontekscie uzytkownika]

## Zrodla
[Linki do stron firmowych i artykulow]

ZASADY:
- Uzywaj prawdziwych danych z narzedzi: Google Search, Wikipedia lub readWebPage.
- Gdy Google Search jest niedostepny, uzyj Wikipedia i konkretnych URL podanych przez uzytkownika; nie udawaj, ze wykonales Google Search.
- Podawaj zrodla przy kazdym waznym fakcie.
- Przy cenach oznacz walute, zakres i date lub napisz, ze cena wymaga weryfikacji.
- Nie wymyslaj danych. Jesli nie masz pewnej informacji, oznacz ja jako "do weryfikacji".
`;

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

function extractReadableText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 5000);
}

async function readWebPage(url: string) {
  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; MojAgentCompetitor/1.0; +https://localhost)",
      },
    });

    if (!response.ok) {
      return {
        url,
        error: `API zwrocilo blad ${response.status}. Sprawdz parametry.`,
      };
    }

    return {
      url,
      source: "readWebPage",
      text:
        extractReadableText(await response.text()) ||
        "Strona zostala pobrana, ale nie udalo sie wyodrebnic czytelnego tekstu.",
    };
  } catch (error) {
    return {
      url,
      error: connectionError(error),
    };
  }
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
        "api-user-agent": "MojAgentCompetitor/1.0 (local workshop)",
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

function normalizeCompanies(input: unknown) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter((company): company is string => typeof company === "string")
    .map((company) => company.trim())
    .filter(Boolean)
    .slice(0, 3);
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    companies?: unknown;
    context?: unknown;
  };
  const companies = normalizeCompanies(body.companies);
  const context = typeof body.context === "string" ? body.context.trim() : "";

  if (companies.length < 2) {
    return Response.json(
      { error: "Podaj co najmniej dwie firmy do porownania." },
      { status: 400 },
    );
  }

  const result = streamText({
    model: google("gemini-3.1-flash-lite"),
    system: systemPrompt,
    prompt: `Porownaj firmy: ${companies.join(", ")}.${
      context ? `\nKontekst uzytkownika: ${context}` : ""
    }`,
    stopWhen: stepCountIs(10),
    tools: {
      readWebPage: tool({
        description:
          "Pobiera i czyta tekst strony WWW. Uzywaj dla konkretnych URL.",
        inputSchema: z.object({
          url: z.string().url().describe("Pelny adres URL strony."),
        }),
        execute: async ({ url }) => readWebPage(url),
      }),
      searchWikipedia: tool({
        description:
          "Wyszukuje hasla w Wikipedii i zwraca tytuly, opisy oraz linki.",
        inputSchema: z.object({
          query: z.string().describe("Szukana fraza."),
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
