import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server build for the Docker image (deploy/web.Dockerfile).
  output: "standalone",
  poweredByHeader: false,
};

export default nextConfig;
