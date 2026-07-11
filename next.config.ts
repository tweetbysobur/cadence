import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The reducer is intentionally impure (it rolls jitter/tx-id randomness
  // itself); StrictMode's dev-only double-invoke would double-roll it.
  reactStrictMode: false,
};

export default nextConfig;
