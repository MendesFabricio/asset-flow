import type { Metadata } from "next";
import { Inter } from "next/font/google"; 
import "./globals.css";
// 👇 IMPORTANTE: Importar o Provider que vamos criar
import { PrivacyProvider } from "./context/PrivacyContext";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: 'AssetFlow Pro | Gestão Inteligente',
  description: 'Controle de patrimônio, dividendos e rebalanceamento de carteira.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} antialiased bg-[#0b0f19] text-slate-200`}>
        {/* 👇 Envolvemos todo o site com o Provider de Privacidade */}
        <PrivacyProvider>
          {children}
        </PrivacyProvider>
      </body>
    </html>
  );
}
