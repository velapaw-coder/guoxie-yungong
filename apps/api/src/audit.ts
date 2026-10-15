import type { Ctx } from "./types";
import { id, run } from "./util";

export async function audit(
  ctx: Ctx,
  entry: {
    action: string;
    objectType: string;
    objectId: string;
    before?: unknown;
    after?: unknown;
    actorName?: string;
  },
): Promise<void> {
  await run(
    ctx.db,
    `insert into audit_logs
      (id, actor_id, actor_name, action, object_type, object_id, before_json, after_json, ip, user_agent, created_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id(),
    entry.actorName ? null : (ctx.actor?.id ?? null),
    entry.actorName ?? ctx.actor?.name ?? "系统",
    entry.action,
    entry.objectType,
    entry.objectId,
    entry.before == null ? null : JSON.stringify(entry.before),
    entry.after == null ? null : JSON.stringify(entry.after),
    ctx.ip,
    ctx.ua,
    ctx.now(),
  );
}
