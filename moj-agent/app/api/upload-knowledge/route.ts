import { supabase } from "@/lib/supabase";
import { splitIntoChunks } from "@/lib/chunking";
import { createEmbedding } from "@/lib/embeddings";
import { searchKnowledge } from "@/lib/knowledge";

export const maxDuration = 60;

type DocumentRow = {
  title: string | null;
  created_at: string;
};

function streamEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  event: string,
  data: unknown,
) {
  const encoder = new TextEncoder();
  controller.enqueue(
    encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const selectedTitle = url.searchParams.get("title")?.trim();
  const query = url.searchParams.get("query")?.trim();

  if (query) {
    const results = await searchKnowledge(query);

    return Response.json(results);
  }

  if (selectedTitle) {
    const { data, error } = await supabase
      .from("documents")
      .select("id, title, content, metadata, created_at")
      .eq("title", selectedTitle)
      .order("created_at", { ascending: true });

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ fragments: data ?? [] });
  }

  const { data, error } = await supabase
    .from("documents")
    .select("title, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const grouped = new Map<
    string,
    { title: string; chunks: number; createdAt: string }
  >();

  for (const row of (data ?? []) as DocumentRow[]) {
    const title = row.title ?? "Bez tytulu";
    const current = grouped.get(title);

    if (current) {
      current.chunks += 1;
      if (row.created_at > current.createdAt) {
        current.createdAt = row.created_at;
      }
      continue;
    }

    grouped.set(title, {
      title,
      chunks: 1,
      createdAt: row.created_at,
    });
  }

  const documents = Array.from(grouped.values());
  const totalChunks = documents.reduce((sum, document) => sum + document.chunks, 0);

  return Response.json({
    documents,
    total_documents: documents.length,
    total_chunks: totalChunks,
  });
}

export async function DELETE(request: Request) {
  const { title }: { title?: string } = await request.json();
  const cleanTitle = title?.trim();

  if (!cleanTitle) {
    return Response.json({ error: "Pole title jest wymagane." }, { status: 400 });
  }

  const { error } = await supabase
    .from("documents")
    .delete()
    .eq("title", cleanTitle);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true });
}

export async function POST(request: Request) {
  const { title, content }: { title?: string; content?: string } =
    await request.json();
  const cleanTitle = title?.trim();
  const cleanContent = content?.trim();

  if (!cleanTitle || !cleanContent) {
    return Response.json(
      { error: "Pola title i content sa wymagane." },
      { status: 400 },
    );
  }

  const chunks = splitIntoChunks(cleanContent);

  if (chunks.length === 0) {
    return Response.json({ error: "Dokument jest pusty." }, { status: 400 });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        streamEvent(controller, "start", { total: chunks.length });

        for (const [index, chunk] of chunks.entries()) {
          streamEvent(controller, "progress", {
            current: index + 1,
            total: chunks.length,
            message: `Przetwarzam fragment ${index + 1} z ${chunks.length}...`,
          });

          const embedding = await createEmbedding(chunk);
          const { error } = await supabase.from("documents").insert({
            title: cleanTitle,
            content: chunk,
            embedding,
            metadata: {
              source: cleanTitle,
              chunk_index: index,
              total_chunks: chunks.length,
            },
          });

          if (error) {
            throw new Error(error.message);
          }
        }

        streamEvent(controller, "done", {
          success: true,
          chunks_saved: chunks.length,
        });
      } catch (error) {
        streamEvent(controller, "error", {
          error: error instanceof Error ? error.message : "Nieznany blad.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache",
      "Content-Type": "text/event-stream; charset=utf-8",
    },
  });
}
