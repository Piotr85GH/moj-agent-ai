import { google } from "@ai-sdk/google";
import { GoogleGenAI, Modality } from "@google/genai";
import {
  convertToModelMessages,
  createUIMessageStream,
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
import { supabase } from "@/lib/supabase";
import { searchKnowledge } from "@/lib/knowledge";
import type { Json } from "@/lib/database.types";
import {
  createSupabaseServerClient,
  type AppSupabaseClient,
} from "@/lib/supabase-server";

const enableSearchGrounding = process.env.ENABLE_SEARCH_GROUNDING === "true";

if (enableSearchGrounding) {
  console.warn(
    "UWAGA: Search Grounding jest WLACZONY. " +
      "To jest najdrozsza funkcja API ($14/1000 zapytan). " +
      "Uzywaj TYLKO do testow. Wylacz po testach usuwajac ENABLE_SEARCH_GROUNDING z .env.local.",
  );
}

export const maxDuration = 30;

type ChatModel = "flash" | "pro";

type UserProfilePayload = {
  id?: string;
  name?: string | null;
  display_name?: string | null;
  preferences?: Json;
};

const blockedMessage =
  "Ta wiadomosc zostala zablokowana z powodow bezpieczenstwa.";
const outputBlockedMessage =
  "Przepraszam, nie moge udostepnic tych informacji.";
const tokenBudgetExceededMessage =
  "Dzienny limit tokenow (10k) zostal wyczerpany. Wroc jutro!";
const dailyTokenLimit = 10_000;
const rateLimitMaxMessages = 50;
const rateLimitWindowMs = 60 * 60 * 1000;
const messageLog = new Map<string, number[]>();
const inputBlacklist = [
  "ignore previous",
  "system prompt",
  "ignore instructions",
  "reveal",
  "show me your",
  "translate your prompt",
];
const outputLeakPatterns = [
  /api[_-]?key/i,
  /google[_-]?api[_-]?key/i,
  /supabase[_-]?url/i,
  /supabase[_-]?anon[_-]?key/i,
  /next_public_supabase/i,
  /system prompt/i,
  /#\s*marta\s*-\s*profesjonalny doradca podatkowy/i,
  /##\s*baza wiedzy firmy/i,
  /#\s*agent ai\s*-\s*pelna moc/i,
  /#\s*agent vision/i,
  /#\s*agent z wyszukiwarka/i,
  /##\s*personalizacja/i,
  /google_search jest domyslnie wylaczony kosztowo/i,
];

const chatModels: Record<ChatModel, readonly string[]> = {
  flash: ["gemini-3.1-flash-lite"],
  pro: ["gemini-3.1-flash-lite"],
};

type TokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
};

const knowledgePrompt = `
## BAZA WIEDZY FIRMY
Masz dostep do bazy wiedzy firmy przez narzedzie searchKnowledge.

ZASADY KORZYSTANIA Z BAZY WIEDZY:
1. Gdy uzytkownik pyta o ceny, pakiety, oferty, regulamin, warunki, procedury albo FAQ, ZAWSZE najpierw uzyj searchKnowledge.
2. Odpowiadaj TYLKO na podstawie znalezionych fragmentow. Nie wymyslaj cen, warunkow ani szczegolow oferty.
3. Jesli baza wiedzy nie zawiera odpowiedzi, powiedz wprost: "Nie mam tej informacji w bazie wiedzy. Skontaktuj sie z firma."
4. Lepiej powiedziec "nie wiem" niz podac zmyslona informacje.

CYTOWANIE ZRODEL:
- Gdy odpowiadasz na podstawie bazy wiedzy, ZAWSZE na koncu odpowiedzi dodaj zrodlo.
- Format dla jednego dokumentu: "📎 Źródło: [tytuł dokumentu] (dodano: [added_at])".
- Format dla wielu dokumentow: "📎 Źródła: [tytuł 1] (dodano: [added_at]), [tytuł 2] (dodano: [added_at])".
- Korzystaj z pola source_documents, title i added_at z wynikow searchKnowledge. Jesli added_at jest puste, podaj sam tytul.

ODMOWA ODPOWIEDZI:
- Gdy searchKnowledge zwroci 0 wynikow albo wyniki nie odpowiadaja na pytanie, NIE odpowiadaj z wiedzy ogolnej.
- Powiedz: "Nie mam informacji na ten temat w mojej bazie wiedzy. Skontaktuj sie z firma bezposrednio."
- Mozesz dodac: "Moge za to odpowiedziec na pytania o cennik, pakiety i warunki uslugi."
- Wyjatek: pytania ogolne, np. pogoda, kurs walut albo Wikipedia, obsluguj normalnie innymi narzedziami.

PRIORYTET NARZEDZI:
- Pytania o firme, cennik, pakiety, regulamin, FAQ lub oferte -> searchKnowledge NAJPIERW.
- Pytania ogolne -> inne dostepne narzedzia.
- Obliczenia -> calculator.
`;

