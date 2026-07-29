import express from "express";
import type { Request, Response, NextFunction } from "express";
import { createProxyMiddleware } from 'http-proxy-middleware';
import { runMigrations } from 'stripe-replit-sync';
import { registerRoutes } from "./routes";
import { getStripeSync } from "./stripeClient";
import { getAppBaseUrl, getAllowedOrigins } from "./publicUrl";
import { WebhookHandlers } from "./webhookHandlers";
import * as fs from "fs";
import * as path from "path";

const app = express();
const log = console.log;

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.log('DATABASE_URL not set, skipping Stripe initialization');
    return;
  }

  try {
    console.log('Initializing Stripe schema...');
    await runMigrations({ 
      databaseUrl,
      schema: 'stripe'
    });
    console.log('Stripe schema ready');

    const { getStripeAccountId } = await import('./stripeClient.js');
    const acctId = getStripeAccountId();
    if (acctId) {
      console.log(`Stripe account: ${acctId}`);
    } else {
      console.warn('STRIPE_ACCOUNT_ID not set — set it to the platform acct_… ID for sanity-check logging.');
    }

    const stripeSync = await getStripeSync();

    console.log('Setting up managed webhook...');
    const webhookBaseUrl = getAppBaseUrl();
    const { webhook, uuid } = await stripeSync.findOrCreateManagedWebhook(
      `${webhookBaseUrl}/api/stripe/webhook`,
      {
        enabled_events: ['*'],
        description: 'SecureChat Stripe sync webhook',
      }
    );
    console.log(`Webhook configured: ${webhook.url}`);

    stripeSync.syncBackfill()
      .then(() => {
        console.log('Stripe data synced');
      })
      .catch((err: Error) => {
        console.error('Error syncing Stripe data:', err);
      });
  } catch (error) {
    console.warn('Stripe not configured, skipping — server will start without Stripe:', (error as Error).message ?? error);
  }
}

// Cloudflare + Render already terminate TLS and redirect HTTP→HTTPS, but
// without HSTS a browser that's never visited before will still make its
// FIRST request in plaintext (stripped by an on-path attacker before the
// redirect lands). max-age=1yr + includeSubDomains + preload closes that gap
// and gets pryvoapp.com onto the browser HSTS preload list.
function setupSecurityHeaders(app: express.Application) {
  app.use((_req, res, next) => {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });
}

function setupCors(app: express.Application) {
  app.use((req, res, next) => {
    const origins = new Set(getAllowedOrigins());

    const origin = req.header("origin");

    if (origin && origins.has(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
      );
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.header("Access-Control-Allow-Credentials", "true");
    }

    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }

    next();
  });
}

function setupRequestLogging(app: express.Application) {
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      if (!path.startsWith("/api")) return;

      const duration = Date.now() - start;

      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    });

    next();
  });
}

function getAppName(): string {
  try {
    const appJsonPath = path.resolve(process.cwd(), "app.json");
    const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}

function serveExpoManifest(platform: string, res: Response) {
  const manifestPath = path.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json",
  );

  if (!fs.existsSync(manifestPath)) {
    return res
      .status(404)
      .json({ error: `Manifest not found for platform: ${platform}` });
  }

  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");

  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}

function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName,
}: {
  req: Request;
  res: Response;
  landingPageTemplate: string;
  appName: string;
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
    .replace(/APP_NAME_PLACEHOLDER/g, appName);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}

