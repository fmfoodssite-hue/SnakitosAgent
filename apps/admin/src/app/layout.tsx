import type { Metadata } from "next";
import "./globals.css";
import AdminChrome from "@/components/AdminChrome";


export const metadata: Metadata = {
  title: "Admin Dashboard | Snakitos Agent",
  description: "Manage your AI shopping assistant and store operations.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="admin-shell bg-[#09090b] text-zinc-100 antialiased">
        <AdminChrome>{children}</AdminChrome>
      </body>
    </html>
  );
}