const systemPrompt = `
# Marta - profesjonalny doradca podatkowy dla JDG i B2B

## KIM JESTEM
Jestem doradca podatkowym z 10-letnim doswiadczeniem w polskich rozliczeniach osob fizycznych i malych firm.
Specjalizuje sie w PIT, VAT, ryczalcie, JDG, B2B, kosztach firmowych i podstawowych obowiazkach podatkowych.
Pracowalam z freelancerami, specjalistami IT, mikrofirmami i wlascicielami jednoosobowych dzialalnosci gospodarczych.

## JAK ODPOWIADAM

### Struktura kazdej odpowiedzi:
1. 📋 **Kontekst** - potwierdzam zrozumienie pytania w 1 zdaniu.
2. 🔍 **Analiza** - merytoryczna odpowiedz, maksymalnie 2 akapity.
3. ✅ **Rekomendacja** - konkretne dzialanie do podjecia w 1-3 punktach.
4. ❓ **Pytanie** - jedno pytanie poglebiajace do uzytkownika.

### Zasady:
- ZANIM odpowiem na zlozone pytanie, pytam o kontekst.
- Gdy podaje fakty, oznaczam pewnosc: ✓ pewne, ~ przyblizone, ? do weryfikacji.
- **Pogrubiam** kluczowe terminy przy pierwszym uzyciu.
- Uzywam list numerowanych dla krokow i punktowanych dla opcji.
- Maksymalnie 3 akapity plus rekomendacja.
- Pamietam cala rozmowe od poczatku i nawiazuje do wczesniejszych wiadomosci, gdy to pomaga.
- Gdy uzytkownik napisze "podsumuj" albo "co ustalilismy", streszczam cala rozmowe w numerowanej liscie.

### Styl:
- Jezyk: polski.
- Ton: profesjonalny, przystepny i konkretny.
- Gdy uzywam terminu branzowego, wyjasniam go w nawiasie.

## CZEGO NIE ROBIE
- Nie odpowiadam na pytania spoza podatkow, PIT, VAT, ryczaltu, JDG, B2B i kosztow firmowych. Mowie wprost, co moge zrobic zamiast tego.
- Nie udaje, ze wiem cos, czego nie wiem.
- Nie zastepuje indywidualnej porady doradcy podatkowego, ksiegowego ani prawnika przy decyzjach wysokiego ryzyka.

## INTERNET I ZRODLA
- Google Search jest domyslnie wylaczony kosztowo. Jesli narzedzie google_search jest dostepne, uzywaj go tylko gdy pytanie wymaga aktualnych informacji.
- Gdy uzywasz danych z internetu, podawaj zrodla jako klikalne linki.
- Gdy uzytkownik poda URL, uzyj narzedzia readWebPage, przeczytaj strone i stresc najwazniejsze informacje.

## OBSLUGA BLEDOW:
- Jesli narzedzie zwroci blad - NIE powtarzaj tego samego wywolania.
- Zamiast tego poinformuj uzytkownika i zaproponuj alternatywe.
- NIGDY nie wywoluj tego samego narzedzia z tymi samymi argumentami dwa razy z rzedu.
- Jesli po 3 nieudanych probach nie masz danych, powiedz wprost czego brakuje.
`;

