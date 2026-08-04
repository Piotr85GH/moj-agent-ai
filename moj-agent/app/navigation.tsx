"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "./auth-provider";

const navItems = [
  { href: "/", icon: "\u{1F3E0}", label: "Dashboard" },
  { href: "/chat", icon: "\u{1F4AC}", label: "Chat" },
  { href: "/briefings", icon: "\u{1F4F0}", label: "Briefingi" },
  { href: "/history", icon: "\u{1F4DC}", label: "Historia" },
  { href: "/upload", icon: "\u{1F4DA}", label: "Baza wiedzy" },
  { href: "/think", icon: "\u{1F9E0}", label: "Myslenie" },
  { href: "/search", icon: "\u{1F310}", label: "Szukaj" },
  { href: "/extract", icon: "\u{1F4CA}", label: "Analizator" },
  { href: "/format", icon: "\u{1F4D0}", label: "Formater" },
  { href: "/agent", icon: "\u{1F916}", label: "Agent" },
  { href: "/react", icon: "\u{1F504}", label: "ReAct" },
  { href: "/email-triage", icon: "\u{1F4E7}", label: "E-mail Triage" },
  { href: "/report", icon: "\u{1F4CA}", label: "Raporty" },
  { href: "/competitor", icon: "\u{1F3E2}", label: "Konkurencja" },
  { href: "/social", icon: "\u{1F4F1}", label: "Posty" },
  { href: "/przepisomat", icon: "\u{1F37D}\u{FE0F}", label: "Przepisomat" },
  { href: "/travel", icon: "\u{2708}\u{FE0F}", label: "Podroze" },
  { href: "/generate", icon: "\u{1F3A8}", label: "Grafiki" },
  { href: "/vision", icon: "\u{1F441}\u{FE0F}", label: "Vision" },
  { href: "/fewshot", icon: "\u{1F4D6}", label: "Slownik AI" },
  { href: "/admin/security", icon: "\u{1F6E1}\u{FE0F}", label: "Security" },
  { href: "/admin/dashboard", icon: "\u{1F4CA}", label: "Admin Dashboard" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/" || pathname === "/dashboard";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Navigation() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("nexus-theme");
    const initialTheme = storedTheme === "light" ? "light" : "dark";

    setTheme(initialTheme);
    document.documentElement.dataset.theme = initialTheme;
  }, []);

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";

    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("nexus-theme", nextTheme);
  }

  if (!user || pathname === "/login") {
    return null;
  }

  return (
    <>
      <button
        aria-expanded={open}
        aria-label="Otworz menu"
        className="mobile-menu-button"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        {"\u2630"}
      </button>
      {open && (
        <button
          aria-label="Zamknij menu"
          className="mobile-nav-backdrop"
          onClick={() => setOpen(false)}
          type="button"
        />
      )}
      <nav className={`side-nav ${open ? "open" : ""}`} aria-label="Glowne">
        <div className="side-nav-brand">
          <strong>Agent AI</strong>
          <span>{user?.email ?? "Centrum dowodzenia"}</span>
        </div>
        <div className="side-nav-links">
          {navItems.map((item) => (
            <Link
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
              className={isActive(pathname, item.href) ? "active" : ""}
              href={item.href}
              key={item.href}
              onClick={() => setOpen(false)}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </div>
        <button
          aria-label={
            theme === "dark" ? "Przelacz na jasny motyw" : "Przelacz na ciemny motyw"
          }
          className="side-nav-theme"
          onClick={toggleTheme}
          type="button"
        >
          <span>{theme === "dark" ? "\u2600\uFE0F" : "\u{1F319}"}</span>
          {theme === "dark" ? "Jasny motyw" : "Ciemny motyw"}
        </button>
        <button
          className="side-nav-signout"
          onClick={() => {
            void signOut();
          }}
          type="button"
        >
          Wyloguj
        </button>
      </nav>
    </>
  );
}
