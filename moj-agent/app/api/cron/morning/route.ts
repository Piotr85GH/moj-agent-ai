import { google } from "@ai-sdk/google";
import { createClient } from "@supabase/supabase-js";
import { generateText } from "ai";

import type { Database } from "@/lib/database.types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CITY = "Warszawa";
const TIME_ZONE = "Europe/Warsaw";
const MODEL = "gemini-3.1-flash-lite";

type WeatherData = {
  city: string;
  temperature: number;
  apparent: number;
  description: string;
  wind: number;
  source: string;
};

type CurrencyData = {
  code: string;
  rate: number;
  date: string;
  source: string;
};

type NewsItem = {
  title: string;
  source?: string;
  url?: string;
};

type DataResult<T> = { data: T } | { error: string };

const weatherCodes: Record<number, string> = {
  0: "Slonecznie",
  1: "Prawie bezchmurnie",
  2: "Czesciowe zachmurzenie",
  3: "Pochmurno",
  45: "Mgla",
  48: "Mgla osadzajaca",
  51: "Lekka mzawka",
  53: "Mzawka",
  55: "Silna mzawka",
  61: "Slaby deszcz",
  63: "Deszcz",
  65: "Silny deszcz",
  71: "Slaby snieg",
  73: "Snieg",
  75: "Silny snieg",
  80: "Przelotny deszcz",
  81: "Przelotny deszcz",
  82: "Ulewa",
  95: "Burza",
  96: "Burza z gradem",
  99: "Silna burza z gradem",
};

function getWarsawDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${value("year")}-${value("month")}-${value("day")}`;
}

function getWarsawDateTime() {
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: TIME_ZONE,
  }).format(new Date());
}

function getWeekday() {
  return new Intl.DateTimeFormat("pl-PL", {
    weekday: "long",
    timeZone: TIME_ZONE,
  }).format(new Date());
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 8000,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.name === "AbortError") {
    return "Timeout zewnetrznego API.";
  }

  return error instanceof Error ? error.message : "Nieznany blad.";
}

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

async function getWeather(city: string): Promise<WeatherData> {
  const geoResponse = await fetchWithTimeout(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      city,
    )}&count=1&language=pl&format=json`,
  );

  if (!geoResponse.ok) {
    throw new Error(`Geocoding HTTP ${geoResponse.status}`);
  }

  const geo = (await geoResponse.json()) as {
    results?: Array<{ name: string; latitude: number; longitude: number }>;
  };
  const place = geo.results?.[0];

  if (!place) {
    throw new Error(`Nie znaleziono miasta ${city}.`);
  }

  const weatherResponse = await fetchWithTimeout(
    `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}` +
      `&longitude=${place.longitude}` +
      "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m" +
      "&timezone=auto",
  );

  if (!weatherResponse.ok) {
    throw new Error(`Pogoda HTTP ${weatherResponse.status}`);
  }

  const weather = (await weatherResponse.json()) as {
    current?: {
      temperature_2m: number;
      apparent_temperature: number;
      weather_code: number;
      wind_speed_10m: number;
    };
  };
  const current = weather.current;

  if (!current) {
    throw new Error("Brak aktualnych danych pogodowych.");
  }

  return {
    city: place.name,
    temperature: current.temperature_2m,
    apparent: current.apparent_temperature,
    description: weatherCodes[current.weather_code] ?? `Kod ${current.weather_code}`,
    wind: current.wind_speed_10m,
    source: "Open-Meteo",
  };
}

async function getExchangeRate(code: string): Promise<CurrencyData> {
  const response = await fetchWithTimeout(
    `https://api.nbp.pl/api/exchangerates/rates/a/${code.toLowerCase()}/?format=json`,
  );

  if (!response.ok) {
    throw new Error(`NBP HTTP ${response.status}`);
  }

  const data = (await response.json()) as {
    code: string;
    rates?: Array<{ effectiveDate: string; mid: number }>;
  };
  const rate = data.rates?.[0];

  if (!rate) {
    throw new Error(`Brak kursu ${code}.`);
  }

  return {
    code: data.code,
    rate: rate.mid,
    date: rate.effectiveDate,
    source: "NBP",
  };
}

