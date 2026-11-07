import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
// 👇 IMPORTANTE: Importar o Provider que vamos criar
import { PrivacyProvider } from "./context/PrivacyContext";
import { ThemeProvider } from "./context/ThemeContext";
import { ToastProvider } from "./context/ToastContext";

export const metadata: Metadata = {
  title: 'AssetFlow Pro | Gestão Inteligente de Investimentos & Carteira',
  description: 'Controle completo de patrimônio, dividendos, análise quantitativa e rebalanceamento inteligente de carteira com IA.',
  keywords: ['investimentos', 'carteira', 'dividendos', 'ações', 'FIIs', 'renda fixa', 'rebalanceamento', 'gestão patrimonial'],
  authors: [{ name: 'AssetFlow Team' }],
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: 'AssetFlow Pro | Gestão Inteligente de Carteira',
    description: 'Controle de patrimônio, dividendos, renda fixa, cartões e análise quantitativa avançada com IA.',
    url: 'https://assetflowpro.duckdns.org',
    siteName: 'AssetFlow Pro',
    locale: 'pt_BR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AssetFlow Pro | Gestão Inteligente de Carteira',
    description: 'Plataforma inteligente de controle financeiro e rebalanceamento de carteira.',
  },
};

const themeInitScript = `
(function () {
  try {
    var saved = localStorage.getItem('assetflow_theme');
    var mode = (saved === 'light' || saved === 'dark') ? saved : 'dark';
    var root = document.documentElement;
    if (mode === 'light') {
      root.setAttribute('data-theme', 'light');
      root.classList.add('light-theme');
      document.body.classList.add('light-theme');
      root.classList.remove('dark');
    } else {
      root.setAttribute('data-theme', 'dark');
      root.classList.remove('light-theme');
      document.body.classList.remove('light-theme');
      root.classList.add('dark');
    }
  } catch (e) { console.error('Error applying theme', e); }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        {process.env.NEXT_PUBLIC_API_URL && <link rel="preconnect" href={process.env.NEXT_PUBLIC_API_URL} />}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={`${GeistSans.variable} ${GeistMono.variable} font-sans antialiased bg-[#0b0f19] text-slate-200 transition-colors duration-300`}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[200] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-blue-600 focus:text-white focus:font-semibold focus:shadow-lg"
        >
          Pular para o conteúdo
        </a>
        <ThemeProvider>
          <PrivacyProvider>
            <ToastProvider>
              {children}
            </ToastProvider>
          </PrivacyProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
