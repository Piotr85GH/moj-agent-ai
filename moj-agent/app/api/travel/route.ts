import { google } from "@ai-sdk/google";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  toUIMessageStream,
  tool,
  type ModelMessage,
  type TextStreamPart,
  type UIMessage,
} from "ai";
import { z } from "zod";

export const maxDuration = 60;

type Note = {
  id: string;
  createdAt: string;
  title: string;
  content: string;
};

const travelSystemPrompt = `
Jestes profesjonalnym asystentem podrozy. Gdy uzytkownik opisuje planowana podroz, AUTONOMICZNIE zbierasz wszystkie potrzebne informacje.

## TWOJ PROCES:

Dla kazdej podrozy MUSISZ sprawdzic:
1. 🌤️ Pogode w miejscu docelowym (getWeather)
2. 💶 Kurs lokalnej waluty (getExchangeRate)
3. 📅 Dni wolne/swieta w kraju docelowym (getHolidays)
4. 📖 Informacje o miescie (searchWikipedia)
5. 🧮 Przeliczenie budzetu jesli podany (calculator)

Jesli uzytkownik prosi "porownaj X i Y", sprawdz pogode, waluty, swieta i informacje o OBU miastach, a potem wygeneruj tabele porownawcza.
Jesli uzytkownik nie podal roku, uzyj aktualnego roku z currentDateTime zamiast zgadywac.

WAZNE:
- Narzedzia getWeather, getExchangeRate, getHolidays, searchWikipedia i calculator SA DOSTEPNE. Uzywaj ich bez informowania, ze sa niedostepne.
- Jesli narzedzie zwroci obiekt z polem error, dopiero wtedy poinformuj o problemie.
- Nie zastepuj getWeather ani getExchangeRate wyszukiwarka, jesli nie dostales bledu z tych narzedzi.

Po zebraniu danych, wygeneruj GOTOWY PLAN w formacie:

## 🗺️ Plan podrozy: [MIASTO]

### 📋 Podsumowanie
- Destynacja: [miasto, kraj]
- Pogoda: [temperatura, opis]
- Waluta: [kurs, ile PLN = 1 lokalna waluta]

### 🌤️ Pogoda
[Szczegoly pogody + co spakowac]

### 💰 Budzet
[Przeliczenia walutowe, orientacyjne koszty]

### 📅 Wazne daty
[Swieta, dni wolne - co moze byc zamkniete?]

### 🏛️ Co zobaczyc
[Na podstawie Wikipedii i Google - glowne atrakcje]

### ✅ Checklist przed wyjazdem
[Lista rzeczy do zrobienia/spakowania]

## ZASADY:
- Uzywaj PRAWDZIWYCH danych z narzedzi - nie zgaduj.
- Jesli narzedzie zwroci blad - poinformuj i kontynuuj.
- Badz praktyczny - konkretne rady, nie ogolniki.
- Podawaj ceny w PLN i po przeliczeniu na walute lokalna, jesli budzet jest podany.
- Podawaj zrodla: Open-Meteo, Frankfurter, Nager.Date, Wikipedia i przeczytane strony WWW.

## OBSLUGA BLEDOW:
- Jesli narzedzie zwroci blad - NIE powtarzaj tego samego wywolania.
- Zamiast tego poinformuj uzytkownika i zaproponuj alternatywe.
- Przyklad: jesli pogoda nie dziala, napisz: "Nie udalo sie sprawdzic pogody w X. Moge poszukac w Google lub sprobowac innego miasta."
- NIGDY nie wywoluj tego samego narzedzia z tymi samymi argumentami dwa razy z rzedu.
- Jesli po 3 nieudanych probach nie masz danych, powiedz wprost czego brakuje.
`;

const cityHints: Record<
  string,
  { countryCode: string; currency: string; country: string; wikiLanguage: string }
