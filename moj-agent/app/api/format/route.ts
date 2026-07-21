import { google } from "@ai-sdk/google";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  toUIMessageStream,
  type ModelMessage,
  type TextStreamPart,
  type UIMessage,
} from "ai";

export const maxDuration = 30;

type ChatModel = "flash" | "pro";

const chatModels: Record<ChatModel, readonly string[]> = {
  flash: ["gemini-3.1-flash-lite"],
  pro: ["gemini-3.1-flash-lite"],
};

const systemPrompt = `
Jestes asystentem ktory formatuje odpowiedzi wedlug instrukcji uzytkownika.

Rozpoznajesz komendy formatu na poczatku wiadomosci:

/tabela [temat] - odpowiedz w formie tabeli markdown
  Kolumny dobierz do tematu. Minimum 3 kolumny, 5 wierszy.
  Przyklad: /tabela porownanie frameworkow JavaScript

/lista [temat] - odpowiedz jako lista numerowana z opisami
  Kazdy punkt: numer + naglowek (bold) + 1 zdanie opisu
  Przyklad: /lista 10 zasad dobrego kodu

/porownanie [A] vs [B] - tabela porownawcza dwoch rzeczy
  Kolumny: Aspekt | [A] | [B] | Werdykt
  Minimum 6 aspektow + wiersz podsumowania
  Przyklad: /porownanie React vs Vue

/faq [temat] - lista pytan i odpowiedzi
  Format: **Q:** pytanie (bold) -> **A:** odpowiedz
  Minimum 5 par Q&A
  Przyklad: /faq praca zdalna

/email [opis] - napisz profesjonalny email
  Format: Temat | Od/Do | Tresc | Podpis
  Przyklad: /email prosba o urlop na 2 tygodnie

Jesli wiadomosc NIE zaczyna sie od komendy - odpowiadaj normalnie,
ale w czystym, czytelnym markdown.

ZAWSZE formatuj w markdown (naglowki, pogrubienia, tabele, listy).
`;

function getChatModel(model: unknown): ChatModel {
  if (model === "pro" || model === "flash") {
    return model;
  }

  return "flash";
}

function streamTextWithFallback({
  messages,
  model,
  system,
}: {
  messages: ModelMessage[];
  model: ChatModel;
  system: string;
}) {
  let modelIndex = 0;
  let reader: ReadableStreamDefaultReader<TextStreamPart<any>> | undefined;
  let didStartStreaming = false;
  const modelChain = chatModels[model];

  return new ReadableStream<TextStreamPart<any>>({
    async pull(controller) {
      while (modelIndex < modelChain.length) {
        if (!reader) {
          const result = streamText({
            model: google(modelChain[modelIndex]),
            system,
            messages,
            stopWhen: stepCountIs(3),
          });

          reader = result.stream.getReader();
        }

        try {
          const { done, value } = await reader.read();

          if (done) {
            controller.close();
            return;
          }

          didStartStreaming = true;
          controller.enqueue(value);
          return;
        } catch (error) {
          await reader.cancel().catch(() => undefined);
          reader = undefined;

          if (didStartStreaming || modelIndex === modelChain.length - 1) {
            controller.error(error);
            return;
          }

          modelIndex += 1;
        }
      }

      controller.close();
    },
    async cancel() {
      await reader?.cancel().catch(() => undefined);
    },
  });
}

export async function POST(req: Request) {
  const {
    messages,
    model,
  }: { messages: UIMessage[]; model?: ChatModel } = await req.json();
  const chatModel = getChatModel(model);
  const modelMessages = await convertToModelMessages(messages);

  const stream = streamTextWithFallback({
    model: chatModel,
    system: systemPrompt,
    messages: modelMessages,
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream, originalMessages: messages }),
  });
}
