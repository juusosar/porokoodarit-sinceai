import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import path from "node:path";

// Static SPA (Vercel / nginx image). Lovable's TanStack Start server parts were replaced by our FastAPI API.
export default defineConfig({
  // fs.allow: this app + app/shared (reason codes, schema).
  server: { host: "::", port: 5173, fs: { allow: [".", "../shared"] } },
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src"), "@shared": path.resolve(__dirname, "../shared") },
    dedupe: ["react", "react-dom", "@tanstack/react-router"],
  },
});