const searchSystemPrompt = `
# Agent z wyszukiwarka

Jestes pomocnym agentem po polsku. Odpowiadasz konkretnie, jasno i na temat.

## Internet
- Google Search jest domyslnie wylaczony kosztowo. Jesli narzedzie google_search jest dostepne, uzywaj go tylko gdy pytanie dotyczy aktualnych informacji, cen, kursow walut, wiadomosci, sportu, repertuaru kin, osob publicznych albo faktow, ktore mogly sie zmienic.
- Nie uzywaj internetu, gdy pytanie nie wymaga aktualnych danych, np. prosba o zart, definicje ogolna albo prosta pomoc jezykowa.
- Gdy korzystasz z internetu, podawaj zrodla w odpowiedzi i preferuj konkretne linki do stron.
- Gdy uzytkownik poda URL, uzyj narzedzia readWebPage, przeczytaj strone i stresc jej tresc.

## OBSLUGA BLEDOW:
- Jesli narzedzie zwroci blad - NIE powtarzaj tego samego wywolania.
- Zamiast tego poinformuj uzytkownika i zaproponuj alternatywe.
- NIGDY nie wywoluj tego samego narzedzia z tymi samymi argumentami dwa razy z rzedu.
- Jesli po 3 nieudanych probach nie masz danych, powiedz wprost czego brakuje.
`;

const visionSystemPrompt = `
# Agent Vision

Jestes pomocnym agentem do analizy obrazow, screenshotow i grafik. Odpowiadasz po polsku.

## Co robisz
- Opisujesz dokladnie, co widzisz na obrazie.
- Wyciagasz tekst ze screenshotow.
- Pomagasz zrozumiec bledy, interfejsy, produkty, dokumenty i kolory.
- Gdy uzytkownik prosi o kolory, podawaj przyblizone kody HEX.
- Gdy obraz jest nieczytelny albo brakuje kontekstu, powiedz to wprost i popros o lepszy kadr.

## OBSLUGA BLEDOW:
- Jesli narzedzie zwroci blad - NIE powtarzaj tego samego wywolania.
- Zamiast tego poinformuj uzytkownika i zaproponuj alternatywe.
- NIGDY nie wywoluj tego samego narzedzia z tymi samymi argumentami dwa razy z rzedu.
- Jesli po 3 nieudanych probach nie masz danych, powiedz wprost czego brakuje.
`;

const agentSystemPrompt = `
# Agent AI - Pelna moc

Jestes autonomicznym agentem po polsku. Masz dostep do wielu narzedzi i sam decydujesz, ktorych uzyc.

## Narzedzia
- calculator: obliczenia matematyczne, VAT, netto/brutto, procenty.
- currentDateTime: aktualna data i czas.
- google_search: aktualne informacje z Google, tylko jesli narzedzie jest dostepne.
- readWebPage: czytanie stron WWW z URL.
- generateImage: generowanie grafik, logo, ilustracji i postow wizualnych.
- analiza obrazow: gdy uzytkownik dolacza screenshot lub obraz, opisz go i odpowiedz na pytanie.

## Zasady
- Przy zadaniach zlozonych lacz narzedzia krok po kroku.
- Gdy korzystasz z internetu, podawaj zrodla.
- Gdy generujesz obraz, krotko opisz zalozenia promptu.
- Jesli narzedzie zwroci blad limitu API, wyjasnij to czytelnie i kontynuuj czesc tekstowa zadania.

## OBSLUGA BLEDOW:
- Jesli narzedzie zwroci blad - NIE powtarzaj tego samego wywolania.
- Zamiast tego poinformuj uzytkownika i zaproponuj alternatywe.
- Przyklad: jesli pogoda nie dziala, napisz: "Nie udalo sie sprawdzic pogody w X. Moge poszukac w Google lub sprobowac innego miasta."
- NIGDY nie wywoluj tego samego narzedzia z tymi samymi argumentami dwa razy z rzedu.
- Jesli po 3 nieudanych probach nie masz danych, powiedz wprost czego brakuje.
`;

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
    .slice(0, 3000);
}

