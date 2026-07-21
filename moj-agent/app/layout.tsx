import type { Metadata } from "next";
import { Navigation } from "./navigation";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent AI - Centrum dowodzenia",
  description: "Dashboard i agenty AI z prawdziwymi narzedziami.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Navigation />
        <div className="app-content">{children}</div>
      </body>
    </html>
  );
}
