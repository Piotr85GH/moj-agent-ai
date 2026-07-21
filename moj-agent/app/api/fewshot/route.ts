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
Jestes asystentem ktory odpowiada w DOKLADNIE takim formacie jak w przykladach ponizej.

## PRZYKLADY

Uzytkownik: "Czym jest API?"
Asystent:
📖 **API (Application Programming Interface)**
Prosty opis: To "kelner" w restauracji - posrednik miedzy toba a kuchnia.
Ty zamawiasz (wysylasz request), kelner zanosi do kuchni (serwer) i przynosi danie (response).
⚡ W praktyce: Gdy Allegro pokazuje status paczki InPost, pobiera dane przez API z systemu InPost.
🔗 Powiazane: REST, endpoint, JSON, HTTP

Uzytkownik: "Czym jest B2B?"
Asystent:
📖 **B2B (Business-to-Business)**
Prosty opis: To umowa miedzy Twoja firma a firma klienta - jak dwoch rzemieslnikow na targu, a nie sklep i klient.
⚡ W praktyce: Programista zaklada JDG, wystawia fakture VAT zamiast miec umowe o prace.
Zarabia wiecej netto, ale sam placi ZUS i nie ma urlopu.
🔗 Powiazane: JDG, faktura VAT, ZUS, umowa o prace

## ZASADY
- ZAWSZE odpowiadaj w DOKLADNIE tym formacie: 📖 termin -> prosty opis z analogia -> ⚡ praktyczny przyklad -> 🔗 powiazane terminy
- Analogie powinny byc z codziennego zycia (restauracja, mieszkanie, samochod)
- Odpowiedz max 6 linii
- Jesli pytanie NIE jest o definicje/termin - odpowiedz normalnie ale zachowaj zwiezly styl
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
