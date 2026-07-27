import { requireSupabaseUser } from "@/lib/supabase-server";

function cleanTitle(topic: string) {
  const title = topic.trim().replace(/\s+/g, " ").slice(0, 120);
  return title ? `Raport: ${title}` : "Raport biznesowy";
}

export async function GET(req: Request) {
  const auth = await requireSupabaseUser(req);

  if ("error" in auth) {
    return auth.error;
  }

  const { data, error } = await auth.supabase
    .from("reports")
    .select("id, title, topic, content, word_count, created_at")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ reports: data ?? [] });
}

export async function POST(req: Request) {
  const auth = await requireSupabaseUser(req);

  if ("error" in auth) {
    return auth.error;
  }

  const body = (await req.json().catch(() => ({}))) as {
    topic?: unknown;
    report?: unknown;
  };
  const topic = typeof body.topic === "string" ? body.topic.trim() : "";
  const report = typeof body.report === "string" ? body.report.trim() : "";

  if (!topic || !report) {
    return Response.json(
      { error: "Przeslij JSON w formacie { topic: string, report: string }." },
      { status: 400 },
    );
  }

  const { data, error } = await auth.supabase
    .from("reports")
    .insert({
      title: cleanTitle(topic),
      topic,
      content: report,
      user_id: auth.user.id,
      word_count: report.split(/\s+/).filter(Boolean).length,
      metadata: {
        saved_from: "/report",
      },
    })
    .select("id, title, topic, created_at")
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ report: data });
}
