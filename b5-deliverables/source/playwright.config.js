import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

const releaseDir = resolve(import.meta.dirname, "release");

export default defineConfig({
  testDir: "tests/browser",
  timeout: 120_000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
  },
  webServer: {
    command: `npx --yes serve "${releaseDir}" -l 4173 --no-clipboard`,
    port: 4173,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
  },
});
