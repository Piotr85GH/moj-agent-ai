"use client";

import Link from "next/link";
import { useAuth } from "./auth-provider";
import DashboardPage from "./dashboard/page";

const features = [
  {
    title: "Pamięta Twoje rozmowy",
    text: "Wraca do kontekstu, historii i wcześniejszych decyzji bez zaczynania od zera.",
  },
  {
    title: "Zna dokumenty firmy",
    text: "Odpowiada na podstawie Twojej bazy wiedzy, procedur, ofert i notatek.",
  },
  {
    title: "Chroni dane per user",
    text: "Każdy użytkownik pracuje na własnym profilu, historii i prywatnych dokumentach.",
  },
  {
    title: "Pracuje 24/7",
    text: "Automatyczne briefingi, raporty i zadania cykliczne pomagają, zanim o nie poprosisz.",
  },
];

const proofItems = [
  "Chat z pamięcią profilu",
  "Baza wiedzy i wyszukiwanie",
  "Raporty, podróże, grafiki i research",
];

function LandingPage() {
  return (
    <main className="landing-shell">
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero-copy">
          <span className="landing-kicker">Agent AI dla codziennej pracy</span>
          <h1 id="landing-title">Nexus AI</h1>
          <p>
            Twój osobisty asystent AI z pamięcią rozmów, bazą wiedzy firmy i
            narzędziami, które zamieniają pytania w gotowe działania.
          </p>
          <div className="landing-actions">
            <Link className="landing-primary" href="/login">
              Zacznij za darmo
            </Link>
            <a className="landing-secondary" href="#demo">
              Zobacz demo
            </a>
          </div>
        </div>

        <div className="landing-showcase" aria-label="Screenshoty aplikacji">
          <div className="landing-window landing-window-main">
            <div className="landing-window-bar">
              <span />
              <span />
              <span />
            </div>
            <div className="landing-chat-preview">
              <p className="landing-message user">
                Zapytaj o cennik wdrożenia dla małej firmy.
              </p>
              <p className="landing-message assistant">
                W Twoich dokumentach znalazłem trzy pakiety. Dla małej firmy
                najlepiej pasuje Start: onboarding, baza wiedzy i 2 automatyzacje.
              </p>
            </div>
          </div>
          <div className="landing-window landing-window-side">
            <strong>Baza wiedzy</strong>
            <span>Oferta_2026.pdf</span>
            <span>FAQ_sprzedaz.md</span>
            <span>Procedury_supportu.docx</span>
          </div>
        </div>
      </section>

      <section className="landing-features" aria-label="Możliwości agenta">
        {features.map((feature) => (
          <article key={feature.title}>
            <h2>{feature.title}</h2>
            <p>{feature.text}</p>
          </article>
        ))}
      </section>

      <section className="landing-demo" id="demo" aria-labelledby="demo-title">
        <div>
          <span className="landing-kicker">Demo</span>
          <h2 id="demo-title">
            Zapytaj o cennik, a agent odpowie z Twoich dokumentów.
          </h2>
          <p>
            Nexus AI łączy rozmowę, prywatny profil użytkownika i firmową bazę
            wiedzy w jednym spokojnym miejscu do pracy.
          </p>
        </div>
        <div className="landing-proof">
          {proofItems.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </section>

      <section className="landing-final-cta" aria-label="Start">
        <h2>Gotowy? Zacznij w 30 sekund.</h2>
        <Link className="landing-primary" href="/login">
          Stwórz konto
        </Link>
      </section>
    </main>
  );
}

export default function HomePage() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <main className="auth-loading">
        <p>Sprawdzam logowanie...</p>
      </main>
    );
  }

  return user ? <DashboardPage /> : <LandingPage />;
}