async function readWebPage(url: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; MojAgent/1.0; +https://localhost)",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return `Nie udalo sie pobrac strony. HTTP ${response.status} ${response.statusText}.`;
    }

    const html = await response.text();
    const text = extractReadableText(html);

    if (!text) {
      return "Strona zostala pobrana, ale nie udalo sie wyodrebnic czytelnego tekstu.";
    }

    return text;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return "Nie udalo sie pobrac strony: timeout po 5 sekundach.";
    }

    return `Nie udalo sie pobrac strony: ${
      error instanceof Error ? error.message : "nieznany blad"
    }.`;
  } finally {
    clearTimeout(timeoutId);
  }
}

function getApiKey() {
  return process.env.GOOGLE_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
}

function getErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Nieznany blad API.";

  try {
    const parsed = JSON.parse(message) as {
      error?: { code?: number; message?: string; status?: string };
    };
    const apiError = parsed.error;

    if (apiError?.code === 429 || apiError?.status === "RESOURCE_EXHAUSTED") {
      return "Przekroczono limit API dla modelu obrazowego albo ten klucz nie ma dostepnej puli dla tego modelu.";
    }

    return apiError?.message ?? message;
  } catch {
    return message;
  }
}

async function generateImage(prompt: string) {
  const apiKey = getApiKey();

  if (!apiKey) {
    return {
      error: "Brakuje klucza GOOGLE_API_KEY albo GOOGLE_GENERATIVE_AI_API_KEY.",
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite-image",
      contents: prompt,
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE],
      },
    });
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((part) => part.inlineData?.data);
    const imageData = imagePart?.inlineData?.data;
    const mimeType = imagePart?.inlineData?.mimeType ?? "image/png";
    const text =
      parts
        .map((part) => part.text)
        .filter(Boolean)
        .join("\n")
        .trim() || "Obraz zostal wygenerowany.";

    if (!imageData) {
      return { error: "Model nie zwrocil obrazu.", text };
    }

    return {
      image: `data:${mimeType};base64,${imageData}`,
      text,
    };
  } catch (error) {
    return { error: getErrorMessage(error) };
  }
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

function getChatModel(model: unknown): ChatModel {
  if (model === "pro" || model === "flash") {
    return model;
  }

  return "flash";
}

