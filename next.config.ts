import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  // Cross-origin isolation lets the on-device reader use several CPU threads.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    // The reader's models and runtime are large and rarely change: let phones keep them for 30 days.
    const longCache = [{ key: "Cache-Control", value: "public, max-age=2592000" }];
    return [
      { source: "/(.*)", headers: securityHeaders },
      { source: "/models/:file*", headers: longCache },
      { source: "/ort/:file*", headers: longCache },
    ];
  },
};

export default nextConfig;
