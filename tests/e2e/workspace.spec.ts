import { expect, test } from "@playwright/test";
import type { SessionView } from "../../src/shared/types";

const headers = { "X-Sparr-Client": "web" };

test.beforeEach(async ({ request }) => {
  expect((await request.delete("/api/data", { headers })).ok()).toBeTruthy();
  expect(
    (
      await request.put("/api/settings", {
        headers,
        data: {
          provider: "guided",
          model: "",
          baseUrl: "http://127.0.0.1:11434",
        },
      })
    ).ok(),
  ).toBeTruthy();
});

test("a delayed older draft cannot overwrite a submission or the next question", async ({
  page,
  request,
}) => {
  const response = await request.post("/api/sessions", {
    headers,
    data: {
      track: "quant-research",
      difficulty: "foundation",
      durationMinutes: 10,
      mode: "practice",
    },
  });
  const { session } = (await response.json()) as SessionView;
  let releaseSave!: () => void;
  const heldSave = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  let intercepted = false;
  await page.route(`**/api/sessions/${session.id}/draft`, async (route) => {
    if (route.request().postDataJSON().answer === "Earlier draft: 1/6") {
      intercepted = true;
      await heldSave;
    }
    await route.continue();
  });
  await page.goto(`/sessions/${session.id}`);
  const answer = page.getByLabel("Your answer", { exact: true });
  await answer.fill("Earlier draft: 1/6");
  await expect.poll(() => intercepted).toBe(true);
  const latest =
    "1/3. The conditional sample space is 2, 4, and 6, with equal probabilities.";
  await answer.fill(latest);
  await page
    .getByRole("button", { name: "Submit answer", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Reviewing answer…", exact: true }),
  ).toBeDisabled();
  releaseSave();
  await expect(
    page.getByRole("heading", { name: "Feedback on this answer" }),
  ).toBeVisible();
  const submitted = (await (
    await request.get(`/api/sessions/${session.id}`)
  ).json()) as SessionView;
  expect(submitted.session.draft.answer).toBe(latest);
  expect(
    submitted.session.messages
      .filter((message) => message.role === "candidate")
      .map((message) => message.content),
  ).toEqual([latest]);
  await answer.fill(
    "1/2 for the changed follow-up scenario; this is not a revision of the original answer.",
  );
  await page
    .getByRole("button", { name: "Respond to follow-up", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Respond to follow-up", exact: true }),
  ).toBeEnabled();
  const followedUp = (await (
    await request.get(`/api/sessions/${session.id}`)
  ).json()) as SessionView;
  expect(followedUp.session.assessments).toHaveLength(
    submitted.session.assessments.length,
  );
  expect(followedUp.session.assessments[0].verdict).toBe(
    submitted.session.assessments[0].verdict,
  );
  expect(followedUp.session.assessments[0].feedback).toBe(
    submitted.session.assessments[0].feedback,
  );
  expect(followedUp.session.assessments[0].run).toEqual(
    submitted.session.assessments[0].run,
  );
  expect(followedUp.session.assessments[0].evidence).toEqual(
    expect.arrayContaining(submitted.session.assessments[0].evidence),
  );
  expect(
    followedUp.session.messages.filter(
      (message) => message.role === "candidate",
    ),
  ).toHaveLength(2);
  await page
    .getByRole("button", { name: "Next question", exact: true })
    .click();
  await expect(answer).toHaveValue("");
  const next = (await (
    await request.get(`/api/sessions/${session.id}`)
  ).json()) as SessionView;
  expect(next.session.questionIndex).toBe(1);
  expect(next.session.draft.answer).toBe("");
});

test("server drafts still save and restore when browser storage is disabled", async ({
  page,
  request,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("Storage unavailable", "SecurityError");
      },
    }),
  );
  const response = await request.post("/api/sessions", {
    headers,
    data: {
      track: "finance",
      difficulty: "foundation",
      durationMinutes: 10,
      mode: "practice",
    },
  });
  const { session } = (await response.json()) as SessionView;
  await page.goto(`/sessions/${session.id}`);
  const answer = page.getByLabel("Your answer", { exact: true });
  await answer.fill(
    "25. Operating working capital rises by 25 million, reducing cash flow by that amount.",
  );
  await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(answer).toHaveValue(
    "25. Operating working capital rises by 25 million, reducing cash flow by that amount.",
  );
});

test("device permissions are requested only on click and denied permissions explain recovery", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let requests = 0;
    Object.defineProperty(window, "__sparrMediaRequests", {
      get: () => requests,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          requests++;
          throw new DOMException("Permission denied", "NotAllowedError");
        },
      },
    });
  });
  await page.goto("/settings");
  await expect(
    page.getByRole("button", { name: "Start device check" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __sparrMediaRequests: number })
          .__sparrMediaRequests,
    ),
  ).toBe(0);
  await page.getByRole("button", { name: "Start device check" }).click();
  await expect(
    page.getByText(
      "Camera or microphone permission was denied. Allow access in your browser’s site settings, then try again.",
    ),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __sparrMediaRequests: number })
          .__sparrMediaRequests,
    ),
  ).toBe(1);
  await expect(
    page.getByRole("button", { name: "Start device check" }),
  ).toBeEnabled();
});

