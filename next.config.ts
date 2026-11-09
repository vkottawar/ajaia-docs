import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page in this app depends on the signed-in user, so there is no
  // static shell worth prerendering. Cache Components is left off on purpose.
  // Native / DOM-emulation packages must not be bundled into server code.
  serverExternalPackages: ["@libsql/client", "libsql", "happy-dom", "mammoth"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
