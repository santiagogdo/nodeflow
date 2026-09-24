// Explicit npm specifiers also resolve inside Playwright's worker subprocesses.
import { defineConfig, devices } from "npm:@playwright/test@1.63.0";
import { tmpdir } from "node:os";
import { join } from "node:path";
export default defineConfig({
  testDir: "./tests/browser",
  outputDir: join(tmpdir(), "nodeflow-browser-results"),
  fullyParallel: true,
  workers: 2,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5176",
    viewport: { width: 1586, height: 992 },
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
    { name: "webkit", use: { browserName: "webkit" } },
    {
      name: "phone-chromium",
      use: { ...devices["Pixel 7"], browserName: "chromium" },
    },
    {
      name: "phone-webkit",
      use: { ...devices["iPhone 14"], browserName: "webkit" },
    },
  ],
  webServer: {
    command:
      "deno task build:browser && deno serve --host=127.0.0.1 --port=5176 --allow-read=dist-demo scripts/serve.ts",
    url: "http://127.0.0.1:5176/examples/workbench/",
    reuseExistingServer: !Deno.env.get("CI"),
  },
});
