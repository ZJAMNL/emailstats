import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No "X-Powered-By: Next.js": it only tells attackers what to look for.
  poweredByHeader: false,
};

export default nextConfig;
