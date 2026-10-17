import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server build for the Docker image (deploy/web.Dockerfile).
  output: "standalone",
  poweredByHeader: false,
  // Nemotron, Evaluation and Methodology moved under How we know; old links keep working.
  async redirects() {
    return [
      { source: "/nemotron", destination: "/how-we-know", permanent: true },
      { source: "/evaluation", destination: "/how-we-know/evaluation", permanent: true },
      { source: "/methodology", destination: "/how-we-know/methodology", permanent: true },
    ];
  },
};

export default nextConfig;