async function getNews(): Promise<NewsItem[]> {
  const response = await fetchWithTimeout(
    "https://news.google.com/rss?hl=pl&gl=PL&ceid=PL:pl",
    {
      headers: {
        "user-agent": "MojAgentMorningBriefing/1.0",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Wiadomosci HTTP ${response.status}`);
  }

  const xml = await response.text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .slice(0, 5)
    .map((match) => {
      const item = match[1];
      const title = item.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "";
      const source = item.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] ?? "";
      const url = item.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "";

      return {
        title: decodeXml(title),
        source: source ? decodeXml(source) : undefined,
        url: url ? decodeXml(url) : undefined,
      };
    })
    .filter((item) => item.title);

  if (items.length === 0) {
    throw new Error("Brak wiadomosci w RSS.");
  }

  return items;
}

async function safeLoad<T>(loader: () => Promise<T>): Promise<DataResult<T>> {
  try {
    return { data: await loader() };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

function formatInputForModel({
  date,
  dateTime,
  weekday,
  weather,
  currencies,
  news,
}: {
  date: string;
  dateTime: string;
  weekday: string;
  weather: DataResult<WeatherData>;
  currencies: Array<DataResult<CurrencyData>>;
  news: DataResult<NewsItem[]>;
}) {
  return JSON.stringify(
    {
      date,
      dateTime,
      weekday,
      weather,
      currencies,
      news,
    },
    null,
    2,
  );
}

function fallbackBriefing({
  date,
  weekday,
  weather,
  currencies,
  news,
}: {
  date: string;
  weekday: string;
  weather: DataResult<WeatherData>;
  currencies: Array<DataResult<CurrencyData>>;
  news: DataResult<NewsItem[]>;
}) {
  const weatherText =
    "data" in weather
      ? `${weather.data.city}: ${weather.data.temperature} C, ${weather.data.description}, odczuwalnie ${weather.data.apparent} C.`
      : `Nie udalo sie pobrac pogody: ${weather.error}`;
  const currencyText = currencies
    .map((currency) =>
      "data" in currency
        ? `- ${currency.data.code}: ${currency.data.rate} PLN`
        : `- Blad kursu: ${currency.error}`,
    )
    .join("\n");
  const newsText =
    "data" in news
      ? news.data
          .slice(0, 3)
          .map((item) => `- ${item.title}${item.source ? ` (${item.source})` : ""}`)
          .join("\n")
      : `- Nie udalo sie pobrac wiadomosci: ${news.error}`;

  return `# Dzien dobry! Twoj briefing na ${date}

## Pogoda
${weatherText}

## Kursy walut
${currencyText}

## Wiadomosci
${newsText}

## Dzisiejszy dzien
- Dzien tygodnia: ${weekday}
- Uwagi: sprawdz kalendarz pod katem spotkan i terminow.

## Porada dnia
Zacznij od jednej najwazniejszej rzeczy i dopiero potem dokladaj kolejne zadania.`;
}

async function generateBriefing(input: {
  date: string;
  dateTime: string;
  weekday: string;
  weather: DataResult<WeatherData>;
  currencies: Array<DataResult<CurrencyData>>;
  news: DataResult<NewsItem[]>;
}) {
  try {
    const result = await generateText({
      model: google(MODEL),
      system: `Jestes osobistym asystentem. Napisz poranny briefing po polsku.

Format:

# Dzien dobry! Twoj briefing na [data]

## Pogoda
[temperatura, opis, co ubrac]

## Kursy walut
- EUR: [kurs] PLN
- USD: [kurs] PLN

## Wiadomosci
[3-5 najwazniejszych punktow]

## Dzisiejszy dzien
- Dzien tygodnia: [...]
- Uwagi: [czy dzis swieto albo dzien wolny, jesli wynika z danych; inaczej praktyczna uwaga]

## Porada dnia
[Krotka, pozytywna porada na dzien]

Nie wymyslaj danych liczbowych. Jesli ktorys serwis zwrocil blad, ujmij to krotko w briefingu.`,
      prompt: formatInputForModel(input),
    });

    return result.text.trim() || fallbackBriefing(input);
  } catch {
    return fallbackBriefing(input);
  }
}

function createPreview(content: string) {
  return content.replace(/\s+/g, " ").trim().slice(0, 180);
}

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SERVICE;

  if (!secret) {
    return {
      ok: false,
      response: Response.json(
        { success: false, error: "Brakuje CRON_SERVICE w .env.local." },
        { status: 500 },
      ),
    };
  }

  const url = new URL(request.url);
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const providedSecret =
    request.headers.get("x-cron-secret") ??
    bearer ??
    url.searchParams.get("secret");

  if (providedSecret !== secret) {
    return {
      ok: false,
      response: Response.json(
        { success: false, error: "Niepoprawny sekret crona." },
        { status: 401 },
      ),
    };
  }

  return { ok: true };
}

function createSupabaseServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Brakuje NEXT_PUBLIC_SUPABASE_URL albo SUPABASE_SERVICE_ROLE_KEY w .env.local.",
    );
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function GET(request: Request) {
  const authorization = isAuthorized(request);

  if (!authorization.ok) {
    return authorization.response;
  }

  const date = getWarsawDate();
  const dateTime = getWarsawDateTime();
  const weekday = getWeekday();
  const [weather, eur, usd, news] = await Promise.all([
    safeLoad(() => getWeather(CITY)),
    safeLoad(() => getExchangeRate("EUR")),
    safeLoad(() => getExchangeRate("USD")),
    safeLoad(getNews),
  ]);
  const currencies = [eur, usd];
  const content = await generateBriefing({
    date,
    dateTime,
    weekday,
    weather,
    currencies,
    news,
  });
  const metadata = {
    city: CITY,
    dateTime,
    weather,
    currencies,
    news,
  };
  let serviceClient: ReturnType<typeof createSupabaseServiceClient>;

  try {
    serviceClient = createSupabaseServiceClient();
  } catch (error) {
    return Response.json(
      {
        success: false,
        date,
        error: errorMessage(error),
        preview: createPreview(content),
      },
      { status: 500 },
    );
  }

  const { data, error } = await serviceClient
    .from("briefings")
    .insert({
      content,
      date,
      metadata,
    })
    .select("id")
    .single();

  if (error) {
    return Response.json(
      {
        success: false,
        date,
        error: error.message,
        hint:
          "Uruchom migracje Supabase tworzaca tabele public.briefings, jesli nie byla jeszcze zastosowana.",
        preview: createPreview(content),
      },
      { status: 500 },
    );
  }

  return Response.json({
    success: true,
    date,
    id: data?.id,
    preview: createPreview(content),
  });
}