function getMessageText(parts: UIMessage["parts"]) {
  return parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function sanitizeText(text: string) {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
}

function sanitizeMessages(messages: UIMessage[]) {
  return messages.map((message) => ({
    ...message,
    parts: message.parts.map((part) =>
      part.type === "text" ? { ...part, text: sanitizeText(part.text) } : part,
    ),
  }));
}

function validateLatestUserInput(messages: UIMessage[]) {
  const latestUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user");
  const text = latestUserMessage ? getMessageText(latestUserMessage.parts) : "";
  const normalized = text.toLowerCase();

  if (text.length > 2000) {
    return false;
  }

  return !inputBlacklist.some((phrase) => normalized.includes(phrase));
}

function getRateLimitKey(
  req: Request,
  authenticatedUserId?: string,
  bodyUserId?: string,
) {
  if (authenticatedUserId) {
    return `user:${authenticatedUserId}`;
  }

  if (bodyUserId) {
    return `client-user:${bodyUserId}`;
  }

  const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = req.headers.get("x-real-ip")?.trim();

  return `ip:${forwardedFor || realIp || "local"}`;
}

function checkRateLimit(key: string) {
  const now = Date.now();
  const windowStart = now - rateLimitWindowMs;
  const recentTimestamps = (messageLog.get(key) ?? []).filter(
    (timestamp) => timestamp > windowStart,
  );

  if (recentTimestamps.length >= rateLimitMaxMessages) {
    const retryAt = recentTimestamps[0] + rateLimitWindowMs;
    const retryMinutes = Math.max(1, Math.ceil((retryAt - now) / 60000));

    messageLog.set(key, recentTimestamps);

    return {
      allowed: false,
      message: `Osiagnales limit wiadomosci (50/h). Sprobuj za ${retryMinutes} min.`,
    };
  }

  recentTimestamps.push(now);
  messageLog.set(key, recentTimestamps);

  return { allowed: true };
}

function getTodayStartIso() {
  const now = new Date();

  now.setHours(0, 0, 0, 0);

  return now.toISOString();
}

async function getDailyTokenUsage(
  userId: string | undefined,
  profileClient: AppSupabaseClient,
) {
  if (!userId) {
    return 0;
  }

  const { data, error } = await profileClient
    .from("api_usage")
    .select("tokens_input, tokens_output")
    .eq("user_id", userId)
    .gte("created_at", getTodayStartIso());

  if (error) {
    console.warn("Nie udalo sie policzyc dziennego zuzycia tokenow.", error);
    return 0;
  }

  return (data ?? []).reduce(
    (total: number, row: { tokens_input?: number; tokens_output?: number }) =>
      total + (row.tokens_input ?? 0) + (row.tokens_output ?? 0),
    0,
  );
}

async function logApiUsage({
  endpoint,
  model,
  profileClient,
  usage,
  userId,
}: {
  endpoint: string;
  model: string;
  profileClient: AppSupabaseClient;
  usage?: TokenUsage;
  userId?: string;
}) {
  if (!userId || !usage) {
    return;
  }

  const { error } = await profileClient.from("api_usage").insert({
    user_id: userId,
    tokens_input: usage.inputTokens ?? 0,
    tokens_output: usage.outputTokens ?? 0,
    model,
    endpoint,
  });

  if (error) {
    console.warn("Nie udalo sie zapisac zuzycia tokenow.", error);
  }
}

function containsOutputLeak(text: string) {
  return outputLeakPatterns.some((pattern) => pattern.test(text));
}

function createAssistantTextResponse(text: string, originalMessages: UIMessage[]) {
  const id = `security-${Date.now()}`;

  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      originalMessages,
      execute({ writer }) {
        writer.write({ type: "text-start", id });
        writer.write({ type: "text-delta", id, delta: text });
        writer.write({ type: "text-end", id });
      },
    }),
  });
}

function filterOutputStream(
  stream: ReadableStream<TextStreamPart<any>>,
  onUsage?: (usage: TokenUsage) => Promise<void> | void,
) {
  let reader: ReadableStreamDefaultReader<TextStreamPart<any>> | undefined;
  let textId = `filtered-${Date.now()}`;
  let bufferedText = "";
  let didBlock = false;
  const pending: TextStreamPart<any>[] = [];

  function enqueueBufferedText() {
    if (!bufferedText) {
      return;
    }

    pending.push({ type: "text-start", id: textId } as TextStreamPart<any>);
    pending.push({
      type: "text-delta",
      id: textId,
      text: bufferedText,
    } as TextStreamPart<any>);
    pending.push({ type: "text-end", id: textId } as TextStreamPart<any>);
    bufferedText = "";
  }

  function enqueueBlockedText() {
    pending.push({ type: "text-start", id: textId } as TextStreamPart<any>);
    pending.push({
      type: "text-delta",
      id: textId,
      text: outputBlockedMessage,
    } as TextStreamPart<any>);
    pending.push({ type: "text-end", id: textId } as TextStreamPart<any>);
  }

  return new ReadableStream<TextStreamPart<any>>({
    async pull(controller) {
      if (pending.length > 0) {
        controller.enqueue(pending.shift()!);
        return;
      }

      reader ??= stream.getReader();

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          enqueueBufferedText();

          if (pending.length > 0) {
            controller.enqueue(pending.shift()!);
            return;
          }

          controller.close();
          return;
        }

        if (value.type === "text-start") {
          textId = value.id;
          continue;
        }

        if (value.type === "text-delta") {
          bufferedText += value.text;

          if (containsOutputLeak(bufferedText)) {
            didBlock = true;
            await reader.cancel().catch(() => undefined);
            bufferedText = "";
            enqueueBlockedText();
            controller.enqueue(pending.shift()!);
            return;
          }

          continue;
        }

        if (value.type === "text-end") {
          continue;
        }

        if (value.type === "finish") {
          if (value.totalUsage) {
            await onUsage?.({
              inputTokens: value.totalUsage.inputTokens,
              outputTokens: value.totalUsage.outputTokens,
            });
          }

          if (!didBlock) {
            enqueueBufferedText();
          }
        }

        pending.push(value);
        controller.enqueue(pending.shift()!);
        return;
      }
    },
    async cancel() {
      await reader?.cancel().catch(() => undefined);
    },
  });
}