test("stopping or leaving device preview releases its media tracks", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const tracks: MediaStreamTrack[] = [];
    Object.defineProperty(window, "__sparrPreviewTracks", { value: tracks });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          const context = new AudioContext();
          const destination = context.createMediaStreamDestination();
          tracks.push(...destination.stream.getTracks());
          return destination.stream;
        },
      },
    });
  });
  await page.goto("/settings");
  await page.getByRole("button", { name: "Start device check" }).click();
  await expect(
    page.getByText("Camera and microphone active · Preview only"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stop device check" }).click();
  await expect(page.getByText("Camera and microphone released.")).toBeVisible();
  expect(
    await page.evaluate(() =>
      (
        window as unknown as { __sparrPreviewTracks: MediaStreamTrack[] }
      ).__sparrPreviewTracks.map((track) => track.readyState),
    ),
  ).toEqual(["ended"]);
  await page.getByRole("button", { name: "Start device check" }).click();
  await expect(
    page.getByText("Camera and microphone active · Preview only"),
  ).toBeVisible();
  await page.getByRole("link", { name: "Projects", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Projects and documents" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      (
        window as unknown as { __sparrPreviewTracks: MediaStreamTrack[] }
      ).__sparrPreviewTracks.map((track) => track.readyState),
    ),
  ).toEqual(["ended", "ended"]);
});

test("timer expiry waits for an in-flight answer before refreshing the report", async ({
  page,
  request,
}) => {
  const response = await request.post("/api/sessions", {
    headers: { "X-Sparr-Client": "web" },
    data: {
      track: "quant-research",
      difficulty: "foundation",
      durationMinutes: 5,
      mode: "practice",
    },
  });
  const initial = await response.json();
  const id = initial.session.id;
  await page.clock.install();
  await page.goto(`/sessions/${id}`);
  await page
    .getByLabel("Your answer", { exact: true })
    .fill("1/3. The three even outcomes are equally likely.");
  await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
  let release: () => void = () => {};
  const released = new Promise<void>((r) => {
    release = r;
  });
  let reached: () => void = () => {};
  const intercepted = new Promise<void>((r) => {
    reached = r;
  });
  await page.route(`**/api/sessions/${id}/answer`, async (route) => {
    const actual = await route.fetch();
    reached();
    await released;
    await route.fulfill({ response: actual });
  });
  let expiryReads = 0;
  page.on("request", (req) => {
    if (
      req.method() === "GET" &&
      new URL(req.url()).pathname === `/api/sessions/${id}`
    )
      expiryReads++;
  });
  await page
    .getByRole("button", { name: "Submit answer", exact: true })
    .click();
  await intercepted;
  try {
    await page.clock.fastForward(301000);
    await expect(page.getByText(/Your session time has ended/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Reviewing answer…", exact: true }),
    ).toBeVisible();
    expect(expiryReads).toBe(0);
    await expect(page).toHaveURL(new RegExp(`/sessions/${id}$`));
  } finally {
    release();
  }
  await expect(
    page.getByRole("heading", { name: "Feedback on this answer" }),
  ).toBeVisible();
});

test("a bootstrap response started before deletion cannot restore a deleted session", async ({
  page,
  request,
}) => {
  const created = await request.post("/api/sessions", {
    headers: { "X-Sparr-Client": "web" },
    data: {
      mode: "practice",
      track: "finance",
      difficulty: "foundation",
      durationMinutes: 10,
      stage: "technical",
    },
  });
  const { session } = await created.json();
  await page.goto(`/sessions/${session.id}`);
  await expect(page.getByLabel("Your answer", { exact: true })).toBeVisible();
  let release!: () => void, captured!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    captured = resolve;
  });
  await page.route("**/api/bootstrap", async (route) => {
    const response = await route.fetch();
    captured();
    await held;
    await route.fulfill({ response });
  });
  await page
    .getByRole("button", { name: "Finish session", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Finish and view report", exact: true })
    .click();
  await expect(page).toHaveURL(/\/report$/);
  await pending;
  await page
    .getByRole("link", { name: "Session history", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: /Delete Finance session/ })
    .click();
  await page
    .getByRole("button", { name: "Delete session", exact: true })
    .click();
  const empty = page.getByRole("heading", {
    name: /No sessions|Your first session|Start your story|No practice/i,
  });
  await expect(empty).toBeVisible();
  const response = page.waitForResponse("**/api/bootstrap");
  release();
  await response;
  await page.waitForTimeout(250);
  await expect(empty).toBeVisible();
});
