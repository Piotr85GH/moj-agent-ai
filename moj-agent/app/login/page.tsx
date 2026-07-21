"use client";

import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabase";

type AuthMode = "sign-in" | "sign-up";

export default function LoginPage() {
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!email.trim() || !password || isSubmitting) {
      return;
    }

    setError("");
    setStatus("");
    setIsSubmitting(true);

    const credentials = {
      email: email.trim(),
      password,
    };
    const result =
      mode === "sign-up"
        ? await supabase.auth.signUp(credentials)
        : await supabase.auth.signInWithPassword(credentials);

    if (result.error) {
      setError(result.error.message);
      setIsSubmitting(false);
      return;
    }

    if (result.data.user) {
      await supabase.from("user_profiles").upsert(
        {
          id: result.data.user.id,
          display_name: null,
          preferences: {},
        },
        { onConflict: "id", ignoreDuplicates: true },
      );
    }

    if (mode === "sign-up" && !result.data.session) {
      setStatus("Konto utworzone. Sprawdz email i potwierdz rejestracje.");
    } else {
      setStatus("Zalogowano. Przenosze do aplikacji...");
    }

    setIsSubmitting(false);
  }

  const isSignUp = mode === "sign-up";

  return (
    <main className="login-shell">
      <section className="login-panel" aria-label="Logowanie">
        <div className="login-copy">
          <span>Agent AI</span>
          <h1>{isSignUp ? "Utworz konto" : "Zaloguj sie"}</h1>
          <p>Rozmowy i dokumenty sa widoczne tylko dla zalogowanego konta.</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            <span>Email</span>
            <input
              autoComplete="email"
              disabled={isSubmitting}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="jan@example.com"
              type="email"
              value={email}
            />
          </label>

          <label>
            <span>Haslo</span>
            <input
              autoComplete={isSignUp ? "new-password" : "current-password"}
              disabled={isSubmitting}
              minLength={6}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Minimum 6 znakow"
              type="password"
              value={password}
            />
          </label>

          <button
            className="login-submit"
            disabled={isSubmitting || !email.trim() || password.length < 6}
            type="submit"
          >
            {isSubmitting
              ? "Przetwarzam..."
              : isSignUp
                ? "Zarejestruj sie"
                : "Zaloguj sie"}
          </button>

          <button
            className="login-mode"
            disabled={isSubmitting}
            onClick={() => {
              setMode(isSignUp ? "sign-in" : "sign-up");
              setError("");
              setStatus("");
            }}
            type="button"
          >
            {isSignUp ? "Mam juz konto" : "Nie mam konta"}
          </button>

          {status && <p className="login-status">{status}</p>}
          {error && <p className="login-error">{error}</p>}
        </form>
      </section>
    </main>
  );
}
