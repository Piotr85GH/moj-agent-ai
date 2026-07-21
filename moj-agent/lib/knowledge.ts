import { createEmbedding } from "./embeddings";
import { supabase } from "./supabase";

type MatchDocumentRow = {
  id?: string;
  title?: string | null;
  content?: string | null;
  metadata?: Record<string, unknown> | null;
  similarity?: number | null;
};

export async function searchKnowledge(query: string) {
  const cleanQuery = query.trim();

  if (!cleanQuery) {
    return {
      results: [],
      total_found: 0,
      source_documents: [],
      message: "Zapytanie jest puste.",
    };
  }

  const embedding = await createEmbedding(cleanQuery);
  const { data, error } = await supabase.rpc("match_documents", {
    query_embedding: embedding,
    match_threshold: 0.5,
    match_count: 5,
  });

  if (error) {
    return {
      results: [],
      total_found: 0,
      source_documents: [],
      message: `Nie udalo sie przeszukac bazy wiedzy: ${error.message}`,
    };
  }

  const rows = ((data ?? []) as MatchDocumentRow[]).filter((row) => row.content);
  const documentIds = rows
    .map((row) => row.id)
    .filter((id): id is string => Boolean(id));
  const addedAtById = new Map<string, string>();

  if (documentIds.length > 0) {
    const { data: documentRows } = await supabase
      .from("documents")
      .select("id, created_at")
      .in("id", documentIds);

    for (const row of documentRows ?? []) {
      addedAtById.set(row.id, row.created_at);
    }
  }

  const results = rows
    .filter((row) => row.content)
    .map((row) => ({
      title: row.title ?? "Dokument bez tytulu",
      content: row.content ?? "",
      similarity: row.similarity ?? 0,
      metadata: row.metadata ?? {},
      added_at: row.id ? addedAtById.get(row.id) ?? null : null,
    }));

  if (results.length === 0) {
    return {
      results: [],
      total_found: 0,
      source_documents: [],
      message: "Nie znaleziono informacji w bazie wiedzy.",
    };
  }

  return {
    results,
    total_found: results.length,
    source_documents: Array.from(new Set(results.map((result) => result.title))),
  };
}
