import type { Metadata, Viewport } from "next";
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
    index: false,
    follow: false,
  },
  openGraph: {
    title: 'AssetFlow Pro | Gestão Inteligente de Carteira',
    description: 'Controle de patrimônio, dividendos, renda fixa e análise quantitativa avançada com IA.',
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

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0b0f19' },
    { media: '(prefers-color-scheme: light)', color: '#f8fafc' },
  ],
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
      if (document.body) document.body.classList.add('light-theme');
      root.classList.remove('dark');
    } else {
      root.setAttribute('data-theme', 'dark');
      root.classList.remove('light-theme');
      if (document.body) document.body.classList.remove('light-theme');
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
      <body className={`${GeistSans.variable} ${GeistMono.variable} font-sans antialiased bg-surface text-text-primary transition-colors duration-300`}>
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
