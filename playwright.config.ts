import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4349",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: [
    {
      command:
        "SPARR_PORT=4349 SPARR_DATA_DIR=.data/e2e NODE_ENV=production npx tsx src/server/index.ts",
      url: "http://127.0.0.1:4349/api/health",
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: "SPARR_STRICT_LAB_PORT=4354 npx tsx scripts/strict-lab.ts",
      url: "http://127.0.0.1:4354/__strict_lab/status",
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
