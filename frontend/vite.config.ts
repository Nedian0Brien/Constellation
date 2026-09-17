import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    port: 5173,
    proxy: {
      // 프론트는 항상 /api 로 부르고, 개발 중엔 여기서 백엔드로 넘긴다.
      "/api": { target: "http://127.0.0.1:8000", changeOrigin: true },
    },
  },
});
