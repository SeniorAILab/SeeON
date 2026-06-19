import type { NextConfig } from "next";

// Server-side proxy target for the NestJS backend.
// Keep in sync with src/lib/config.ts — Next config cannot import from src/.
const backendOrigin = process.env.BACKEND_ORIGIN ?? "http://localhost:8080";

// Server demo predicate. Intentionally duplicated from src/lib/config.ts
// (isServerDemo): Next config cannot import from src/. In demo mode all rewrites
// are dropped so no request can reach the backend origin. Demo sets both flags:
// DEMO=1 NEXT_PUBLIC_DEMO=1.
const isDemo = process.env.DEMO === "1" || process.env.NEXT_PUBLIC_DEMO === "1";

const nextConfig: NextConfig = {
  output: "standalone",
  // Explicit afterFiles: the local /api/sse route handler is matched first, so it
  // is never shadowed; everything else under /api/* and the /auth/* OAuth
  // endpoints proxies to the backend. In demo mode rewrites are empty so the
  // browser origin is fully self-contained.
  async rewrites() {
    if (isDemo) {
      return { beforeFiles: [], afterFiles: [], fallback: [] };
    }
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
