# Warsztat 0: Twój pierwszy klucz do AI

> 📋 **Skopiuj i wklej do swojego AI coding assistanta:**
> *"Przeczytaj plik W0_SETUP.md i pomóż mi przygotować środowisko. Sprawdź czy mam wszystko zainstalowane."*

Za chwilę zrobisz coś, co do niedawna robili tylko programiści — **uzyskasz dostęp do prawdziwego modelu AI przez API**. To ten sam model który napędza Google Gemini. Ty będziesz go kontrolować kodem.

## Co potrzebujesz

### 1. Node.js (wymagane)

Node.js to program który pozwala uruchamiać aplikacje webowe na Twoim komputerze.

**Sprawdź czy masz:**
1. Otwórz **terminal** (program do wpisywania komend):
   - **Windows:** wciśnij `Win + R`, wpisz `cmd`, kliknij OK
   - **Mac:** otwórz Spotlight (`Cmd + Spacja`), wpisz `Terminal`, Enter
2. Wpisz: `node --version` i wciśnij Enter

**Widzisz** `v18.x.x` lub wyżej? → Masz Node.js, idź do kroku 2.

**Widzisz błąd?** → Zainstaluj:
1. Otwórz przeglądarkę → wejdź na **nodejs.org**
2. Kliknij duży zielony przycisk **LTS** (pobierze się plik instalacyjny)
3. Otwórz pobrany plik → klikaj **Next → Next → Finish**
4. **WAŻNE:** zamknij terminal i otwórz go ponownie
5. Wpisz `node --version` — teraz powinno pokazać numer wersji

### 2. Klucz API Google AI Studio (wymagane, darmowe, bez karty)

Klucz API to "hasło" które pozwala Twojej aplikacji rozmawiać z modelem AI Google.

1. Otwórz przeglądarkę → wejdź na **aistudio.google.com**
2. Zaloguj się kontem Google (tym samym co Gmail)
3. Kliknij **"Get API Key"** (u góry strony)
4. Kliknij **"Create API key"**
5. Skopiuj klucz (długi ciąg znaków) i wklej go gdzieś do siebie — np. w Notatnik
6. **Nie udostępniaj klucza nikomu!** To jak hasło do Twojego konta.

### 3. AI coding assistant (jedno z poniższych — masz z wymagań kursu)

| Narzędzie | Jak uruchomić |
|-----------|---------------|
| **Claude Code** | Otwórz terminal → wpisz `claude` |
| **Antigravity** | Otwórz VS Code lub Cursor → Antigravity jest wbudowany |
| **Codex (GitHub)** | Otwórz github.com → kliknij "Open in Codex" |

### 4. Pliki warsztatowe (ten folder)

Pobierz plik ZIP z materiałami (link od prowadzącego) i rozpakuj go:
- **Windows:** kliknij prawym → "Wyodrębnij wszystkie"
- **Mac:** kliknij dwukrotnie na ZIP

## Weryfikacja — poproś AI coding assistanta

Wklej ten prompt do swojego AI assistanta:

```
Sprawdź moje środowisko:
1. Uruchom: node --version (potrzebuję 18+)
2. Uruchom: npm --version  
3. Stwórz pusty folder "moj-agent" i wejdź do niego
4. Uruchom: npm init -y
5. Zainstaluj: npm install next@latest react react-dom ai @ai-sdk/react @ai-sdk/google
6. Stwórz plik .env.local z treścią: GOOGLE_GENERATIVE_AI_API_KEY=tutaj_wklej_klucz
7. Powiedz mi czy wszystko się zainstalowało poprawnie

Jeśli coś nie działa — powiedz mi co zrobić.
```

## Oczekiwany rezultat

Po tym kroku masz:
- ✅ Node.js 18+
- ✅ Klucz API Google (w .env.local)
- ✅ Folder `moj-agent` z zainstalowanymi pakietami
- ✅ AI coding assistant gotowy do pracy

**Jeśli masz to wszystko → przejdź do W1_CHATBOT.md**

---

## Jak samodzielnie uruchomić agenta (po warsztatach)

Gdy chcesz wrócić do swojego agenta po zajęciach:

1. Otwórz terminal (tak jak w kroku 1 powyżej)
2. Wejdź do folderu projektu — wpisz i naciśnij Enter:
   ```
   cd moj-agent
   ```
   (`cd` = "change directory" — przechodzisz do folderu)
3. Uruchom agenta:
   ```
   npm run dev
   ```
4. Otwórz przeglądarkę i wejdź na: **http://localhost:3000**
5. Gotowe — Twój agent działa!

**Zatrzymanie agenta:** wciśnij `Ctrl + C` w terminalu.

**Ponowne uruchomienie:** powtórz kroki 1-4.
