type EmbedResponse = {
  embedding?: {
    values?: number[];
  };
};

export async function createEmbedding(text: string) {
  const apiKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Brakuje GOOGLE_GENERATIVE_AI_API_KEY albo GOOGLE_API_KEY w .env.local.",
    );
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "models/gemini-embedding-2",
        content: {
          parts: [{ text }],
        },
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Embedding API zwrocilo blad ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as EmbedResponse;
  const values = data.embedding?.values;

  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("Embedding API nie zwrocilo wektora.");
  }

  return values;
}
