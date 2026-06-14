import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse pulls in pdfjs-dist (legacy), which loads a worker module at
  // runtime. Bundling it with Turbopack breaks that worker resolution, so keep
  // these packages external and let Node resolve them from node_modules.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
};

export default nextConfig;
