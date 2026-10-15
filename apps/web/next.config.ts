import path from "path";
import type { NextConfig } from "next";

const domainEntry = path.resolve(__dirname, "../../packages/domain/src/index.ts");

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  webpack: (config) => {
    config.resolve.alias["@domain"] = domainEntry;
    return config;
  },
};

export default nextConfig;
