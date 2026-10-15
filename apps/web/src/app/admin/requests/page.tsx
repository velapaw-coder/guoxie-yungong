"use client";

import { useState } from "react";
import { Empty, ErrorNote, Field, Loading, SectionTitle, StatusBadge } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { statusLabel } from "@/lib/labels";
import { useSession } from "@/lib/session";

type RequestRow = { id: string; type: string; content: string; status: string; resolution: string | null; user_name?: string; user_kind?: string; created_at: string };

export default function AdminRequestsPage() {
  const { me } = useSession();
  const [rows, setRows] = useState<RequestRow[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [booted, setBooted] = useState(false);

  function load() {
    return api<RequestRow[]>("/api/requests").then(setRows).catch((err: unknown) => setError(err instanceof Error ? err.message : "申请没有打开"));
  }
  if (me && !booted) {
    setBooted(true);
    void load();
  }
  if (!me) return <Loading />;

  return (
    <div className="grid gap-4" data-testid="admin-requests">
      <SectionTitle title="个人信息处理" kicker="查阅、更正、删除、投诉" />
      {error ? <ErrorNote error={error} /> : null}
      {!rows ? <Loading /> : null}
      {rows && rows.length === 0 ? <Empty>还没有申请</Empty> : null}
      <ul className="grid gap-3">
        {rows?.map((row) => (
          <li key={row.id} className="grid gap-2 rounded-lg border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>{row.user_name ?? "申请人"} · {statusLabel(row.user_kind)} · {statusLabel(row.type)}</span>
              <StatusBadge value={row.status} />
            </div>
            <p>{row.content}</p>
            {row.resolution ? <p className="text-muted-foreground">{row.resolution}</p> : null}
            <form className="grid gap-2" data-testid={`handle-${row.id}`} onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError(""); void api(`/api/requests/${row.id}/handle`, { json: { status: String(form.get("status")), resolution: String(form.get("resolution") ?? "") } }).then(() => load()).catch((err: unknown) => setError(err instanceof Error ? err.message : "没有处理")).finally(() => setBusy(false)); }}>
              <Field label="处理结果">
                <select name="status" className="h-8 rounded-lg border bg-transparent px-2" defaultValue="accepted" data-testid="handle-status">
                  <option value="accepted">受理</option>
                  <option value="done">办结</option>
                  <option value="rejected">不予处理</option>
                </select>
              </Field>
              <Field label="说明">
                <Textarea name="resolution" required data-testid="handle-resolution" />
              </Field>
              <Button type="submit" variant="outline" disabled={busy} data-testid="handle-submit">保存处理</Button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
