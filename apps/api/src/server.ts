import { mkdir } from "node:fs/promises";
import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { config } from "./config.js";
import { reconcileOnBoot } from "./db.js";
import { resumeInterruptedJobs } from "./downloads-manager.js";
import { cleanStaleDirect, cleanStalePartials } from "./lib/cleanup.js";
import { downloadsRoutes } from "./routes/downloads.js";
import { filesRoutes } from "./routes/files.js";
import { systemRoutes } from "./routes/system.js";
import { wsRoutes } from "./routes/ws.js";
import { startYtdlpAutoUpdate } from "./lib/ytdlp-autoupdate.js";
import { authHook } from "./auth/guard.js";
import { authRoutes } from "./routes/auth.js";
import { adminRoutes } from "./routes/admin.js";
import { pruneResets, pruneSessions } from "./auth/store.js";
import { pruneAudit } from "./auth/audit.js";

async function buildServer() {
  const app = Fastify({
    // Behind the proxy every request arrives from the proxy container, so
    // without this `req.ip` is the same value for everyone — and the login
    // throttle would count the whole internet as a single client.
    trustProxy: true,
    logger: {
      transport: {
        target: "pino-pretty",
        options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" },
      },
    },
  });

  // `credentials` so the session cookie survives the cross-origin fetches the
  // development setup makes; behind the proxy everything is same-origin anyway.
  //
  // In development the dev server is often opened from another machine on the
  // network — a phone, a second laptop — and its origin is then a LAN address
  // nobody configured. Those are accepted while developing, and only those:
  // in production the origin stays exactly what WEB_ORIGIN says, because there
  // the browser talks to the proxy and never to this service directly.
  const devOrigin = (origin: string): boolean =>
    /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
      origin,
    );
  await app.register(cors, {
    origin:
      process.env.NODE_ENV === "production"
        ? config.webOrigin
        : (origin, cb) =>
            cb(null, !origin || origin === config.webOrigin || devOrigin(origin)),
    credentials: true,
  });
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

  // Registered before the guard's routes so the hook below covers them all.
  app.addHook("preHandler", authHook);

  await app.register(authRoutes);
  await app.register(adminRoutes);
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
  pruneSessions();
  pruneResets();
  pruneAudit();
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
  void cleanStaleDirect(config.tmpDir)
    .then(
      (n) => n > 0 && app.log.info(`Discarded ${n} uncollected download(s)`),
    )
    .catch(() => {});
  try {
    await app.listen({ port: config.port, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
