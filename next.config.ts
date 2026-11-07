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
        source: '/api/:path((?!sync/stream|ai/chat|auth).*)',
        destination: 'http://backend:5328/api/:path*',
      },
    ];
  },
  output: "standalone",
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

export default withSentryConfig(nextConfig, {
  org: "assetflow",
  project: "assetflow-frontend",
  silent: true,
  widenClientFileUpload: true,
  sourcemaps: { disable: true },
  disableLogger: true,
  automaticVercelMonitors: false,
});
