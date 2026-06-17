import type { NextConfig } from "next";

// Server-side proxy target for the NestJS backend. Same default as lib/session.ts.
const backendOrigin = process.env.BACKEND_ORIGIN ?? "http://localhost:8080";

const nextConfig: NextConfig = {
  output: "standalone",
  // afterFiles rewrites: the local /api/sse route handler still wins; everything
  // else under /api/* and the /auth/* OAuth endpoints proxy to the backend.
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${backendOrigin}/api/:path*` },
      { source: "/auth/:path*", destination: `${backendOrigin}/auth/:path*` },
    ];
  },
};

export default nextConfig;
