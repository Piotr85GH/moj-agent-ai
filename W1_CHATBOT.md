# Warsztat 1: Zbuduj chatbota AI od zera

> 📋 **Skopiuj i wklej do swojego AI coding assistanta:**
> *"Przeczytaj plik W1_CHATBOT.md i zbuduj wszystko co jest opisane w sekcji Krok po kroku. Mój klucz API Google: [WKLEJ KLUCZ]"*

## Cel
Stwórz aplikację webową z interfejsem czatu podłączonym do modelu AI.

## Stack techniczny
- Next.js (najnowsza wersja, App Router)
- Vercel AI SDK (`ai`, `@ai-sdk/react`, `@ai-sdk/google`)
- Provider: Google Generative AI (Gemini)

## Krok po kroku

### 1. Stwórz nowy projekt
- Użyj `npx create-next-app@latest moj-agent` z TypeScript i App Router
- Zainstaluj: `npm install ai @ai-sdk/react @ai-sdk/google`

### 2. Plik .env.local
```
GOOGLE_GENERATIVE_AI_API_KEY=tutaj_wklej_swoj_klucz
```

### 3. API endpoint: `app/api/chat/route.ts`
- Użyj `streamText` z Vercel AI SDK
- Model: `gemini-3.5-flash` z `@ai-sdk/google` 
- System prompt: "Jesteś pomocnym asystentem AI. Odpowiadaj po polsku, zwięźle i konkretnie."
- Zwróć streaming response

### 4. Strona główna: `app/page.tsx`
- Użyj hooka `useChat` z `@ai-sdk/react` (komponent "use client")
- Elementy interfejsu:
  - Nagłówek z nazwą "Mój Agent AI" i emoji 🤖
  - Lista wiadomości (user = wyrównane prawo, assistant = wyrównane lewo)
  - Pole input na dole + przycisk "Wyślij"
  - Auto-scroll do ostatniej wiadomości
- Obsłuż stan ładowania (pokaż "Myślę..." gdy agent generuje)

### 5. Styl
- Ciemny motyw: tło `#0a0a0a`, tekst `#ededed`
- Wiadomości usera: tło `#2a2a3a`, zaokrąglone rogi
- Wiadomości AI: tło `#1a1a2a`, border `#333`
- Font: system-ui lub Inter
- Responsywny layout (max-width: 800px, wyśrodkowany)

## Oczekiwany rezultat
Po `npm run dev` na `http://localhost:3000`:
- Widzę interfejs czatu
- Wpisuję pytanie → dostaję odpowiedź od AI po polsku
- Odpowiedź pojawia się płynnie (streaming)
- Interfejs jest czytelny i estetyczny

## Testowe pytania
1. "Cześć, kim jesteś?"
2. "Wyjaśnij mi czym jest sztuczna inteligencja w 3 zdaniach"
3. "Policz ile to 247 * 38"
