import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // mammoth and unpdf ship Node-only code; keep them out of the bundler.
  serverExternalPackages: ["mammoth", "unpdf"],
};

export default nextConfig;
