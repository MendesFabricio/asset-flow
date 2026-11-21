import type { NextConfig } from "next";

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
