"use client";

import { useState } from "react";
import { Empty, ErrorNote, Field, Loading, SectionTitle, StatusBadge } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { statusLabel } from "@/lib/labels";
import { useSession } from "@/lib/session";

type RequestRow = { id: string; type: string; content: string; status: string; resolution: string | null; created_at: string };

export default function PrivacyPage() {
  const { me } = useSession();
  const [rows, setRows] = useState<RequestRow[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [booted, setBooted] = useState(false);

  function load() {
    return api<RequestRow[]>("/api/requests").then(setRows).catch((err: unknown) => setError(err instanceof Error ? err.message : "没有读到申请"));
  }

  if (me && !booted) {
    setBooted(true);
    void load();
  }
  if (!me) return <Loading />;

  return (
    <div className="grid gap-4">
      <SectionTitle title="个人信息申请" kicker="查阅、更正、删除、投诉" />
      <form
        className="grid gap-3"
        data-testid="privacy-form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setBusy(true);
          setError("");
          void api("/api/requests", { json: { type: String(form.get("type")), content: String(form.get("content") ?? "") } })
            .then(() => {
              (event.target as HTMLFormElement).reset();
              return load();
            })
            .catch((err: unknown) => setError(err instanceof Error ? err.message : "没有提交"))
            .finally(() => setBusy(false));
        }}
      >
        <Field label="类型">
          <select name="type" className="h-8 rounded-lg border bg-transparent px-2 text-sm" data-testid="privacy-type" defaultValue="access">
            <option value="access">查阅</option>
            <option value="correction">更正</option>
            <option value="deletion">删除</option>
            <option value="complaint">投诉</option>
          </select>
        </Field>
        <Field label="内容">
          <Textarea name="content" required data-testid="privacy-content" placeholder="写明要查阅或更正的事项" />
        </Field>
        <Button type="submit" disabled={busy} data-testid="privacy-submit">提交申请</Button>
        <ErrorNote error={error} />
      </form>
      {!rows ? <Loading /> : null}
      {rows && rows.length === 0 ? <Empty>还没有申请</Empty> : null}
      <ul className="grid gap-2">
        {rows?.map((row) => (
          <li key={row.id} className="rounded-lg border px-3 py-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span>{statusLabel(row.type)}</span>
              <StatusBadge value={row.status} />
            </div>
            <p className="mt-1">{row.content}</p>
            {row.resolution ? <p className="text-muted-foreground">处理说明：{row.resolution}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
