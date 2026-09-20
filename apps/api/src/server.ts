import { mkdir } from "node:fs/promises";
import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { config } from "./config.js";
import { reconcileOnBoot } from "./db.js";
import { resumeInterruptedJobs } from "./downloads-manager.js";
import { cleanStalePartials } from "./lib/cleanup.js";
import { downloadsRoutes } from "./routes/downloads.js";
import { filesRoutes } from "./routes/files.js";
import { systemRoutes } from "./routes/system.js";
import { wsRoutes } from "./routes/ws.js";
import { startYtdlpAutoUpdate } from "./lib/ytdlp-autoupdate.js";

async function buildServer() {
  const app = Fastify({
    logger: {
      transport: {
        target: "pino-pretty",
        options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" },
      },
    },
  });

  await app.register(cors, { origin: config.webOrigin });
  await app.register(websocket);

  // Body-less POSTs (retry / cancel / yt-dlp update) may arrive with an empty
  // body or an unexpected content-type depending on the HTTP client. Accept any
  // otherwise-unhandled content-type as an empty body instead of 415-ing.
  app.addContentTypeParser("*", (_req, payload, done) => {
    let data = "";
    payload.on("data", (chunk) => (data += chunk));
    payload.on("end", () => done(null, data.length ? data : undefined));
    payload.on("error", done);
  });

  // Tolerate an empty `application/json` body (some clients set the header on a
  // body-less POST) instead of the default 400 FST_ERR_CTP_EMPTY_JSON_BODY.
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_req, body, done) => {
      const text = (body as string).trim();
      if (!text) return done(null, undefined);
      try {
        done(null, JSON.parse(text));
      } catch (err) {
        (err as Error & { statusCode?: number }).statusCode = 400;
        done(err as Error, undefined);
      }
    },
  );

  app.get("/health", async () => ({
    status: "ok",
    rootDir: config.rootDir,
    time: new Date().toISOString(),
  }));

  await app.register(downloadsRoutes);
  await app.register(filesRoutes);
  await app.register(systemRoutes);
  await app.register(wsRoutes);

  return app;
}

async function main() {
  // Ensure the sandbox root exists before we start serving.
  await mkdir(config.rootDir, { recursive: true });
  // Scratch space for in-flight downloads (see config.tmpDir).
  await mkdir(config.tmpDir, { recursive: true });
  // Requeue jobs left mid-flight by a previous crash/restart, then re-enqueue
  // them so they resume; sweep stale temp artifacts in the background.
  reconcileOnBoot();
  const resumed = resumeInterruptedJobs();

  const app = await buildServer();
  startYtdlpAutoUpdate((msg) => app.log.info(msg));
  if (resumed > 0) app.log.info(`Resumed ${resumed} interrupted download(s)`);
  // Sweep both the library (leftovers from before scratch space existed) and
  // the scratch dir itself.
  void Promise.all([
    cleanStalePartials(config.rootDir),
    cleanStalePartials(config.tmpDir),
  ])
    .then((results) => {
      const removed = results.reduce((n, r) => n + r.removed, 0);
      if (removed > 0) app.log.info(`Cleaned up ${removed} temporary file(s)`);
    })
    .catch(() => {});
  try {
    await app.listen({ port: config.port, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
