/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Same alias + port conventions as Lovable exports, so their components drop in unchanged.
export default defineConfig({
  // fs.allow: app/shared (reason codes, schema) lives one level up.
  server: { host: "::", port: 5173, fs: { allow: [".."] } },
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src"), "@shared": path.resolve(__dirname, "../shared") } },
  test: { environment: "jsdom", globals: true, setupFiles: [] },
});
