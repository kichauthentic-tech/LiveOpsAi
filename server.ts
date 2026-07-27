import path from "path";
import { createServer as createViteServer } from "vite";
import { createApp } from "./src/server/createApp";

// Local dev / traditional Node hosting entrypoint — attaches Vite's dev middleware (or the
// built static files in production) on top of the shared Express app from createApp(), then
// listens on a port. Vercel's serverless deployment does NOT use this file — see api/index.ts,
// which reuses the same createApp() but lets Vercel serve the static frontend separately.
async function startServer() {
  const app = createApp();
  const PORT = Number(process.env.PORT) || 3000;

  // Vite middleware for dev or static serving for prod
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const express = (await import("express")).default;
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`LiveOps AI Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
