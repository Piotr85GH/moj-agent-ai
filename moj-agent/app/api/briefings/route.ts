import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { requireSupabaseUser } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 70;

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

function getCronSecret() {
  return (
    process.env.CRONE_SECRET ??
    process.env.CRON_SERVICE ??
    process.env.CRON_SECRET
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Nieznany blad.";
}

export async function GET(request: Request) {
  const auth = await requireSupabaseUser(request);

  if ("error" in auth) {
    return auth.error;
  }

  let supabase: ReturnType<typeof createSupabaseServiceClient>;

  try {
    supabase = createSupabaseServiceClient();
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("briefings")
    .select("id, created_at, content, date")
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ briefings: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireSupabaseUser(request);

  if ("error" in auth) {
    return auth.error;
  }

  const cronSecret = getCronSecret();

  if (!cronSecret) {
    return Response.json(
      { error: "Brakuje CRON_SECRET w zmiennych srodowiskowych." },
      { status: 500 },
    );
  }

  const origin = new URL(request.url).origin;
  const response = await fetch(`${origin}/api/cron/morning`, {
    headers: {
      Authorization: `Bearer ${cronSecret}`,
    },
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
  };

  if (!response.ok) {
    return Response.json(
      { error: data.error ?? "Nie udalo sie wygenerowac briefingu." },
      { status: response.status },
    );
  }

  return Response.json(data);
}