> = {
  barcelona: { countryCode: "ES", currency: "EUR", country: "Hiszpania", wikiLanguage: "pl" },
  berlin: { countryCode: "DE", currency: "EUR", country: "Niemcy", wikiLanguage: "pl" },
  lizbona: { countryCode: "PT", currency: "EUR", country: "Portugalia", wikiLanguage: "pl" },
  london: { countryCode: "GB", currency: "GBP", country: "Wielka Brytania", wikiLanguage: "pl" },
  londyn: { countryCode: "GB", currency: "GBP", country: "Wielka Brytania", wikiLanguage: "pl" },
  monopoli: { countryCode: "IT", currency: "EUR", country: "Wlochy", wikiLanguage: "pl" },
  paris: { countryCode: "FR", currency: "EUR", country: "Francja", wikiLanguage: "pl" },
  paryz: { countryCode: "FR", currency: "EUR", country: "Francja", wikiLanguage: "pl" },
  praga: { countryCode: "CZ", currency: "CZK", country: "Czechy", wikiLanguage: "pl" },
  tokio: { countryCode: "JP", currency: "JPY", country: "Japonia", wikiLanguage: "pl" },
  tokyo: { countryCode: "JP", currency: "JPY", country: "Japonia", wikiLanguage: "pl" },
  wieden: { countryCode: "AT", currency: "EUR", country: "Austria", wikiLanguage: "pl" },
  warszawa: { countryCode: "PL", currency: "PLN", country: "Polska", wikiLanguage: "pl" },
};

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
    .slice(0, 4000);
}

async function readWebPage(url: string) {
  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; MojTravelAgent/1.0; +https://localhost)",
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

function weatherDescription(code: number) {
  const descriptions: Record<number, string> = {
    0: "bezchmurnie",
    1: "glownie bezchmurnie",
    2: "czesciowe zachmurzenie",
    3: "pochmurno",
    45: "mgla",
    48: "szron/mgla osadzajaca",
    51: "lekka mzawka",
    53: "umiarkowana mzawka",
    55: "silna mzawka",
    61: "slaby deszcz",
    63: "umiarkowany deszcz",
    65: "silny deszcz",
    71: "slaby snieg",
    73: "umiarkowany snieg",
    75: "silny snieg",
    80: "przelotny slaby deszcz",
    81: "przelotny deszcz",
    82: "silny przelotny deszcz",
    95: "burza",
  };

  return descriptions[code] ?? `kod pogody ${code}`;
}

async function getWeather(city: string) {
  if (!city.trim()) {
    return { error: "Podaj nazwe miasta." };
  }

  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    city,
  )}&count=1&language=pl&format=json`;
  let geoResponse: Response;

  try {
    geoResponse = await fetchWithTimeout(geoUrl);
  } catch (error) {
    return { city, error: connectionError(error), source: geoUrl };
  }

  if (!geoResponse.ok) {
    return {
      city,
      error: `API zwrocilo blad ${geoResponse.status}. Sprawdz parametry.`,
      source: geoUrl,
    };
  }

  const geoData = (await geoResponse.json()) as {
    results?: Array<{
      name: string;
      country?: string;
      latitude: number;
      longitude: number;
    }>;
  };
  const place = geoData.results?.[0];

  if (!place) {
    return {
      city,
      error: `Nie znalazlem miasta ${city}. Sprawdz pisownie.`,
      source: geoUrl,
    };
  }

  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation&timezone=auto`;
  let weatherResponse: Response;

  try {
    weatherResponse = await fetchWithTimeout(weatherUrl);
  } catch (error) {
    return { city, error: connectionError(error), source: weatherUrl };
  }

  if (!weatherResponse.ok) {
    return {
      city,
      error: `API zwrocilo blad ${weatherResponse.status}. Sprawdz parametry.`,
      source: weatherUrl,
    };
  }

  const weatherData = (await weatherResponse.json()) as {
    current?: {
      time: string;
      temperature_2m: number;
      apparent_temperature: number;
      weather_code: number;
      wind_speed_10m: number;
      precipitation: number;
    };
  };
  const current = weatherData.current;

  if (!current) {
    return { city, error: "API pogody nie zwrocilo danych current.", source: weatherUrl };
  }

  return {
    city: place.name,
    country: place.country,
    time: current.time,
    temperatureC: current.temperature_2m,
    apparentTemperatureC: current.apparent_temperature,
    precipitationMm: current.precipitation,
    windKmh: current.wind_speed_10m,
    description: weatherDescription(current.weather_code),
    source: weatherUrl,
  };
}

