import { app } from "./app";
import { runMaintenance } from "./maintenance";
import type { Env } from "./types";

type WaitCtx = { waitUntil(promise: Promise<unknown>): void };

export default {
  fetch(request: Request, env: Env, ctx: WaitCtx) {
    return app.fetch(request, env, ctx as never);
  },
  scheduled(_event: unknown, env: Env, ctx: WaitCtx) {
    ctx.waitUntil(runMaintenance(env));
  },
};
