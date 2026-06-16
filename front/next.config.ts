import type { NextConfig } from "next";

const backendOrigin = process.env.BACKEND_ORIGIN ?? "http://localhost:3000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/auth/:path*", destination: `${backendOrigin}/auth/:path*` },
      { source: "/api/:path*", destination: `${backendOrigin}/api/:path*` },
      { source: "/sse", destination: `${backendOrigin}/sse` },
      { source: "/orgs", destination: `${backendOrigin}/orgs` },
    ];
  },
};

export default nextConfig;
