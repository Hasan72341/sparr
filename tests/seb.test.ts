import { afterEach, beforeEach, expect, it } from "vitest";
import request from "supertest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { createApp } from "../src/server/app";
import {
  SebLaunches,
  localSebOrigin,
  encodeSebConfig,
} from "../src/server/seb";
import type { PracticeOptions } from "../src/shared/types";

let dir: string;
let ctx: Awaited<ReturnType<typeof createApp>>;
const options: PracticeOptions = {
  track: "finance",
  difficulty: "advanced",
  durationMinutes: 30,
  mode: "practice",
  stage: "technical",
  company: "Example & Co",
  jobDescription: "Valuation <and> accounting",
};
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sparr-seb-"));
  ctx = await createApp({ dataDir: dir, test: true });
});
afterEach(async () => {
  ctx.close();
  await rm(dir, { recursive: true, force: true });
});
const create = (body = options) =>
  request(ctx.app)
    .post("/api/seb/launches")
    .set("Host", "127.0.0.1:4318")
    .set("X-Sparr-Client", "web")
    .send(body);
const xmlFrom = (buffer: Buffer) => {
  const plain = gunzipSync(buffer);
  expect(plain.subarray(0, 4).toString()).toBe("plnd");
  return gunzipSync(plain.subarray(4)).toString();
};

it("generates a downloadable SEB config and retains setup without creating a timed session", async () => {
  const response = await create();
  expect(response.status).toBe(201);
  const launch = response.body;
  expect(launch.launchUrl).toBe(
    `seb://127.0.0.1:4318/api/seb/launches/${launch.id}/config.seb`,
  );
  const config = await request(ctx.app)
    .get(new URL(launch.configUrl).pathname)
    .buffer(true)
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => callback(null, Buffer.concat(chunks)));
    });
  expect(config.status).toBe(200);
  expect(config.headers["content-type"]).toContain("application/seb");
  expect(config.headers["content-disposition"]).toContain("sparr-practice.seb");
  expect(config.headers["cache-control"]).toBe("no-store");
  const xml = xmlFrom(config.body);
  expect(xml).toContain(
    `<key>startURL</key><string>${launch.startUrl}</string>`,
  );
  expect(xml).toContain("<key>sebConfigPurpose</key><integer>0</integer>");
  expect(xml).toContain("<key>allowQuit</key><true/>");
  expect(xml).toContain(
    "<key>prohibitedProcesses</key><array><dict><key>active</key><false/><key>executable</key><string>Terminal</string><key>identifier</key><string>com.apple.Terminal</string>",
  );
  expect(xml).toContain(
    "<key>active</key><false/><key>executable</key><string>iTerm2</string>",
  );
  expect(xml).not.toContain(options.jobDescription);
  expect(
    (await request(ctx.app).get(`/api/seb/launches/${launch.id}`)).body.options,
  ).toEqual(options);
  expect(ctx.store.sessions()).toEqual([]);
});

it("rejects strict mode, arbitrary settings, invalid setup and cross-origin creation", async () => {
  expect((await create({ ...options, mode: "strict" } as never)).status).toBe(
    400,
  );
  expect(
    (
      await create({
        ...options,
        startURL: "https://attacker.example",
      } as never)
    ).status,
  ).toBe(400);
  expect((await create({ ...options, durationMinutes: -1 })).status).toBe(400);
  expect(
    (
      await create({
        ...options,
        artifactId: "abcdabcd-abcd-4bcd-abcd-abcdabcdabcd",
      })
    ).status,
  ).toBe(404);
  expect(
    (await request(ctx.app).post("/api/seb/launches").send(options)).status,
  ).toBe(403);
  expect(
    (await create().set("Origin", "https://attacker.example")).status,
  ).toBe(403);
  expect((await create().set("Host", "[evil.example]:4318")).status).toBe(403);
  const r = await create()
    .set("X-Forwarded-Host", "attacker.example")
    .set("X-Forwarded-Proto", "https");
  expect(r.body.launchUrl).toMatch(/^seb:\/\/127\.0\.0\.1:4318\//);
  expect(
    (
      await request(ctx.app)
        .post("/api/sessions")
        .set("X-Sparr-Client", "web")
        .send({ ...options, mode: "strict" })
    ).status,
  ).toBe(409);
});

it("invalidates handoffs after workspace deletion and restart", async () => {
  const path = `/api/seb/launches/${(await create()).body.id}`;
  await request(ctx.app)
    .delete("/api/data")
    .set("X-Sparr-Client", "web")
    .expect(200);
  await request(ctx.app).get(path).expect(404);
  await request(ctx.app)
    .get(path + "/config.seb")
    .expect(404);
  const second = `/api/seb/launches/${(await create()).body.id}`;
  ctx.close();
  ctx = await createApp({ dataDir: dir, test: true });
  await request(ctx.app).get(second).expect(404);
});

it("expires handoffs after 30 minutes and bounds retained setups", () => {
  let now = Date.now();
  const launches = new SebLaunches(() => now);
  const first = launches.create(options, "http://localhost:4318");
  for (let i = 1; i < 50; i++)
    launches.create(options, "http://localhost:4318");
  expect(() => launches.create(options, "http://localhost:4318")).toThrow(
    /Too many/,
  );
  now += 30 * 60 * 1000;
  expect(() => launches.get(first.id)).toThrow(/expired/);
  expect(launches.create(options, "https://localhost:4318").launchUrl).toMatch(
    /^sebs:/,
  );
});

it("validates local origins and escapes XML values", () => {
  expect(localSebOrigin("http", "[::1]:4318")).toBe("http://[::1]:4318");
  for (const host of [
    "127.0.0.1@evil.example",
    "localhost/evil",
    "[evil]",
    "localhost:99999",
    "127.0.0.1:4318?foo",
  ])
    expect(() => localSebOrigin("http", host)).toThrow();
  expect(() => localSebOrigin("file", "localhost")).toThrow();
  expect(
    xmlFrom(encodeSebConfig({ startURL: "http://localhost/?a=1&b=<tag>" })),
  ).toContain("?a=1&amp;b=&lt;tag&gt;");
});
