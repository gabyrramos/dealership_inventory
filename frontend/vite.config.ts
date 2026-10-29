import { reactRouter } from "@react-router/dev/vite"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig, loadEnv } from "vite"
import tsconfigPaths from "vite-tsconfig-paths"

export default defineConfig(({ mode }) => {
  // "" loads every key, not just VITE_ ones. These stay on the dev server and never reach the browser.
  const env = loadEnv(mode, import.meta.dirname, "")
  return {
    plugins: [
      tailwindcss(),
      reactRouter(),
      tsconfigPaths(),
      {
        // This app uses react-router v7 only. A stray react-router-dom v6 in a parent node_modules
        // gets picked up by @react-router/dev and pre-bundled, which fails.
        name: "drop-stray-react-router-dom",
        enforce: "post",
        config(config) {
          const optimizeDeps = config.optimizeDeps
          if (optimizeDeps?.include) {
            optimizeDeps.include = optimizeDeps.include.filter((dep) => dep !== "react-router-dom")
          }
        },
      },
    ],
    server: {
      port: env.DEV_PORT ? Number(env.DEV_PORT) : undefined,
      // Proxying /api keeps everything on one origin, so the session cookie works like in production.
      proxy: env.API_URL ? { "/api": env.API_URL } : undefined,
    },
  }
})
