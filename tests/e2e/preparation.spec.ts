import { test, expect } from "@playwright/test";

const headers = { "X-Sparr-Client": "web" };

test("company preparation remains editable and persists with the chosen session settings", async ({
  page,
  request,
}) => {
  expect((await request.delete("/api/data", { headers })).ok()).toBeTruthy();
  const uploaded = await request.post("/api/artifacts", {
    headers,
    multipart: {
      file: {
        name: "practice-notes.txt",
        mimeType: "text/plain",
        buffer: Buffer.from(
          "Synthetic practice project: a reliable event API.",
        ),
      },
    },
  });
  expect(uploaded.ok()).toBeTruthy();
  const artifact = await uploaded.json();
  await page.goto(`/practice?artifact=${artifact.id}`);
  await page
    .getByLabel("Difficulty", { exact: true })
    .selectOption("foundation");
  await page.getByRole("radio", { name: "30 minutes", exact: true }).check();
  await page
    .getByLabel("Interview stage", { exact: true })
    .selectOption("behavioral");

  const template = page.getByLabel("Preparation template", { exact: true });
  await template.selectOption("goldman-sachs-finance");
  await expect(
    page.getByRole("radio", { name: /Corporate finance/ }),
  ).toBeChecked();
  await expect(page.getByLabel("Company", { exact: true })).toHaveValue(
    "Goldman Sachs",
  );
  await expect(
    page.getByLabel("Job description", { exact: true }),
  ).not.toBeEmpty();
  await template.selectOption("trilogy-swe");
  await expect(page.locator('input[name="track"][value="swe"]')).toBeChecked();
  await expect(page.getByLabel("Company", { exact: true })).toHaveValue(
    "Trilogy",
  );
  await expect(
    page.getByLabel("Job description", { exact: true }),
  ).not.toBeEmpty();
  await expect(page.getByLabel("Difficulty", { exact: true })).toHaveValue(
    "foundation",
  );
  await expect(
    page.getByRole("radio", { name: "30 minutes", exact: true }),
  ).toBeChecked();
  await expect(page.getByLabel("Interview stage", { exact: true })).toHaveValue(
    "behavioral",
  );
  await expect(page.getByLabel("Project context", { exact: true })).toHaveValue(
    `artifact:${artifact.id}`,
  );

  const context =
    "My own preparation: explain a failed retry, the test I added, and the tradeoffs.";
  await page.getByLabel("Company", { exact: true }).fill("Trilogy — my role");
  await page.getByLabel("Job description", { exact: true }).fill(context);
  await page
    .getByRole("button", { name: "Start practice", exact: true })
    .click();
  await expect(page).toHaveURL(/\/sessions\/[a-f0-9-]+$/);
  await page.reload();
  await page.getByText("Session context", { exact: true }).click();
  await expect(page.locator(".session-targeting")).toContainText(
    "Trilogy — my role",
  );
  await expect(page.locator(".session-targeting")).toContainText(context);
  const id = page.url().split("/").at(-1);
  const session = (await (await request.get(`/api/sessions/${id}`)).json())
    .session;
  expect(session).toMatchObject({
    company: "Trilogy — my role",
    jobDescription: context,
    track: "swe",
    difficulty: "foundation",
    durationMinutes: 30,
    stage: "behavioral",
    artifactId: artifact.id,
  });
});
