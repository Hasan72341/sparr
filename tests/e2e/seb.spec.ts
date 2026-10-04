import { test, expect } from "@playwright/test";
import { gunzipSync } from "node:zlib";

test.beforeEach(async ({ request }) => {
  await request.delete("/api/data", { headers: { "X-Sparr-Client": "web" } });
});

test("generates a SEB link, downloads its config and starts with the selected options after handoff", async ({
  page,
  browser,
  request,
}) => {
  await page.goto("/practice?track=finance");
  await page.getByLabel("Company", { exact: true }).fill("Example Bank");
  await page
    .getByLabel("Job description", { exact: true })
    .fill("Build valuation models and explain assumptions.");
  await page.getByLabel("Difficulty", { exact: true }).selectOption("advanced");
  await page.getByLabel("Interview stage").selectOption("behavioral");
  await page.getByRole("radio", { name: "30 minutes", exact: true }).check();
  await page
    .getByRole("button", { name: "Generate SEB link", exact: true })
    .click();
  const launchLink = page.getByRole("link", {
    name: "Launch Safe Exam Browser",
  });
  await expect(launchLink).toHaveAttribute(
    "href",
    /^seb:\/\/127\.0\.0\.1:4349\/api\/seb\/launches\/[a-f0-9-]+\/config\.seb$/,
  );
  const url = await launchLink.getAttribute("href");
  await expect(page.getByLabel("SEB launch link", { exact: true })).toHaveValue(
    url!,
  );
  expect(await (await request.get("/api/sessions")).json()).toEqual([]);
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download .seb" }).click();
  expect((await downloadEvent).suggestedFilename()).toBe("sparr-practice.seb");
  const config = await request.get(url!.replace(/^seb:/, "http:"));
  const xml = gunzipSync(
    gunzipSync(await config.body()).subarray(4),
  ).toString();
  const startUrl = xml.match(/<key>startURL<\/key><string>(.*?)<\/string>/)![1];
  // A separate cookie/storage context models the browser handoff. Native SEB
  // protocol activation is checked separately inside the existing macOS VM.
  const seb = await browser.newContext();
  try {
    const other = await seb.newPage();
    await other.goto(startUrl);
    await expect(
      other.getByText("Interview settings loaded from your SEB link.", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(
      other.getByRole("radio", { name: "Corporate finance", exact: true }),
    ).toBeChecked();
    await expect(other.getByLabel("Company", { exact: true })).toHaveValue(
      "Example Bank",
    );
    await expect(other.getByLabel("Interview stage")).toHaveValue("behavioral");
    await expect(other.getByLabel("Difficulty", { exact: true })).toHaveValue(
      "advanced",
    );
    await expect(
      other.getByRole("radio", { name: "30 minutes", exact: true }),
    ).toBeChecked();
    await other
      .getByRole("button", { name: "Start practice", exact: true })
      .click();
    await expect(other).toHaveURL(/\/sessions\/[a-f0-9-]+$/);
    const sessions = await (await request.get("/api/sessions")).json();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      track: "finance",
      company: "Example Bank",
      stage: "behavioral",
      difficulty: "advanced",
      durationMinutes: 30,
      mode: "practice",
      jobDescription: "Build valuation models and explain assumptions.",
    });
  } finally {
    await seb.close();
  }
  await page
    .getByLabel("Difficulty", { exact: true })
    .selectOption("foundation");
  await expect(launchLink).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Generate SEB link", exact: true }),
  ).toBeEnabled();
});

test("recovers from a missing or expired SEB link", async ({ page }) => {
  await page.goto("/practice?seb=expired-link");
  await expect(
    page.getByRole("heading", { name: "SEB link unavailable" }),
  ).toBeVisible();
  await expect(
    page.getByText(/This SEB link expired or Sparr restarted/),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to Practice" }).click();
  await expect(
    page.getByRole("button", { name: "Generate SEB link", exact: true }),
  ).toBeVisible();
});
