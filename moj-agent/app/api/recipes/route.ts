import { requireSupabaseUser } from "@/lib/supabase-server";

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

function cleanTitle(recipe: string, products: string[]) {
  const heading = /^#\s+(.+)$/m.exec(recipe)?.[1]?.trim();

  if (heading) {
    return heading.slice(0, 120);
  }

  return products.length ? `Przepis: ${products.join(", ").slice(0, 100)}` : "Przepis";
}

export async function GET(req: Request) {
  const auth = await requireSupabaseUser(req);

  if ("error" in auth) {
    return auth.error;
  }

  const { data, error } = await auth.supabase
    .from("recipes")
    .select("id, title, products, context, content, word_count, created_at")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ recipes: data ?? [] });
}

export async function POST(req: Request) {
  const auth = await requireSupabaseUser(req);

  if ("error" in auth) {
    return auth.error;
  }

  const body = (await req.json().catch(() => ({}))) as {
    products?: unknown;
    context?: unknown;
    recipe?: unknown;
  };
  const products = normalizeProducts(body.products);
  const context = typeof body.context === "string" ? body.context.trim() : "";
  const recipe = typeof body.recipe === "string" ? body.recipe.trim() : "";

  if (products.length === 0 || !recipe) {
    return Response.json(
      { error: "Przeslij JSON w formacie { products: string[], recipe: string }." },
      { status: 400 },
    );
  }

  const { data, error } = await auth.supabase
    .from("recipes")
    .insert({
      title: cleanTitle(recipe, products),
      products,
      context: context || null,
      content: recipe,
      user_id: auth.user.id,
      word_count: recipe.split(/\s+/).filter(Boolean).length,
      metadata: {
        saved_from: "/przepisomat",
      },
    })
    .select("id, title, products, created_at")
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ recipe: data });
}
