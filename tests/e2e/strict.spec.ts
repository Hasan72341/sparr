import { test, expect } from "@playwright/test";

test("strict setup requires consent, explains failed device checks, and cancels monitoring", async ({
  page,
  request,
}) => {
  await request.delete("/api/data", { headers: { "X-Sparr-Client": "web" } });
  await page.route("**/api/bootstrap", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.capabilities.strict = { available: true, reasons: [] };
    await route.fulfill({ json: body });
  });
  let prepared = 0,
    canceled = 0;
  await page.route("**/api/strict/launches", async (route) => {
    prepared++;
    expect(route.request().postDataJSON().consent).toBe(true);
    await route.fulfill({
      status: 201,
      json: {
        id: "test-launch",
        options: route.request().postDataJSON().options,
        startUrl: "http://127.0.0.1:4349/strict/test-launch",
        quitUrl: "http://127.0.0.1:4349/strict/test-launch/quit",
        configUrl: "/api/strict/launches/test-launch/config.seb",
        launchUrl:
          "seb://127.0.0.1:4349/api/strict/launches/test-launch/config.seb",
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      },
    });
  });
  await page.route("**/api/strict/launches/test-launch/status", (route) =>
    route.fulfill({
      json: {
        phase: "preflight",
        ready: false,
        reasons: ["Exactly one active display is required."],
        quitUrl: "/strict/test-launch/quit",
        observation: {
          displays: 2,
          cameras: 1,
          faceCount: 1,
          cameraPermission: "authorized",
          microphonePermission: "authorized",
        },
      },
    }),
  );
  await page.route(
    "**/api/strict/launches/test-launch/cancel",
    async (route) => {
      canceled++;
      await route.fulfill({ json: { ended: true } });
    },
  );
  await page.goto("/practice");
  const prepare = page.getByRole("button", {
    name: "Prepare strict interview",
    exact: true,
  });
  await expect(prepare).toBeDisabled();
  await page.getByRole("checkbox", { name: /I agree to live device/ }).check();
  await prepare.click();
  await expect(
    page.getByText("Exactly one active display is required.", { exact: true }),
  ).toBeVisible();
  expect(prepared).toBe(1);
  await expect(
    page.getByRole("link", { name: "Launch strict SEB" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel strict setup" }).click();
  await expect(prepare).toBeEnabled();
  expect(canceled).toBe(1);
});
