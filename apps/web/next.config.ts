import type { NextConfig } from "next";
import { join } from "node:path";
import { createRequire } from "node:module";

const pkg = createRequire(import.meta.url)("./package.json") as {
  version: string;
};

const nextConfig: NextConfig = {
  // Surfaced in the UI so the version is never hard-coded in a component.
  env: { NEXT_PUBLIC_APP_VERSION: pkg.version },
  // Self-contained server bundle for Docker deployment.
  output: "standalone",
  // In a monorepo, trace deps from the repo root so the workspace `@app/shared`
  // package and pnpm's linked deps are included in the standalone output.
  outputFileTracingRoot: join(import.meta.dirname, "../../"),
  // The shared workspace package ships raw TypeScript; let Next transpile it.
  transpilePackages: ["@app/shared"],
  images: {
    // YouTube thumbnails come from these hosts.
    remotePatterns: [
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "img.youtube.com" },
    ],
  },
};

export default nextConfig;