function configureExpoAndLanding(app: express.Application) {
  const templatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html",
  );
  const marketingPath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "marketing-page.html",
  );
  const landingPageTemplate = fs.readFileSync(templatePath, "utf-8");
  const marketingPageTemplate = fs.readFileSync(marketingPath, "utf-8");
  const appName = getAppName();
  const isDev = process.env.NODE_ENV === "development";

  log("Serving static Expo files with dynamic manifest routing");

  if (isDev) {
    log("Development mode: proxying to Expo dev server on port 8081");
    
    const expoProxy = createProxyMiddleware({
      target: 'http://localhost:8081',
      changeOrigin: true,
      ws: true,
      logLevel: 'warn',
    });

    // Dedicated proxy for /app/* that strips the /app prefix before forwarding,
    // so HTTP requests AND HMR/WebSocket upgrades both use the same rewrite.
    const appAliasProxy = createProxyMiddleware({
      target: 'http://localhost:8081',
      changeOrigin: true,
      ws: true,
      logLevel: 'warn',
      pathRewrite: { '^/app': '' },
    });

    app.use((req: Request, res: Response, next: NextFunction) => {
      // /open shortcut works in dev too so you can test the deep link locally.
      if (req.path === "/open") {
        const host = req.get("host") || "";
        const expsUrl = `exps://${host}`;
        return res.redirect(expsUrl);
      }

      if (req.path.startsWith("/api") || req.path.startsWith("/objects") || req.path.startsWith("/public-objects") || req.path === "/privacy" || req.path === "/support" || req.path === "/terms") {
        return next();
      }

      // In dev, /app/* is a convenience alias for the Expo dev server (which
      // serves the app at /). Use a dedicated proxy mount with pathRewrite so
      // HMR websockets and asset requests both work consistently.
      if (req.path === "/app" || req.path.startsWith("/app/")) {
        return appAliasProxy(req, res, next);
      }

      return expoProxy(req, res, next);
    });
  } else {
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith("/api") || req.path === "/privacy" || req.path === "/support" || req.path === "/terms") {
        return next();
      }

      if (req.path !== "/" && req.path !== "/manifest" && req.path !== "/open") {
        return next();
      }

      const platform = req.header("expo-platform");
      if (platform && (platform === "ios" || platform === "android")) {
        return serveExpoManifest(platform, res);
      }

      // Shortcut: /open immediately deep-links into Expo Go for shareable
      // "test the app" links. Falls back to the marketing page on desktop.
      if (req.path === "/open") {
        const forwardedHost = req.header("x-forwarded-host");
        const host = forwardedHost || req.get("host") || "";
        const expsUrl = `exps://${host}`;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.status(200).send(`<!doctype html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Open ${appName}</title>
<meta http-equiv="refresh" content="0;url=${expsUrl}">
<style>body{font-family:-apple-system,system-ui,sans-serif;background:#0b0b16;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:1.5rem;text-align:center}a{color:#7c5cff;font-weight:600}</style>
</head><body>
<h1 style="margin:0 0 1rem">Opening ${appName}…</h1>
<p>If nothing happens, make sure <a href="https://expo.dev/go" target="_blank">Expo Go</a> is installed, then <a href="${expsUrl}">tap here</a>.</p>
<p style="margin-top:2rem;opacity:0.7"><a href="/" style="color:#aaa">Back to landing page</a></p>
<script>setTimeout(function(){window.location.href=${JSON.stringify(expsUrl)};},100);</script>
</body></html>`);
      }

      if (req.path === "/") {
        const forwardedHost = req.header("x-forwarded-host");
        const host = forwardedHost || req.get("host") || "";
        const expsUrl = `${host}`;
        const html = marketingPageTemplate
          .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
          .replace(/APP_NAME_PLACEHOLDER/g, appName);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.status(200).send(html);
      }

      next();
    });

    app.use("/assets", express.static(path.resolve(process.cwd(), "assets")));
    app.use(express.static(path.resolve(process.cwd(), "static-build")));

    // Web app bundle, served at /app/* with SPA fallback to index.html so
    // client-side routing works for any sub-path the app navigates to.
    const webBuildDir = path.resolve(process.cwd(), "web-build");
    if (fs.existsSync(webBuildDir)) {
      app.use("/app", express.static(webBuildDir, { index: false }));
      app.get(/^\/app(\/.*)?$/, (_req: Request, res: Response) => {
        res.setHeader("Cache-Control", "no-cache");
        res.sendFile(path.join(webBuildDir, "index.html"));
      });
    } else {
      app.get(/^\/app(\/.*)?$/, (_req: Request, res: Response) => {
        res.status(503).type("text/html").send(
          `<!doctype html><meta charset="utf-8"><title>Web app unavailable</title>` +
          `<div style="font-family:-apple-system,system-ui,sans-serif;padding:2rem;max-width:560px;margin:auto;color:#222">` +
          `<h1>Web app is being prepared</h1>` +
          `<p>The browser version of ${getAppName()} hasn't been built yet. Please redeploy or try again in a few minutes.</p>` +
          `<p><a href="/" style="color:#7c5cff">Back to home</a></p></div>`,
        );
      });
    }
  }

  log("Expo routing: Checking expo-platform header on / and /manifest");
}

function setupErrorHandler(app: express.Application) {
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const error = err as {
      status?: number;
      statusCode?: number;
      message?: string;
    };

    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";

    res.status(status).json({ message });

    throw err;
  });
}

(async () => {
  const { ensureUserRecoverySchema } = await import('./db.js');
  await ensureUserRecoverySchema();

  await initStripe().catch((err: Error) => {
    console.warn('Stripe initialization skipped:', err.message ?? err);
  });
  
  setupSecurityHeaders(app);
  setupCors(app);

  app.post(
    '/api/stripe/webhook/:uuid',
    express.raw({ type: 'application/json' }),
    async (req, res) => {
      const signature = req.headers['stripe-signature'];

      if (!signature) {
        return res.status(400).json({ error: 'Missing stripe-signature' });
      }

      try {
        const sig = Array.isArray(signature) ? signature[0] : signature;

        if (!Buffer.isBuffer(req.body)) {
          console.error('Webhook body is not a Buffer');
          return res.status(500).json({ error: 'Webhook processing error' });
        }

        const { uuid } = req.params;
        await WebhookHandlers.processWebhook(req.body as Buffer, sig, uuid);

        res.status(200).json({ received: true });
      } catch (error: any) {
        console.error('Webhook error:', error.message);
        res.status(400).json({ error: 'Webhook processing error' });
      }
    }
  );

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  setupRequestLogging(app);
  
  const server = await registerRoutes(app);
  
  configureExpoAndLanding(app);

  setupErrorHandler(app);

  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`express server serving on port ${port}`);
    },
  );
})();
