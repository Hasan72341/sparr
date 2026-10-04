import { test, expect, type Page } from "@playwright/test";
const client = { "X-Sparr-Client": "web" };
test.beforeEach(async ({ request }) => {
  const r = await request.delete("/api/data", { headers: client });
  expect(r.ok()).toBeTruthy();
});
async function begin(page: Page, track: string) {
  await page.goto(`/practice?track=${track}`);
  await page
    .getByLabel("Difficulty", { exact: true })
    .selectOption("foundation");
  await page
    .getByRole("button", { name: "Start practice", exact: true })
    .click();
  await expect(page).toHaveURL(/\/sessions\/[a-f0-9-]+$/);
}

test("first launch, resume review, numeric interview, reload, report, export and deletion", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Interview practice" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Profile", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "resume.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "Ananya Rao\nananya@example.com\nPython and Probability\nBuilt an event-driven market simulator.",
    ),
  });
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "Ananya Rao",
  );
  await page
    .getByRole("button", { name: "Confirm and save profile", exact: true })
    .click();
  await page.reload();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "Ananya Rao",
  );
  await begin(page, "quant-research");
  const answer = page.getByLabel("Your answer", { exact: true });
  await answer.fill("1/6. I counted all six faces.");
  await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(answer).toHaveValue("1/6. I counted all six faces.");
  await page.goto("/");
  await page
    .getByRole("link", { name: "Resume interview", exact: true })
    .click();
  await expect(answer).toHaveValue("1/6. I counted all six faces.");
  await page
    .getByRole("button", { name: "Submit answer", exact: true })
    .click();
  await expect(page.getByText("developing", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Get a hint/ }).click();
  await answer.fill(
    "1/3. The conditional outcomes are 2, 4 and 6; each is equally likely.",
  );
  await page
    .getByRole("button", { name: "Submit revised answer", exact: true })
    .click();
  await expect(
    page.getByText(/Your numeric answer matches/).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Finish session", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Finish and view report", exact: true })
    .click();
  await expect(page).toHaveURL(/\/report$/);
  await expect(
    page.getByRole("heading", { name: "Session summary" }),
  ).toBeVisible();
  await expect(page.getByText("1 hint used", { exact: true })).toBeVisible();
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export session", exact: true })
    .click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/sparr-session/);
  await page
    .getByRole("link", { name: "Session history", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: /Delete Quant research session/ })
    .click();
  await page
    .getByRole("button", { name: "Delete session", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: /No sessions|Your first session|Start your story|No practice/i,
    }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("coding exercise executes and revises a failing solution", async ({
  page,
}) => {
  await begin(page, "swe");
  const code = page.getByLabel("Your solution code");
  await code.fill("def solve(data):\n    return []");
  await page.getByRole("button", { name: "Run code", exact: true }).click();
  await expect(
    page.getByText("3 of 6 checks passed", { exact: true }),
  ).toBeVisible();
  await code.fill(
    'def solve(data):\n    seen = {}\n    for i, value in enumerate(data["nums"]):\n        other = data["target"] - value\n        if other in seen:\n            return [seen[other], i]\n        seen[value] = i\n    return []',
  );
  await page.getByRole("button", { name: "Run code", exact: true }).click();
  await expect(
    page.getByText("6 of 6 checks passed", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Explain your approach", { exact: true })
    .fill(
      "A hash map stores previously seen values. Expected O(n) time and O(n) space.",
    );
  await page
    .getByRole("button", { name: "Submit answer", exact: true })
    .click();
  await expect(
    page.getByText(/Your code passes the supplied cases/).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Next question", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Merge overlapping intervals" }),
  ).toBeVisible();
});

test("all non-coding tracks start and save real assessment evidence", async ({
  page,
  request,
}) => {
  for (const track of ["quant-trading", "finance", "markets", "ml"]) {
    await begin(page, track);
    await page
      .getByLabel("Your answer", { exact: true })
      .fill("30. My assumptions require review.");
    await page
      .getByRole("button", { name: "Submit answer", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Feedback on this answer" }),
    ).toBeVisible();
    const id = page.url().split("/").at(-1);
    const r = await request.post(`/api/sessions/${id}/finish`, {
      headers: client,
      data: {},
    });
    expect(r.ok()).toBeTruthy();
    expect((await r.json()).session.report.assessments).toHaveLength(1);
  }
});

test("settings expose real readiness and reject invalid configuration", async ({
  page,
}) => {
  await page.goto("/settings");
  await expect(
    page.getByText("Strict interview", { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Test connection|Test provider/ })
    .click();
  await expect(page.getByText(/Guided practice is ready/)).toBeVisible();
  await page.goto("/projects");
  await page
    .getByLabel("Public GitHub repository URL")
    .fill("https://github.com.evil.test/a/b");
  await page
    .getByRole("button", { name: "Import project", exact: true })
    .click();
  await expect(page.getByText(/Use a public HTTPS GitHub/)).toBeVisible();
});

test("mobile layout remains navigable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page.getByRole("link", { name: "Practice", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Set up an interview" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
