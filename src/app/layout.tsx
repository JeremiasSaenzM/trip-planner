import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { THEME_INIT_SCRIPT } from "@/lib/theme";

import { DemoBanner } from "./demo-banner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Trip Planner", template: "%s · Trip Planner" },
  description: "Personal planner for choir competition trips.",
  // Private app: ask search engines not to index it.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  // Let the page extend under the iPhone notch and home indicator;
  // the app shell pads itself with env(safe-area-inset-*).
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // The inline script below adds "dark" to this element's classList
      // before React hydrates, so its class attribute won't match what
      // the server rendered -- expected, not a bug, so hydration doesn't
      // need to warn about it.
      suppressHydrationWarning
    >
      <head>
        {/* Blocking and inline, not a useEffect: it must run before first
            paint to avoid a flash of the wrong theme (see theme.ts). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <DemoBanner />
        {children}
      </body>
    </html>
  );
}