async function getExchangeRate(from: string, to: string, amount = 1) {
  const normalizedFrom = from.toUpperCase();
  const normalizedTo = to.toUpperCase();

  if (!/^[A-Z]{3}$/.test(normalizedFrom) || !/^[A-Z]{3}$/.test(normalizedTo)) {
    return {
      from: normalizedFrom,
      to: normalizedTo,
      amount,
      error: "Podaj 3-literowy kod waluty (np. EUR, USD).",
    };
  }

  if (normalizedFrom === normalizedTo) {
    return {
      amount,
      from: normalizedFrom,
      to: normalizedTo,
      converted: amount,
      rate: 1,
      date: new Date().toISOString().slice(0, 10),
      source: "same-currency",
    };
  }

  const url = `https://api.frankfurter.app/latest?amount=${amount}&from=${normalizedFrom}&to=${normalizedTo}`;
  let response: Response;

  try {
    response = await fetchWithTimeout(url);
  } catch (error) {
    return { from: normalizedFrom, to: normalizedTo, amount, error: connectionError(error), source: url };
  }

  if (!response.ok) {
    return {
      from: normalizedFrom,
      to: normalizedTo,
      amount,
      error: `Waluta ${normalizedFrom === "PLN" ? normalizedTo : normalizedFrom} nie jest w tabeli NBP. Popularne: EUR, USD, GBP, CHF.`,
      source: url,
    };
  }

  const data = (await response.json()) as {
    amount: number;
    base: string;
    date: string;
    rates: Record<string, number>;
  };

  return {
    amount: data.amount,
    from: data.base,
    to: normalizedTo,
    converted: data.rates[normalizedTo],
    rate: data.rates[normalizedTo] / data.amount,
    date: data.date,
    source: url,
  };
}

async function getHolidays(countryCode: string, year: number) {
  const normalizedCountry = countryCode.toUpperCase();

  if (!/^[A-Z]{2}$/.test(normalizedCountry)) {
    return {
      countryCode: normalizedCountry,
      year,
      error: "Podaj 2-literowy kod kraju (np. PL, DE, US).",
    };
  }

  const url = `https://date.nager.at/api/v3/PublicHolidays/${year}/${normalizedCountry}`;
  let response: Response;

  try {
    response = await fetchWithTimeout(url);
  } catch (error) {
    return { countryCode: normalizedCountry, year, error: connectionError(error), source: url };
  }

  if (!response.ok) {
    return {
      countryCode: normalizedCountry,
      year,
      error: `Nie znalazlem swiat dla kraju ${normalizedCountry}. Popularne: PL, DE, US, GB, FR.`,
      source: url,
    };
  }

  return {
    countryCode: normalizedCountry,
    year,
    holidays: await response.json(),
    source: url,
  };
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
        "api-user-agent": "MojTravelAgent/1.0 (local workshop)",
      },
    });
  } catch (error) {
    return { query, error: connectionError(error), source: url };
  }

  if (!response.ok) {
    const fallbackUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      query,
    )}&format=json&origin=*&srlimit=5`;

    try {
      const fallbackResponse = await fetchWithTimeout(fallbackUrl, {
        headers: {
          "api-user-agent": "MojTravelAgent/1.0 (local workshop)",
        },
      });

      if (!fallbackResponse.ok) {
        return {
          query,
          error: `API zwrocilo blad ${response.status}. Sprawdz parametry.`,
          source: url,
        };
      }

      const fallbackData = (await fallbackResponse.json()) as {
        query?: {
          search?: Array<{
            title: string;
            snippet?: string;
          }>;
        };
      };

      return {
        query,
        language: lang,
        results:
          fallbackData.query?.search?.map((page) => ({
            title: page.title,
            excerpt: page.snippet?.replace(/<[^>]+>/g, ""),
            url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(
              page.title.replace(/\s+/g, "_"),
            )}`,
          })) ?? [],
        source: fallbackUrl,
      };
    } catch (error) {
      return { query, error: connectionError(error), source: fallbackUrl };
    }
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

function getNotesStore() {
  const store = globalThis as typeof globalThis & { __travelNotes?: Note[] };
  store.__travelNotes ??= [];
  return store.__travelNotes;
}

