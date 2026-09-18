import { defineConfig } from "@playwright/test";
// 워크트리 여러 개가 같은 기계에서 돌 때 포트가 겹친다. E2E_PORT 로 Vite 포트를
// 바꿀 수 있다. API(8000)는 읽기 전용이라 공유해도 된다.
const port = Number(process.env.E2E_PORT ?? 5173);
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  expect: { timeout: 10000 },
  reporter: "list",
  use: {
    channel: "chromium",
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1440, height: 950 },
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command:
        "cargo run -p constellation-serve -- --db ../data/constellation.duckdb",
      url: "http://127.0.0.1:8000/api/health",
      reuseExistingServer: true,
    },
    {
      command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
      url: `http://127.0.0.1:${port}`,
      reuseExistingServer: true,
    },
  ],
});
