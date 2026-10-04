import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";

// Native and SEB JavaScript API fixtures; real HTTP controller, cookies, timers,
// persistence, admission and React UI. Real SEB is tested separately in mac-vm.
const origin = "http://127.0.0.1:4354";
const headers = { "X-Sparr-Client": "web" };
async function prepare(page: Page, request: APIRequestContext) {
  const prepared = await request.post(origin + "/__strict_lab/prepare", {
    headers,
  });
  expect(prepared.ok()).toBeTruthy();
  const response = await request.get(origin + "/__strict_lab/status");
  const { proof, launch } = await response.json();
  await page.addInitScript((configKey) => {
    window.SafeExamBrowser = {
      security: { configKey, updateKeys: (done: () => void) => done() },
    };
  }, proof.configHash);
  await page.goto(launch.startUrl);
  await expect(
    page.getByRole("button", { name: "Start strict interview", exact: true }),
  ).toBeEnabled();
  return launch;
}
async function start(page: Page, request: APIRequestContext) {
  const launch = await prepare(page, request);
  await page
    .getByRole("button", { name: "Start strict interview", exact: true })
    .click();
  await expect(page.getByLabel("Your answer", { exact: true })).toBeVisible();
  return launch;
}
for (const kind of ["display", "camera", "capture"]) {
  test(`strict controller and UI invalidate ${kind} failure and keep the saved draft (native fixture)`, async ({
    page,
    request,
  }) => {
    const launch = await start(page, request);
    await page
      .getByLabel("Your answer", { exact: true })
      .fill("My saved reasoning before the device violation.");
    await expect
      .poll(async () => {
        const data = await (
          await request.get(origin + "/__strict_lab/status")
        ).json();
        return data.sessions[0]?.draft?.answer;
      })
      .toBe("My saved reasoning before the device violation.");
    await page.reload();
    await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
      "My saved reasoning before the device violation.",
    );
    await request.post(origin + "/__strict_lab/violation", {
      headers,
      data: { kind },
    });
    await expect(page).toHaveURL(launch.quitUrl);
    const state = await (
      await request.get(origin + "/__strict_lab/status")
    ).json();
    expect(state.sessions[0].status).toBe("terminated");
    expect(state.sessions[0].integrity.events.at(-1).code).toBe(
      "native-policy",
    );
    expect(
      state.events.some(
        (e: { event: string }) => e.event === "native-exit-requested-simulated",
      ),
    ).toBe(true);
  });
}
test("strict completion saves a report and exits the fixed SEB page (native fixture)", async ({
  page,
  request,
}) => {
  const launch = await start(page, request);
  await page
    .getByRole("button", { name: "Finish session", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Finish and exit SEB", exact: true })
    .click();
  await expect(page).toHaveURL(launch.quitUrl);
  const state = await (
    await request.get(origin + "/__strict_lab/status")
  ).json();
  expect(state.sessions[0].status).toBe("completed");
  expect(state.sessions[0].report).toBeTruthy();
});
test("strict preflight emergency exit does not wait indefinitely for a cancel response", async ({
  page,
  request,
}) => {
  const launch = await prepare(page, request);
  await page.route("**/cancel", () => {});
  await page
    .getByRole("button", { name: "End strict attempt", exact: true })
    .click();
  await expect(page).toHaveURL(launch.quitUrl, { timeout: 5000 });
});
