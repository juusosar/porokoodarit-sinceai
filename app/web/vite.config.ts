/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Same alias + port conventions as Lovable exports, so their components drop in unchanged.
export default defineConfig({
  server: { host: "::", port: 5173 },
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: { environment: "jsdom", globals: true, setupFiles: [] },
});
