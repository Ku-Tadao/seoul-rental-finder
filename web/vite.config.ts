import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  base: "./", // relative, so the page works under a GitHub Pages project path and at short/
  build: { chunkSizeWarningLimit: 800 }, // React and Base UI are most of it; the inlined listings are far bigger anyway
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
})
