import type { NextConfig } from "next";

// Server-side proxy target for the NestJS backend.
// Keep in sync with src/lib/config.ts — Next config cannot import from src/.
const backendOrigin = process.env.BACKEND_ORIGIN ?? "http://localhost:8080";

const nextConfig: NextConfig = {
  output: "standalone",
  // Explicit afterFiles: the local /api/sse route handler is matched first, so it
  // is never shadowed; everything else under /api/* and the /auth/* OAuth
  // endpoints proxies to the backend.
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [
        { source: "/api/:path*", destination: `${backendOrigin}/api/:path*` },
        { source: "/auth/:path*", destination: `${backendOrigin}/auth/:path*` },
      ],
      fallback: [],
    };
  },
};

export default nextConfig;
