import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16 bloqueia recursos de dev por cross-origin. Os hosts abaixo sao os
  // mesmos das labels do Traefik em docker-compose.dev.yml.
  allowedDevOrigins: [
    'assetflow.localhost',
    'assetflow.192.168.3.11.nip.io',
    'assetflow.100.102.199.1.nip.io',
  ],
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
    const backendUrl = process.env.BACKEND_URL || 'http://backend:5328';
    return [
      {
        source: '/api/:path((?!sync/stream|ai/chat|auth/login|auth/logout|auth/register).*)',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
  output: "standalone",
  turbopack: {},
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts'],
  },
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

export default nextConfig;
