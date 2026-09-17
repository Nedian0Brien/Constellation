import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  expect: { timeout: 10000 },
  reporter: "list",
  use: {
    channel: "chromium",
    baseURL: "http://127.0.0.1:5173",
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
      command: "npm run dev -- --host 127.0.0.1",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: true,
    },
  ],
});
