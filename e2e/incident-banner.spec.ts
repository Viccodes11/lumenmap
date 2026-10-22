import { expect, test } from "@playwright/test";

test("degraded readiness shows a dismissible global incident banner", async ({ page }) => {
  await page.route("**/api/health?type=readiness", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({
        status: "degraded",
        checks: {
          bigquery: { status: "degraded", message: "BigQuery ping timed out" },
        },
      }),
    });
  });

  await page.goto("/");
  const banner = page.getByTestId("incident-banner");
  await expect(banner).toContainText("Live data is partially degraded", {
    timeout: 5_000,
  });
  await page.keyboard.press("Escape");
  await expect(banner).toHaveCount(0);
});

test("healthy readiness does not render the incident banner", async ({ page }) => {
  await page.route("**/api/health?type=readiness", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({ status: "healthy", checks: {} }),
    });
  });

  await page.goto("/");
  await page.waitForTimeout(3_000);
  await expect(page.getByTestId("incident-banner")).toHaveCount(0);
});
