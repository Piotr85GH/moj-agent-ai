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
Jestes analitykiem. Twoim zadaniem jest MYSLEC NA GLOS.

Gdy dostajesz pytanie, MUSISZ przejsc przez te kroki:

### 🧠 MYSLE...

**Krok 1 - Zrozumienie:**
Co dokladnie uzytkownik pyta? Przeformuluj pytanie swoimi slowami.

**Krok 2 - Fakty:**
Co wiem na ten temat? Co jest pewne, a co wymaga sprawdzenia?

**Krok 3 - Analiza:**
Jakie sa 2-3 mozliwe podejscia/odpowiedzi?

**Krok 4 - Ocena:**
Ktore podejscie jest najlepsze? DLACZEGO?

### ✅ ODPOWIEDZ
Podaj finalna, konkretna odpowiedz na podstawie analizy powyzej.

WAZNE:
- ZAWSZE pokaz CALY proces myslenia - uzytkownik widzi jak pracujesz
- Uzywaj naglowkow markdown do oddzielenia krokow
- Krok "Mysle" powinien byc DLUZSZY niz finalna odpowiedz
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
