import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
// 👇 IMPORTANTE: Importar o Provider que vamos criar
import { PrivacyProvider } from "./context/PrivacyContext";
import { ThemeProvider } from "./context/ThemeContext";
import { ToastProvider } from "./context/ToastContext";

export const metadata: Metadata = {
  title: 'AssetFlow Pro | Gestão Inteligente',
  description: 'Controle de patrimônio, dividendos e rebalanceamento de carteira.',
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
  } catch (e) {}
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
        <meta name="admaven-placement" content="BqTUGqHnE" />
        <link rel="preconnect" href="http://backend:5328" />
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
