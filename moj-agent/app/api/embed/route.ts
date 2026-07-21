import { createEmbedding } from "@/lib/embeddings";

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const { text }: { text?: string } = await request.json();
    const cleanText = text?.trim();

    if (!cleanText) {
      return Response.json({ error: "Pole text jest wymagane." }, { status: 400 });
    }

    const embedding = await createEmbedding(cleanText);

    return Response.json({ embedding });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nieznany blad.";

    return Response.json({ error: message }, { status: 500 });
  }
}
