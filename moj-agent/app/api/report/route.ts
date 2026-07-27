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

const today = new Intl.DateTimeFormat("pl-PL", {
  dateStyle: "long",
  timeZone: "Europe/Warsaw",
}).format(new Date());

const systemPrompt = `
Jestes profesjonalnym analitykiem biznesowym. Gdy uzytkownik poda temat,
AUTONOMICZNIE zbierasz informacje i piszesz raport.

Dzisiejsza data: ${today}

## TWOJ PROCES:
1. Przeanalizuj temat - co trzeba zbadac?
2. Szukaj danych: Google Search, Wikipedia, strony branzowe.
3. Zbierz fakty, liczby, statystyki.
4. Napisz raport w profesjonalnym formacie.

## FORMAT RAPORTU:

# Raport: [TEMAT]
Data: ${today}
Autor: Agent AI

## Streszczenie (Executive Summary)
[3-4 zdania - kluczowe wnioski]

## 1. Wprowadzenie
[Kontekst, dlaczego ten temat jest wazny]

## 2. Kluczowe dane i fakty
[Wylistowane punkty z danymi - ze źródłami]

## 3. Analiza
[Interpretacja danych, trendy, porownania]

## 4. Wnioski i rekomendacje
[Co z tego wynika? Co robic?]

## Źródła
[Lista użytych źródeł z linkami]

ZASADY:
- Uzywaj prawdziwych danych z narzedzi: Google Search, Wikipedia lub readWebPage.
- Gdy Google Search jest niedostepny, uzyj Wikipedia i konkretnych URL podanych przez uzytkownika; nie udawaj, ze wykonales Google Search.
- Podawaj źródła przy każdym ważnym fakcie.
- Badz konkretny: liczby, daty, nazwy.
- Raport powinien miec 500-1000 slow.
- Nie wymyslaj statystyk - szukaj albo jasno oznacz brak danych.
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
          "Mozilla/5.0 (compatible; MojAgentReport/1.0; +https://localhost)",
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
        "api-user-agent": "MojAgentReport/1.0 (local workshop)",
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
  const body = (await req.json().catch(() => ({}))) as { topic?: unknown };
  const topic = typeof body.topic === "string" ? body.topic.trim() : "";

  if (!topic) {
    return Response.json(
      { error: "Przeslij JSON w formacie { topic: string }." },
      { status: 400 },
    );
  }

  const result = streamText({
    model: google("gemini-3.1-flash-lite"),
    system: systemPrompt,
    prompt: `Napisz raport biznesowy na temat: ${topic}`,
    stopWhen: stepCountIs(8),
    tools: {
      calculator: tool({
        description:
          "Wykonuje obliczenia matematyczne, procenty, roznice i proste przeliczenia.",
        inputSchema: z.object({
          expression: z.string().describe("Wyrazenie, np. 1250 * 0.23."),
        }),
        execute: async ({ expression }) => ({
          expression,
          result: calculateExpression(expression),
        }),
      }),
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
