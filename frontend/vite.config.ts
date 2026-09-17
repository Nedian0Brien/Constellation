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
      // 브라우저에서는 /api 로 부르고 개발용 Rust 서버(constellation-serve)로 넘긴다.
      // 데스크톱 앱은 invoke를 쓰므로 프록시를 거치지 않는다.
      "/api": { target: "http://127.0.0.1:8000", changeOrigin: true },
    },
    // Tauri가 src-tauri를 다시 빌드할 때 Vite가 따라 재시작하지 않게 한다.
    watch: { ignored: ["**/src-tauri/**"] },
  },
});
