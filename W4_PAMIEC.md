# Warsztat 4: Agent z pamięcią konwersacji

> 📋 **Skopiuj i wklej do AI assistanta:**
> *"Przeczytaj plik W4_PAMIEC.md i dodaj pamięć konwersacji do mojego chatbota"*

## Cel
Agent pamięta wcześniejsze wiadomości w rozmowie. Nawiązuje do tego co powiedział użytkownik. Potrafi podsumować rozmowę.

## Co budujemy

### 1. Widoczna pamięć w interfejsie

W `app/page.tsx` dodaj nad czatem sekcję "Kontekst rozmowy":

- Mały panel (zwijany) pokazujący ile wiadomości jest w konwersacji
- Przycisk "🗑 Nowa rozmowa" — czyści historię
- Licznik: "Wiadomości: X | ~Tokeny: Y" (przybliżony licznik: ilość znaków / 4)

### 2. Ulepszony system prompt z instrukcją pamięci

W API dodaj do system prompta sekcję o pamięci:

```
## PAMIĘĆ
- Pamiętasz CAŁĄ rozmowę od początku
- Nawiązuj do wcześniejszych wiadomości gdy to istotne
- Jeśli użytkownik zmienia temat — zaakceptuj, ale możesz nawiązać do wcześniejszego
- Gdy użytkownik powie "podsumuj" — streszczenie CAŁEJ rozmowy w punktach
- Zwracaj się do użytkownika konsekwentnie (jeśli podał imię — używaj go)
```

### 3. Komenda "podsumuj"

Dodaj instrukcję w system prompcie:

```
Gdy użytkownik napisze "podsumuj" lub "co ustaliliśmy":
- Wypisz główne tematy rozmowy
- Wymień kluczowe ustalenia/odpowiedzi
- Zaproponuj co jeszcze możesz pomóc
Format: numerowana lista
```

### 4. Przycisk eksportu rozmowy

W interfejsie dodaj przycisk "📋 Eksportuj rozmowę" który:
- Kopiuje całą historię do schowka (clipboard) jako tekst
- Format: "User: ... \n Agent: ... \n User: ..."  
- Pokazuje chwilowe potwierdzenie "Skopiowano!"

## Oczekiwany rezultat
- Agent nawiązuje do wcześniejszych wiadomości
- Panel z licznikiem wiadomości i tokenów
- "Podsumuj" → streszczenie konwersacji
- Przycisk eksportu kopiuje rozmowę
- Przycisk "Nowa rozmowa" czyści historię

## Test (prowadź taką rozmowę)

1. "Cześć, mam na imię Anna" → agent powinien użyć imienia
2. "Interesuję się marketingiem" → agent odpowiada w temacie
3. "Wracając do mojego imienia — pamiętasz je?" → powinien powiedzieć "Anna"
4. "Podsumuj naszą rozmowę" → streszczenie w punktach
5. Kliknij "Eksportuj" → sprawdź schowek
