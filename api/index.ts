import { createApp } from "../src/server/createApp";

// Vercel serverless entrypoint. Every request under /api/* is routed here (see vercel.json),
// and Vercel's Node runtime accepts an Express app directly as the default export since an
// Express app is itself a (req, res) => void function. The static frontend (dist/) is served
// by Vercel separately, not by this function — see the "vite dev middleware / static serving"
// branch in server.ts, which only applies to local dev / traditional Node hosting.
const app = createApp();

export default app;