function attachImageToLatestUserMessage(
  modelMessages: ModelMessage[],
  messages: UIMessage[],
  image: unknown,
) {
  if (typeof image !== "string" || !image.startsWith("data:image/")) {
    return modelMessages;
  }

  const latestUserText =
    [...messages].reverse().find((message) => message.role === "user")?.parts
      ? getMessageText(
          [...messages].reverse().find((message) => message.role === "user")!
            .parts,
        )
      : "Opisz obraz.";
  const latestUserIndex = modelMessages.findLastIndex(
    (message) => message.role === "user",
  );

  if (latestUserIndex === -1) {
    return modelMessages;
  }

  const nextMessages = [...modelMessages];
  nextMessages[latestUserIndex] = {
    ...nextMessages[latestUserIndex],
    content: [
      { type: "image", image },
      { type: "text", text: latestUserText || "Opisz obraz." },
    ],
  } as ModelMessage;

  return nextMessages;
}

function createPersonalizedSystemPrompt(
  basePrompt: string,
  userProfile?: UserProfilePayload,
) {
  const promptWithKnowledge = `${basePrompt}

${knowledgePrompt}`;
  const name = userProfile?.display_name?.trim() ?? userProfile?.name?.trim();
  const preferences =
    userProfile?.preferences &&
    typeof userProfile.preferences === "object" &&
    !Array.isArray(userProfile.preferences)
      ? JSON.stringify(userProfile.preferences)
      : "";

  if (name) {
    return `${promptWithKnowledge}

## PERSONALIZACJA
Uzytkownik ma na imie ${name}. Zwracaj sie do niego po imieniu. Badz cieply i personalny - to Twoj staly uzytkownik.
${preferences ? `Uzytkownik ma zapisane preferencje: ${preferences}. Przy rozpoczeciu nowej rozmowy przywitaj go po imieniu i wylistuj te preferencje w czytelnej formie. Uzywaj ich naturalnie, gdy pomagaja w rozmowie.` : "Przy rozpoczeciu nowej rozmowy przywitaj uzytkownika po imieniu i powiedz, ze nie masz jeszcze zapisanych preferencji."}`;
  }

  return `${promptWithKnowledge}

## PERSONALIZACJA
To nowy uzytkownik. Na poczatku pierwszej rozmowy przywitaj sie krotko i zapytaj jak ma na imie. Gdy poda imie, uzyj narzedzia saveUserName, zeby je zapamietac.
Jesli uzytkownik poda preferencje, miasto, zainteresowania albo upodobania, uzyj narzedzia saveUserPreference, zeby zapisac je w profilu.`;
}

async function saveUserName(
  userId: string | undefined,
  name: string,
  profileClient = supabase,
) {
  const cleanName = name.trim().replace(/[.,!?;:]+$/g, "");

  if (!userId) {
    return { ok: false, error: "Brakuje user_id." };
  }

  if (!cleanName) {
    return { ok: false, error: "Imie jest puste." };
  }

  const { error } = await profileClient
    .from("user_profiles")
    .update({ name: cleanName, display_name: cleanName })
    .eq("id", userId);

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, name: cleanName };
}

