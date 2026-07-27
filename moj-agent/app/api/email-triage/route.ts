import { google } from "@ai-sdk/google";
import { streamText } from "ai";

export const maxDuration = 60;

const systemPrompt = `
Jestes profesjonalnym asystentem do zarzadzania poczta.

Dla KAZDEGO maila wykonaj:
1. KATEGORYZACJA: okresl typ (zapytanie ofertowe / reklamacja / spam / informacja / prosba o spotkanie).
2. PRIORYTET: Wysoki (wymaga odpowiedzi dzis) / Sredni (w ciagu 3 dni) / Niski (moze poczekac).
3. DRAFT: napisz krotki, profesjonalny szkic odpowiedzi (3-5 zdan). Dla spamu napisz "Brak odpowiedzi - oznaczyc jako spam".

WAZNE ZASADY KLASYFIKACJI:
- Newsletter, raport branzowy, informacja marketingowa lub tresc edukacyjna to kategoria "informacja" i priorytet "Zielony Niski", chyba ze zawiera wyrazne oszustwo, phishing albo podejrzany link.
- Mail od newsletter@branzowy-portal.pl z raportem AI 2026 ma byc policzony jako Niski, NIE jako Spam.
- Spam to wylacznie wiadomosci oszukancze, phishingowe, losy/wygrane, podejrzane nagrody albo masowe naciaganie.

FORMAT ODPOWIEDZI:
Dla kazdego maila:

### Mail [numer]: [krotki temat]
| Kategoria | [typ] |
| Priorytet | [Czerwony Wysoki / Zolty Sredni / Zielony Niski] |
| Uzasadnienie | [dlaczego ten priorytet] |

**Proponowana odpowiedz:**
> [draft odpowiedzi]

---

Na koncu dodaj sekcje:

### PODSUMOWANIE
- Pilne: [ile] maili
- Srednie: [ile] maili
- Niskie: [ile] maili
- Spam: [ile] maili
- Rekomendacja: [ktory mail obsluzyc najpierw]
`;

function normalizeEmails(input: unknown) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter((email): email is string => typeof email === "string")
    .map((email) => email.trim())
    .filter(Boolean)
    .slice(0, 20);
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { emails?: unknown };
  const emails = normalizeEmails(body.emails);

  if (emails.length === 0) {
    return Response.json(
      { error: "Przeslij JSON w formacie { emails: string[] }." },
      { status: 400 },
    );
  }

  const prompt = emails
    .map((email, index) => `MAIL ${index + 1}\n${email}`)
    .join("\n\n---\n\n");

  const result = streamText({
    model: google("gemini-3.1-flash-lite"),
    system: systemPrompt,
    prompt,
  });

  return result.toTextStreamResponse({
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
