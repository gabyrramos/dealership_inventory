import type { Config } from "@react-router/dev/config"

// SPA mode: the build is just static files, which the Worker serves.
export default {
  ssr: false,
  appDirectory: "src",
  buildDirectory: "dist",
} satisfies Config