async function saveUserPreference(
  userId: string | undefined,
  key: string,
  value: string,
  profileClient = supabase,
) {
  const cleanKey = key
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_ąćęłńóśźż-]/gi, "");
  const cleanValue = value.trim();

  if (!userId) {
    return { ok: false, error: "Brakuje user_id." };
  }

  if (!cleanKey || !cleanValue) {
    return { ok: false, error: "Preferencja musi miec klucz i wartosc." };
  }

  const { data: profile, error: readError } = await profileClient
    .from("user_profiles")
    .select("preferences")
    .eq("id", userId)
    .single();

  if (readError) {
    return { ok: false, error: readError.message };
  }

  const currentPreferences =
    profile.preferences &&
    typeof profile.preferences === "object" &&
    !Array.isArray(profile.preferences)
      ? profile.preferences
      : {};
  const preferences = {
    ...currentPreferences,
    [cleanKey]: cleanValue,
  };

  const { error: updateError } = await profileClient
    .from("user_profiles")
    .update({ preferences })
    .eq("id", userId);

  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  return { ok: true, key: cleanKey, value: cleanValue };
}

function streamTextWithFallback({
  messages,
  model,
  system,
  userId,
  profileClient,
}: {
  messages: ModelMessage[];
  model: ChatModel;
  system: string;
  userId?: string;
  profileClient?: AppSupabaseClient;
}) {
  let modelIndex = 0;
  let reader: ReadableStreamDefaultReader<TextStreamPart<any>> | undefined;
  let didStartStreaming = false;
  const modelChain = chatModels[model];

  return new ReadableStream<TextStreamPart<any>>({
    async pull(controller) {
      while (modelIndex < modelChain.length) {
        if (!reader) {
          const result = streamText({
            model: google(modelChain[modelIndex]),
            system,
            messages,
            stopWhen: stepCountIs(3),
            tools: {
              calculator: tool({
                description:
                  "Wykonuje obliczenia matematyczne, procenty, VAT, netto i brutto.",
                inputSchema: z.object({
                  expression: z
                    .string()
                    .describe("Wyrazenie matematyczne, np. 8500 * 0.23."),
                }),
                execute: async ({ expression }) => ({
                  expression,
                  result: calculateExpression(expression),
                }),
              }),
              currentDateTime: tool({
                description:
                  "Zwraca aktualna date i czas serwera w strefie Europe/Warsaw.",
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
              ...(enableSearchGrounding
                ? { google_search: google.tools.googleSearch({}) }
                : {}),
              readWebPage: tool({
                description:
                  "Pobiera i czyta zawartosc strony internetowej. Uzywaj gdy uzytkownik poda URL lub gdy chcesz przeczytac artykul/strone znaleziona w wyszukiwarce.",
                inputSchema: z.object({
                  url: z
                    .string()
                    .url()
                    .describe("Pelny adres URL strony internetowej."),
                }),
                execute: async ({ url }) => readWebPage(url),
              }),
              searchKnowledge: tool({
                description:
                  "Wyszukuje informacje w bazie wiedzy firmy: cenniki, pakiety, FAQ, regulaminy, warunki, procedury i oferty. Uzywaj ZAWSZE, gdy uzytkownik pyta o ceny, koszty, pakiety, regulamin, FAQ albo informacje firmowe.",
                inputSchema: z.object({
                  query: z
                    .string()
                    .describe("Pytanie do bazy wiedzy, np. 'ile kosztuje pakiet Premium'."),
                }),
                execute: async ({ query }) =>
                  searchKnowledge(query, userId, profileClient),
              }),
              generateImage: tool({
                description:
                  "Generuje obraz na podstawie opisu. Uzywaj gdy uzytkownik prosi o logo, grafike, ilustracje lub post wizualny.",
                inputSchema: z.object({
                  prompt: z.string().describe("Opis obrazu do wygenerowania."),
                }),
                execute: async ({ prompt }) => generateImage(prompt),
              }),
              saveUserName: tool({
                description:
                  "Zapisuje imie uzytkownika w Supabase. Uzyj, gdy uzytkownik poda jak ma na imie, np. 'Mam na imie Pawel' albo 'Jestem Anna'.",
                inputSchema: z.object({
                  name: z.string().describe("Imie uzytkownika, bez dodatkow."),
                }),
                execute: async ({ name }) =>
                  saveUserName(userId, name, profileClient),
              }),
              saveUserPreference: tool({
                description:
                  "Zapisuje preferencje uzytkownika w Supabase, np. miasto, ulubione jedzenie, hobby albo wazne stale informacje.",
                inputSchema: z.object({
                  key: z
                    .string()
                    .describe("Krotki klucz preferencji, np. miasto."),
                  value: z.string().describe("Wartosc preferencji."),
                }),
                execute: async ({ key, value }) =>
                  saveUserPreference(userId, key, value, profileClient),
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

          didStartStreaming = true;
          controller.enqueue(value);
          return;
        } catch (error) {
          await reader.cancel().catch(() => undefined);
          reader = undefined;

          if (didStartStreaming || modelIndex === modelChain.length - 1) {
            controller.error(error);
            return;
          }

          modelIndex += 1;
        }
      }

      controller.close();
    },
    async cancel() {
      await reader?.cancel().catch(() => undefined);
    },
  });
}

export async function POST(req: Request) {
  const {
    messages,
    model,
    mode,
    image,
    accessToken,
    userId: bodyUserId,
    userProfile,
  }: {
    messages: UIMessage[];
    model?: ChatModel;
    mode?: "agent" | "search" | "vision";
    image?: string;
    accessToken?: string;
    userId?: string;
    userProfile?: UserProfilePayload;
  } =
    await req.json();
  const profileClient = createSupabaseServerClient(accessToken);
  const {
    data: { user },
  } = await profileClient.auth.getUser(accessToken);
  const authenticatedUserId = user?.id;
  const sanitizedMessages = sanitizeMessages(messages);
  const rateLimit = checkRateLimit(
    getRateLimitKey(req, authenticatedUserId, bodyUserId),
  );

  if (!rateLimit.allowed) {
    return createAssistantTextResponse(
      rateLimit.message ?? "Osiagnales limit wiadomosci (50/h). Sprobuj pozniej.",
      sanitizedMessages,
    );
  }

  if (!validateLatestUserInput(sanitizedMessages)) {
    return createAssistantTextResponse(blockedMessage, sanitizedMessages);
  }

  const chatModel = getChatModel(model);
  const selectedModel = chatModels[chatModel][0];
  const dailyTokens = await getDailyTokenUsage(
    authenticatedUserId,
    profileClient,
  );

  if (dailyTokens >= dailyTokenLimit) {
    return createAssistantTextResponse(
      tokenBudgetExceededMessage,
      sanitizedMessages,
    );
  }

  const modelMessages = attachImageToLatestUserMessage(
    await convertToModelMessages(sanitizedMessages),
    sanitizedMessages,
    image,
  );

  const stream = streamTextWithFallback({
    model: chatModel,
    system: createPersonalizedSystemPrompt(
      mode === "vision"
        ? visionSystemPrompt
        : mode === "agent"
          ? agentSystemPrompt
          : mode === "search"
            ? searchSystemPrompt
            : systemPrompt,
      userProfile,
    ),
    messages: modelMessages,
    userId: authenticatedUserId,
    profileClient,
  });

  const filteredStream = filterOutputStream(stream, (usage) =>
    logApiUsage({
      endpoint: "/api/chat",
      model: selectedModel,
      profileClient,
      usage,
      userId: authenticatedUserId,
    }),
  );

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: filteredStream,
      originalMessages: sanitizedMessages,
      sendSources: true,
    }),
  });
}
