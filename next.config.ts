import type { NextConfig } from "next";

const filegatorInternalUrl = (
  process.env.FILEGATOR_INTERNAL_URL ?? "http://127.0.0.1:8088"
).replace(/\/+$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/app/filegator",
        destination: `${filegatorInternalUrl}/`,
      },
      {
        source: "/app/filegator/:path*",
        destination: `${filegatorInternalUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
