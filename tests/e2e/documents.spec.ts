import { test, expect } from "@playwright/test";

const headers = { "X-Sparr-Client": "web" };
test.beforeEach(async ({ request }) => {
  expect((await request.delete("/api/data", { headers })).ok()).toBeTruthy();
});

test("a financial model supports a targeted project defense, report, export and deletion", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/projects");
  await page.locator("#artifact-file").setInputFiles({
    name: "forecast.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Year,Revenue,Margin\n2025,100,0.2\n2026,130,0.22\n"),
  });
  await expect(
    page.getByRole("heading", { name: "forecast", exact: true }),
  ).toBeVisible();
  await page.getByText("View document excerpts", { exact: true }).click();
  await expect(
    page.locator("pre").filter({ hasText: "Revenue" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Use in a practice session" }).click();
  await page.getByRole("radio", { name: /Corporate finance/ }).check();
  await page.getByLabel("Company", { exact: true }).fill("Example Bank");
  await page
    .getByLabel("Job description", { exact: true })
    .fill(
      "Evaluate cash flow, valuation assumptions, and scenario sensitivity.",
    );
  await page
    .getByLabel("Interview stage", { exact: true })
    .selectOption("project");
  await page
    .getByRole("button", { name: "Start practice", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Defend forecast" }),
  ).toBeVisible();
  const id = page.url().split("/").at(-1);
  const session = (await (await request.get(`/api/sessions/${id}`)).json())
    .session;
  expect(session.company).toBe("Example Bank");
  expect(session.stage).toBe("project");
  expect(session.artifactId).toBeTruthy();
  await page
    .getByLabel("Your answer", { exact: true })
    .fill(
      "I prepared the forecast. Revenue grows by 30%, assuming stable customer retention. I would stress the renewal rate and reconcile revenue to invoiced cash; these figures are a scenario, not an observed result.",
    );
  await page
    .getByRole("button", { name: "Submit answer", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Feedback on this answer" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Finish session", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Finish and view report", exact: true })
    .click();
  await expect(page).toHaveURL(/\/report$/);
  const exported = await (await request.get("/api/export")).json();
  expect(exported.artifacts[0].evidence[0].excerpt).toContain("Revenue");
  expect(exported.sessions[0].report.assessments).toHaveLength(1);
  await page.goto("/projects");
  await page
    .getByRole("button", { name: "Delete document forecast", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete document", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "forecast", exact: true }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("OA setup clears attachments and disables hint access", async ({
  page,
  request,
}) => {
  const result = await request.post("/api/artifacts", {
    headers,
    multipart: {
      file: {
        name: "model.csv",
        mimeType: "text/csv",
        buffer: Buffer.from("Year,Revenue\n2026,100\n"),
      },
    },
  });
  expect(result.ok()).toBeTruthy();
  const artifact = await result.json();
  await page.goto(`/practice?track=finance&artifact=${artifact.id}`);
  await page.getByLabel("Interview stage", { exact: true }).selectOption("oa");
  await page
    .getByRole("button", { name: "Start practice", exact: true })
    .click();
  await expect(page).toHaveURL(/\/sessions\/[a-f0-9-]+$/);
  await expect(page.getByRole("button", { name: /Get a hint/ })).toBeDisabled();
  const id = page.url().split("/").at(-1);
  const session = (await (await request.get(`/api/sessions/${id}`)).json())
    .session;
  expect(session.stage).toBe("oa");
  expect(session.artifactId).toBeUndefined();
  expect(
    (
      await request.post(`/api/sessions/${id}/hint`, { headers, data: {} })
    ).status(),
  ).toBe(409);
});
