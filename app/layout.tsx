import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Суфлер",
  description: "Помощник для сложных звонков на итальянском",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Суфлер",
  },
  icons: {
    icon: "/icon.svg",
    apple: [
      { url: "/icon-192.png", sizes: "192x192" },
      { url: "/icon-512.png", sizes: "512x512" },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#09090b",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" className="dark">
      <body className="bg-cb-bg text-cb-text antialiased">
        {children}
        <footer className="fixed bottom-0 left-0 right-0 flex items-center justify-center gap-3 py-1.5 text-[10px] text-zinc-700 pointer-events-none z-10">
          <span>© {new Date().getFullYear()} Все права защищены</span>
          <span>·</span>
          <a
            href="https://github.com/b102e"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-zinc-500 transition-colors duration-150 pointer-events-auto"
          >
            b102e
          </a>
        </footer>
      </body>
    </html>
  );
}
