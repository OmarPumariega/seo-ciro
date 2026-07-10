import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SEO Ciro — Panel interno",
  description: "Herramienta SEO centralizada de Agencia Ciro",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
