import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output keeps the Docker image small; `next start` still works for Render.
  output: "standalone",
  // Native/Node-only packages must not be bundled for the server runtime.
  serverExternalPackages: ["sharp", "pg", "pino", "yauzl", "xlsx", "jschardet", "iconv-lite"],
  // We serve our own pre-resized WebP variants from blob routes; Next's optimizer would
  // burn CPU on the free host for no gain.
  images: { unoptimized: true },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
