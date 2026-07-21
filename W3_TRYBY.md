# Warsztat 3: Dodaj tryby rozmowy

> 📋 **Skopiuj i wklej do AI assistanta:**
> *"Przeczytaj plik W3_TRYBY.md i dodaj przełącznik trybów do mojego chatbota"*

## Cel
Agent ma 3 tryby: Casual, Ekspert, Kreatywny. Użytkownik przełącza tryb w interfejsie — agent zmienia styl odpowiedzi.

## Co budujemy

### 1. Trzy system prompty w API

W pliku `app/api/chat/route.ts`:

Stwórz obiekt z trzema wariantami system prompta. Bazuj na personie z Warsztatu 2, ale zmień styl:

```
CASUAL:
"[Persona z W2]. Odpowiadaj luźno, jak do kolegi. Skróty myślowe OK.
Emoji dozwolone. Krótko — max 2 zdania na punkt. Możesz żartować."

EKSPERT:
"[Persona z W2]. Odpowiadaj formalnie i szczegółowo.
Podawaj dane, źródła (nawet przybliżone). Strukturyzuj:
Definicja → Analiza → Rekomendacja. Profesjonalny ton."

KREATYWNY:
"[Persona z W2]. Odpowiadaj w sposób kreatywny i nieszablonowy.
Używaj metafor, analogii, storytellingu. Podawaj nieoczywiste perspektywy.
Zaskakuj. Inspiruj."
```

### 2. Endpoint przyjmuje tryb

API powinno przyjmować parametr `mode` z body requestu (domyślnie "casual") i wybierać odpowiedni system prompt.

### 3. Przełącznik trybów w interfejsie

W `app/page.tsx` dodaj nad polem wiadomości 3 przyciski:

- 💬 Casual (domyślny, podświetlony)
- 🎓 Ekspert
- 🎨 Kreatywny

Kliknięcie zmienia aktywny tryb. Aktywny przycisk ma wyróżniony styl (np. kolorowe tło, border). Tryb jest wysyłany do API z każdą wiadomością.

### 4. Wizualne rozróżnienie

Przy wiadomości AI pokaż mały badge z aktualnym trybem, np.:
- `💬 casual` — szary badge
- `🎓 ekspert` — niebieski badge  
- `🎨 kreatywny` — fioletowy badge

## Oczekiwany rezultat

- 3 przyciski trybów w interfejsie
- Kliknięcie zmienia styl odpowiedzi agenta
- To samo pytanie w 3 trybach = 3 różne odpowiedzi
- Badge przy wiadomości pokazuje tryb

## Test

Zadaj to samo pytanie we wszystkich 3 trybach, np.:
"Jak zacząć uczyć się programowania?"

- Casual → 2-3 zdania, luźno, z emoji
- Ekspert → szczegółowa analiza, kroki, źródła  
- Kreatywny → metafory, inspiracja, nieoczywista perspektywa

Różnica powinna być WYRAŹNA.
