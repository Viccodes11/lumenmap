import { expect, test } from "@playwright/test";

test("typo search highlights results and keeps keyboard selection", async ({ page }) => {
  const activity = page.waitForResponse((response) => response.url().includes("/api/v1/activity?"));
  await page.goto("/");
  await activity;
  const search = page.getByRole("combobox", { name: /search loaded/i });
  await expect(search).toBeEnabled();

  await search.fill("Soroswp");
  const list = page.getByRole("listbox");
  const first = list.getByRole("option").first();
  await expect(first).toContainText("Soroswap");
  await expect(first.locator("mark").first()).toContainText("Soroswap");

  await search.press("ArrowDown");
  await expect(search).toHaveAttribute("aria-activedescendant", /-option-1$/);
  await search.press("ArrowUp");
  await expect(search).toHaveAttribute("aria-activedescendant", /-option-0$/);
  await search.press("Enter");
  await expect(page.getByTestId("detail-title")).toContainText("Soroswap");
});

test("pasted address stays the first search option", async ({ page }) => {
  const activity = page.waitForResponse((response) => response.url().includes("/api/v1/activity?"));
  await page.goto("/");
  await activity;
  const search = page.getByRole("combobox", { name: /search loaded/i });
  await expect(search).toBeEnabled();
  const address = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
  await search.fill(address);
  await expect(page.getByRole("listbox").getByRole("option").first()).toContainText("Circle USDC");
  await search.press("Enter");
  await expect(page.getByTestId("detail-title")).toContainText("Circle USDC");
});
