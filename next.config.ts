import type { NextConfig } from "next";

// Полностью клиентское приложение: данные живут в IndexedDB,
// поэтому собираем статический экспорт без серверных фич.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
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
