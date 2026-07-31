import { NextResponse } from "next/server";

import { supabase } from "@/lib/supabase";

const tables = ["conversations", "messages", "user_profiles", "api_usage"] as const;

export async function GET() {
  const checks = await Promise.all(
    tables.map(async (table) => {
      const { error } = await supabase.from(table).select("id").limit(1);

      return {
        table,
        ok: !error,
        error: error?.message ?? null,
      };
    }),
  );

  return NextResponse.json({
    ok: checks.every((check) => check.ok),
    supabaseUrlConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabaseAnonKeyConfigured: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
    tables: checks,
  });
}
