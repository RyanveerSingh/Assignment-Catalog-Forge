import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A second build directory lets a benchmark build run beside a live server without replacing its files.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // Served with `next start` everywhere (Render and Docker); no standalone output so one start command fits both.
  // Native/Node-only packages must not be bundled for the server runtime.
  serverExternalPackages: ["sharp", "pg", "pino", "yauzl", "xlsx", "jschardet", "iconv-lite"],
  // We serve our own pre-resized WebP variants from blob routes; Next's optimizer would
  // burn CPU on the free host for no gain.
  images: { unoptimized: true },
  poweredByHeader: false,
  // Next's gzip holds server-sent events until the stream ends, so live import progress never arrives
  // through a proxy that asks for compression. The host or CDN in front compresses pages instead.
  compress: false,
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
