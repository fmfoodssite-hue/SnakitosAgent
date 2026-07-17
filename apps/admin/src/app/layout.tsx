import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/components/providers/AppProviders";
import { AdminShell } from "@/components/layout/AdminShell";

export const dynamic = "force-dynamic";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Snakitos RAG Control Center",
  description: "Production-style control center for the Snakitos RAG chatbot, knowledge operations, and support workflows.",
};

const themeBootstrapScript = `
try {
  var storageKey = "snakitos-admin-theme";
  var legacyKey = "theme";
  var isLoginPath = window.location.pathname === "/login" || window.location.pathname.endsWith("/login");
  if (isLoginPath) {
    document.documentElement.classList.remove("dark");
    document.documentElement.classList.add("light");
    document.documentElement.style.colorScheme = "light";
  } else {
  var savedTheme = localStorage.getItem(storageKey) || localStorage.getItem(legacyKey);
  if (savedTheme !== "dark" && savedTheme !== "light") {
    savedTheme = "light";
  }
  localStorage.setItem(storageKey, savedTheme);
  document.documentElement.classList.remove(savedTheme === "dark" ? "light" : "dark");
  document.documentElement.classList.add(savedTheme);
  document.documentElement.style.colorScheme = savedTheme;
  }
} catch (_) {
  document.documentElement.classList.add("light");
  document.documentElement.style.colorScheme = "light";
}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body className="antialiased">
        <AppProviders>
          <AdminShell>{children}</AdminShell>
        </AppProviders>
      </body>
    </html>
  );
}
