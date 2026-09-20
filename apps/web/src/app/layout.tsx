import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies, headers } from "next/headers";
import "./globals.css";
import { Providers } from "./providers";
import { AppShell } from "@/components/app-shell";
import {
  LOCALE_COOKIE,
  intlLocale,
  isLocale,
  negotiateLocale,
} from "@/lib/i18n";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Siphon",
  description:
    "Self-hosted media downloader: pick your quality, watch progress live, keep an organised library.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Resolve the locale on the server so the first paint is already correct.
  // Cookie wins; otherwise fall back to the browser's Accept-Language.
  const stored = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(stored)
    ? stored
    : negotiateLocale((await headers()).get("accept-language"));

  return (
    <html
      lang={intlLocale(locale)}
      // next-themes writes the theme class on <html> before paint, which the
      // server cannot predict — this is the documented way to allow it.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <Providers locale={locale}>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
