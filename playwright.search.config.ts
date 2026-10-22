import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Run the focused search flow against a local fixture dev server. The default
// Playwright config starts the production build, which currently fails on
// unrelated Flow rendering errors.
export default defineConfig({
  ...base,
  workers: 1,
  use: { ...base.use, baseURL: "http://localhost:3100" },
  webServer: {
    command: "NEXT_PUBLIC_USE_FIXTURES=1 LUMENMAP_DATA_SOURCE=fixture npm run dev -- -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
