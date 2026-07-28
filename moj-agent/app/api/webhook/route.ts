import { google } from "@ai-sdk/google";
import { createClient } from "@supabase/supabase-js";
import { generateText } from "ai";

import type { Database, Json } from "@/lib/database.types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = "gemini-3.1-flash-lite";
const supportedTypes = ["feedback", "alert", "order"] as const;

type WebhookType = (typeof supportedTypes)[number];

type WebhookBody = {
  type?: unknown;
  data?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSupportedType(value: unknown): value is WebhookType {
  return (
    typeof value === "string" &&
    supportedTypes.includes(value as WebhookType)
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Nieznany blad.";
}

function isAuthorized(request: Request) {
  const secret = process.env.WEBHOOK_SECRET;

  if (!secret) {
    return {
      ok: false,
      response: Response.json(
        { success: false, error: "Brakuje WEBHOOK_SECRET w .env.local." },
        { status: 500 },
      ),
    };
  }

  const url = new URL(request.url);
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const providedSecret =
    request.headers.get("x-webhook-secret") ??
    bearer ??
    url.searchParams.get("secret");

  if (providedSecret !== secret) {
    return {
      ok: false,
      response: Response.json(
        { success: false, error: "Niepoprawny sekret webhooka." },
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

function fallbackAnalysis(type: WebhookType, data: Record<string, unknown>) {
  if (type === "feedback") {
    const rating = Number(data.rating);
    const sentiment = Number.isFinite(rating)
      ? rating <= 2
        ? "negatywny"
        : rating === 3
          ? "neutralny"
          : "pozytywny"
      : "do oceny";
    const priority = Number.isFinite(rating) && rating <= 2 ? "wysoki" : "sredni";

    return [
      `Typ: feedback klienta`,
      `Sentiment: ${sentiment}`,
      `Priorytet: ${priority}`,
      `Sugestia: odpowiedz klientowi szybko, podziekuj za informacje i zaproponuj konkretne nastepne dzialanie.`,
    ].join("\n");
  }

  if (type === "alert") {
    const status = String(data.status ?? "").toLowerCase();
    const severity = ["down", "critical", "error"].includes(status)
      ? "critical"
      : "warning";

    return [
      `Typ: alert techniczny`,
      `Severity: ${severity}`,
      `Rekomendowana akcja: sprawdz usluge ${String(
        data.service ?? "nieznana",
      )}, potwierdz czas trwania incydentu i rozpocznij eskalacje wedlug runbooka.`,
    ].join("\n");
  }

  return [
    `Typ: zamowienie`,
    `Status: przyjete do analizy`,
    `Podsumowanie: sprawdz platnosc, produkt i dane klienta, a potem wyslij potwierdzenie zamowienia.`,
  ].join("\n");
}

function createPrompt(type: WebhookType, data: Record<string, unknown>) {
  return `Typ zdarzenia: ${type}
Dane JSON:
${JSON.stringify(data, null, 2)}

Przeanalizuj zdarzenie i zwroc konkretna odpowiedz po polsku.
Analizuj tylko wskazany typ zdarzenia. Nie dodawaj sekcji dla innych typow.

Dla feedback:
- sentiment: pozytywny/neutralny/negatywny
- priorytet: niski/sredni/wysoki
- sugestia odpowiedzi do klienta

Dla alert:
- severity: info/warning/critical
- prawdopodobny wplyw
- recommended action

Dla order:
- krotkie potwierdzenie
- ryzyka lub braki w danych
- nastepny krok

Nie wymyslaj danych spoza JSON.`;
}

async function analyzeEvent(type: WebhookType, data: Record<string, unknown>) {
  try {
    const result = await generateText({
      model: google(MODEL),
      system:
        "Jestes agentem operacyjnym. Analizujesz webhooki z systemow zewnetrznych, piszesz zwiezle i konkretnie po polsku.",
      prompt: createPrompt(type, data),
    });

    return result.text.trim() || fallbackAnalysis(type, data);
  } catch {
    return fallbackAnalysis(type, data);
  }
}

export async function POST(request: Request) {
  const authorization = isAuthorized(request);

  if (!authorization.ok) {
    return authorization.response;
  }

  const body = (await request.json().catch(() => null)) as WebhookBody | null;

  if (!body || !isSupportedType(body.type) || !isRecord(body.data)) {
    return Response.json(
      {
        success: false,
        error:
          "Przeslij JSON w formacie { type: 'feedback' | 'alert' | 'order', data: object }.",
      },
      { status: 400 },
    );
  }

  const analysis = await analyzeEvent(body.type, body.data);
  let serviceClient: ReturnType<typeof createSupabaseServiceClient>;

  try {
    serviceClient = createSupabaseServiceClient();
  } catch (error) {
    return Response.json(
      { success: false, error: errorMessage(error), analysis },
      { status: 500 },
    );
  }

  const { data: savedEvent, error } = await serviceClient
    .from("webhook_events")
    .insert({
      type: body.type,
      data: body.data as Json,
      analysis,
    })
    .select("id")
    .single();

  if (error) {
    return Response.json(
      {
        success: false,
        error: error.message,
        hint:
          "Uruchom migracje Supabase tworzaca tabele public.webhook_events, jesli nie byla jeszcze zastosowana.",
        analysis,
      },
      { status: 500 },
    );
  }

  return Response.json({
    success: true,
    analysis,
    event_id: savedEvent?.id,
  });
}
