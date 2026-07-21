import { GoogleGenAI, Modality } from "@google/genai";
import { NextResponse } from "next/server";

export const maxDuration = 30;

type GenerateImageBody = {
  prompt?: unknown;
};

function getErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Nieznany blad API.";

  try {
    const parsed = JSON.parse(message) as {
      error?: { code?: number; message?: string; status?: string };
    };
    const apiError = parsed.error;

    if (apiError?.code === 429 || apiError?.status === "RESOURCE_EXHAUSTED") {
      return "Przekroczono limit API dla modelu obrazowego albo ten klucz nie ma dostepnej darmowej puli dla tego modelu. Sprobuj pozniej lub sprawdz limity w Google AI Studio.";
    }

    return apiError?.message ?? message;
  } catch {
    return message;
  }
}

async function generateWithTimeout<T>(promise: Promise<T>, ms: number) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error("Generowanie przekroczylo limit 30 sekund.")),
      ms,
    );
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as GenerateImageBody;
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";

    if (!prompt) {
      return NextResponse.json(
        { error: "Podaj opis obrazu w polu prompt." },
        { status: 400 },
      );
    }

    const apiKey =
      process.env.GOOGLE_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "Brakuje klucza GOOGLE_API_KEY albo GOOGLE_GENERATIVE_AI_API_KEY.",
        },
        { status: 500 },
      );
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await generateWithTimeout(
      ai.models.generateContent({
        model: "gemini-3.1-flash-lite-image",
        contents: prompt,
        config: {
          responseModalities: [Modality.TEXT, Modality.IMAGE],
        },
      }),
      30000,
    );

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const text =
      parts
        .map((part) => part.text)
        .filter(Boolean)
        .join("\n")
        .trim() || "Obraz zostal wygenerowany.";
    const imagePart = parts.find((part) => part.inlineData?.data);
    const imageData = imagePart?.inlineData?.data;
    const mimeType = imagePart?.inlineData?.mimeType ?? "image/png";

    if (!imageData) {
      return NextResponse.json(
        { error: "Model nie zwrocil obrazu. Sprobuj zmienic opis." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      image: `data:${mimeType};base64,${imageData}`,
      text,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Nie udalo sie wygenerowac obrazu: ${getErrorMessage(error)}` },
      { status: 500 },
    );
  }
}
