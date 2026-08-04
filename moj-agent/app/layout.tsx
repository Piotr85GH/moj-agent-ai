import type { Metadata, Viewport } from "next";
import { AuthProvider } from "./auth-provider";
import { Navigation } from "./navigation";
import { PwaInstaller } from "./pwa-installer";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nexus AI - Twoj osobisty asystent",
  description:
    "Agent AI z baza wiedzy, pamiecia rozmow, automatyzacjami i dashboardem uzycia.",
  applicationName: "Nexus AI",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Nexus AI",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icon-512.png", sizes: "512x512", type: "image/png" }],
  },
  openGraph: {
    title: "Nexus AI",
    description: "Twoj osobisty asystent AI z baza wiedzy i pamiecia rozmow.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Nexus AI - osobisty asystent AI",
      },
    ],
    siteName: "Nexus AI",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Nexus AI",
    description: "Twoj osobisty asystent AI z baza wiedzy i pamiecia rozmow.",
    images: ["/og-image.png"],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
    { media: "(prefers-color-scheme: light)", color: "#f6f8fb" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <AuthProvider>
          <Navigation />
          <div className="app-content">{children}</div>
          <PwaInstaller />
        </AuthProvider>
      </body>
    </html>
  );
}
