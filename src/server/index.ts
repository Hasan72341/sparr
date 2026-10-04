import { resolve } from "node:path";
import express from "express";
import { createApp } from "./app.js";
import { terminateProcesses } from "./process.js";
const port = Number(process.env.SPARR_PORT ?? 4318);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("SPARR_PORT must be between 1024 and 65535.");
const { app, close, strict } = await createApp({
  dataDir: resolve(process.env.SPARR_DATA_DIR ?? ".data"),
});
if (process.env.NODE_ENV === "production") {
  app.use((_req, res, next) => {
    res.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'",
    );
    next();
  });
  app.use(express.static(resolve("dist/client")));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(resolve("dist/client/index.html")),
  );
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
const server = app.listen(port, "127.0.0.1", () =>
  console.log(
    `\nSparr is ready at http://127.0.0.1:${port}\nLocal data: ${resolve(process.env.SPARR_DATA_DIR ?? ".data")}\n`,
  ),
);
server.on("error", (error) => {
  console.error(error.message);
  close();
  process.exit(1);
});
let shuttingDown = false;
function stop() {
  if (shuttingDown) return;
  shuttingDown = true;
  strict.close();
  terminateProcesses();
  server.close(() => {
    close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 3000).unref();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
process.on("exit", terminateProcesses);
