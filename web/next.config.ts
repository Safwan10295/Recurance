import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The live brief reads per-organisation retrieval shards at runtime.
  outputFileTracingIncludes: {
    "/api/brief": ["./data/brief/**", "./data/brief_index.json", "./data/brief_examples.json"],
  },
  poweredByHeader: false,
};

export default nextConfig;
