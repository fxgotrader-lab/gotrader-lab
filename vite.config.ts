import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  envPrefix: ["VITE_", "LLM_ADVISORY_TIMEOUT_MS", "OPENCLAW_ADVISORY_URL"],
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  }
});
