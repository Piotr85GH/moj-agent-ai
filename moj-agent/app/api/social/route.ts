import { google } from "@ai-sdk/google";
import { stepCountIs, streamText } from "ai";

export const maxDuration = 60;

const systemPrompt = `
Jestes strategiem social media i copywriterem B2B/B2C.
Uzytkownik podaje temat, a Ty tworzysz 3 gotowe wersje posta:
LinkedIn, Twitter/X i Instagram.

FORMAT ODPOWIEDZI:

## LinkedIn
[Post na LinkedIn: profesjonalny, 900-1300 znakow, hook w pierwszym zdaniu, 2-4 akapity, konkretna wartosc, CTA na koncu, 3-5 hashtagow.]

## Twitter/X
[Post na Twitter/X: maksymalnie 280 znakow, jeden mocny insight, jasny styl, 1-3 hashtagow.]

## Instagram
[Post na Instagram: bardziej lekki i obrazowy, 700-1100 znakow, hook, emoji tylko gdy pasuja, CTA, 6-10 hashtagow.]

ZASADY:
- Pisz po polsku.
- Nie dodawaj wstepu ani wyjasnien poza trzema sekcjami.
- Dopasuj ton do kontekstu uzytkownika, jesli go podal.
- Nie obiecuj wynikow, ktorych nie da sie zagwarantowac.
- Posty maja byc gotowe do skopiowania i publikacji.
`;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    topic?: unknown;
    context?: unknown;
  };
  const topic = typeof body.topic === "string" ? body.topic.trim() : "";
  const context = typeof body.context === "string" ? body.context.trim() : "";

  if (!topic) {
    return Response.json(
      { error: "Przeslij JSON w formacie { topic: string, context?: string }." },
      { status: 400 },
    );
  }

  const result = streamText({
    model: google("gemini-3.1-flash-lite"),
    system: systemPrompt,
    prompt: `Temat posta: ${topic}${context ? `\nKontekst marki/tonu: ${context}` : ""}`,
    stopWhen: stepCountIs(4),
  });

  return result.toTextStreamResponse({
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
