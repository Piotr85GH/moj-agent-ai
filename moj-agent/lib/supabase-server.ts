import { createClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

export type AppSupabaseClient = ReturnType<typeof createClient<Database>> | any;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Brakuje NEXT_PUBLIC_SUPABASE_URL albo NEXT_PUBLIC_SUPABASE_ANON_KEY w .env.local.",
  );
}

export function createSupabaseServerClient(
  accessToken?: string | null,
): AppSupabaseClient {
  return createClient<Database>(supabaseUrl!, supabaseAnonKey!, {
      global: accessToken
        ? {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        : undefined,
      auth: {
        persistSession: false,
      },
    });
}

export function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim();
}

export async function requireSupabaseUser(
  request: Request,
): Promise<
  | { user: { id: string; email?: string }; supabase: AppSupabaseClient }
  | { error: Response }
> {
  const accessToken = getBearerToken(request);
  const authenticatedSupabase = createSupabaseServerClient(accessToken);
  const {
    data: { user },
    error,
  } = await authenticatedSupabase.auth.getUser(accessToken ?? undefined);

  if (error || !user) {
    return {
      error: Response.json(
        { error: "Musisz byc zalogowany." },
        { status: 401 },
      ),
    };
  }

  return {
    user: { id: user.id, email: user.email },
    supabase: authenticatedSupabase,
  };
}
