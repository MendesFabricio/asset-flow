import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'raw.githubusercontent.com',
        pathname: '/thefintz/icones-b3/main/icones/**',
      },
    ],
  },

  async rewrites() {
    return [
      {
        source: '/api/:path((?!sync/stream|ai/chat).*)',
        destination: 'http://backend:5328/api/:path*',
      },
    ];
  },
  output: "standalone",
  experimental: {
    // Para aceitar qualquer subdomínio do ngrok no modo de desenvolvimento
    allowedRevalidateHeaderKeys: ['x-vercel-protection-bypass'],
    optimizePackageImports: ['lucide-react', 'recharts'],
  },
  // Liberar o acesso de cross-origin resources do Ngrok para os assets carregarem
  allowedDevOrigins: [process.env.NGROK_DOMAIN || 'jorge-craftless-questionably.ngrok-free.dev'],
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
      };
    }
    return config;
  },
};

export default withSentryConfig(nextConfig, {
  org: "assetflow",
  project: "assetflow-frontend",
  silent: true,
  widenClientFileUpload: true,
  sourcemaps: { disable: true },
  disableLogger: true,
  automaticVercelMonitors: false,
});