function streamTravelText({
  messages,
  system,
}: {
  messages: ModelMessage[];
  system: string;
}) {
  let reader: ReadableStreamDefaultReader<TextStreamPart<any>> | undefined;

  return new ReadableStream<TextStreamPart<any>>({
    async pull(controller) {
      if (!reader) {
        const result = streamText({
          model: google("gemini-3.1-flash-lite"),
          system,
          messages,
          stopWhen: stepCountIs(3),
          tools: {
            calculator: tool({
              description:
                "Wykonuje obliczenia matematyczne, procenty, budzety i przeliczenia.",
              inputSchema: z.object({
                expression: z.string().describe("Wyrazenie, np. 3000 / 4.25."),
              }),
              execute: async ({ expression }) => ({
                expression,
                result: calculateExpression(expression),
              }),
            }),
            currentDateTime: tool({
              description: "Zwraca aktualna date i czas w Europe/Warsaw.",
              inputSchema: z.object({}),
              execute: async () => ({
                iso: new Date().toISOString(),
                local: new Intl.DateTimeFormat("pl-PL", {
                  dateStyle: "full",
                  timeStyle: "medium",
                  timeZone: "Europe/Warsaw",
                }).format(new Date()),
              }),
            }),
            getDestinationInfo: tool({
              description:
                "Podpowiada kraj, kod kraju, walute i jezyk Wikipedii dla popularnego miasta.",
              inputSchema: z.object({
                city: z.string().describe("Miasto docelowe, np. Berlin."),
              }),
              execute: async ({ city }) => {
                const key = city
                  .normalize("NFD")
                  .replace(/[\u0300-\u036f]/g, "")
                  .toLowerCase();

                return cityHints[key] ?? {
                  city,
                  warning:
                    "Brak podpowiedzi. Ustal kraj i walute przez Wikipedia albo Google Search.",
                };
              },
            }),
            getWeather: tool({
              description: "Pobiera aktualna pogode dla miasta z Open-Meteo.",
              inputSchema: z.object({
                city: z.string().describe("Nazwa miasta, np. Berlin."),
              }),
              execute: async ({ city }) => getWeather(city),
            }),
            getExchangeRate: tool({
              description:
                "Pobiera kurs i przelicza kwote miedzy walutami przez Frankfurter API.",
              inputSchema: z.object({
                from: z.string().describe("Waluta zrodlowa, np. PLN."),
                to: z.string().describe("Waluta docelowa, np. EUR."),
                amount: z.number().positive().optional().describe("Kwota do przeliczenia."),
              }),
              execute: async ({ from, to, amount }) =>
                getExchangeRate(from, to, amount ?? 1),
            }),
            getHolidays: tool({
              description: "Pobiera swieta publiczne dla kraju i roku z Nager.Date.",
              inputSchema: z.object({
                countryCode: z.string().describe("Kod kraju, np. DE, FR, GB, JP."),
                year: z
                  .number()
                  .int()
                  .min(2000)
                  .max(2100)
                  .default(new Date().getFullYear()),
              }),
              execute: async ({ countryCode, year }) =>
                getHolidays(countryCode, year),
            }),
            searchWikipedia: tool({
              description:
                "Wyszukuje miasto, atrakcje albo zjawisko w Wikipedii.",
              inputSchema: z.object({
                query: z.string().describe("Szukana fraza, np. Berlin atrakcje."),
                language: z.string().default("pl").describe("Kod jezyka Wikipedii."),
              }),
              execute: async ({ query, language }) => searchWikipedia(query, language),
            }),
            readWebPage: tool({
              description: "Czyta konkretna strone WWW podana jako URL.",
              inputSchema: z.object({
                url: z.string().url().describe("Pelny adres URL strony."),
              }),
              execute: async ({ url }) => readWebPage(url),
            }),
            saveNote: tool({
              description: "Zapisuje notatke z planu podrozy w pamieci procesu.",
              inputSchema: z.object({
                title: z.string().describe("Krotki tytul notatki."),
                content: z.string().describe("Tresc notatki."),
              }),
              execute: async ({ title, content }) => {
                const note = {
                  id: crypto.randomUUID(),
                  createdAt: new Date().toISOString(),
                  title,
                  content,
                };
                getNotesStore().push(note);
                return { saved: true, note };
              },
            }),
            getNotes: tool({
              description: "Zwraca zapisane notatki podrozne.",
              inputSchema: z.object({}),
              execute: async () => ({ notes: getNotesStore() }),
            }),
          },
        });

        reader = result.stream.getReader();
      }

      try {
        const { done, value } = await reader.read();

        if (done) {
          controller.close();
          return;
        }

        controller.enqueue(value);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      await reader?.cancel().catch(() => undefined);
    },
  });
}

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();
  const stream = streamTravelText({
    system: travelSystemPrompt,
    messages: await convertToModelMessages(messages),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream,
      originalMessages: messages,
      sendSources: true,
    }),
  });
}
