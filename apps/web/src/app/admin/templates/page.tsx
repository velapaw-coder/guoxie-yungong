"use client";

import { useState } from "react";
import { Empty, ErrorNote, Field, Loading, SectionTitle, StatusBadge } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { statusLabel } from "@/lib/labels";
import { useSession } from "@/lib/session";

type Template = { id: string; kind: string; version: string; title: string; body: string; active: number; created_at: string };

export default function TemplatesPage() {
  const { me } = useSession();
  const [rows, setRows] = useState<Template[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [booted, setBooted] = useState(false);

  function load() {
    return api<Template[]>("/api/admin/templates").then(setRows).catch((err: unknown) => setError(err instanceof Error ? err.message : "模板没有打开"));
  }
  if (me && !booted) {
    setBooted(true);
    void load();
  }
  if (!me) return <Loading />;

  return (
    <div className="grid gap-4" data-testid="templates-page">
      <SectionTitle title="合同模板" kicker="新版本默认停用，启用后才用于新合同" />
      <p className="text-sm text-muted-foreground">现有文本是法务初稿 V0.1，未经法务审核，不得对外使用。</p>
      {error ? <ErrorNote error={error} /> : null}
      {!rows ? <Loading /> : null}
      {rows && rows.length === 0 ? <Empty>还没有模板</Empty> : null}
      <ul className="grid gap-3">
        {rows?.map((row) => (
          <li key={row.id} className="rounded-lg border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>{row.title} · {statusLabel(row.kind)} · {row.version}</span>
              <StatusBadge value={row.active ? "active" : "draft"} />
            </div>
            <details className="mt-2">
              <summary>正文</summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs">{row.body}</pre>
            </details>
            {row.active ? null : (
              <Button type="button" className="mt-2" variant="outline" disabled={busy} data-testid={`activate-${row.id}`} onClick={() => { setBusy(true); setError(""); void api(`/api/admin/templates/${row.id}/activate`, { method: "POST", json: {} }).then(() => load()).catch((err: unknown) => setError(err instanceof Error ? err.message : "没有启用")).finally(() => setBusy(false)); }}>
                启用这一版
              </Button>
            )}
          </li>
        ))}
      </ul>
      <form className="grid gap-3" data-testid="template-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError(""); void api("/api/admin/templates", { json: { kind: String(form.get("kind")), title: String(form.get("title") ?? ""), version: String(form.get("version") ?? ""), body: String(form.get("body") ?? "") } }).then(() => { (event.target as HTMLFormElement).reset(); return load(); }).catch((err: unknown) => setError(err instanceof Error ? err.message : "没有保存")).finally(() => setBusy(false)); }}>
        <Field label="类型">
          <select name="kind" className="h-8 rounded-lg border bg-transparent px-2" data-testid="template-kind" defaultValue="labor">
            <option value="labor">劳动合同</option>
            <option value="service">项目服务协议</option>
            <option value="privacy">个人信息同意</option>
            <option value="platform">平台服务协议</option>
          </select>
        </Field>
        <Field label="标题"><Input name="title" required data-testid="template-title" /></Field>
        <Field label="版本"><Input name="version" required defaultValue="V0.2" data-testid="template-version" /></Field>
        <Field label="正文"><Textarea name="body" required data-testid="template-body" placeholder="至少十字。新模板保存后处于停用。" /></Field>
        <Button type="submit" disabled={busy} data-testid="template-submit">保存为停用版本</Button>
      </form>
    </div>
  );
}
