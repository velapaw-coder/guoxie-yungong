"use client";

import { useState } from "react";
import { Empty, ErrorNote, Field, Loading, SectionTitle } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";

type Backup = { id: string; sha256: string; size: number; created_at: string; note: string | null };

export default function BackupsPage() {
  const { me } = useSession();
  const [rows, setRows] = useState<Backup[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [booted, setBooted] = useState(false);

  function load() {
    return api<Backup[]>("/api/admin/backups").then(setRows).catch((err: unknown) => setError(err instanceof Error ? err.message : "备份没有打开"));
  }
  if (me && !booted) {
    setBooted(true);
    void load();
  }
  if (!me) return <Loading />;

  return (
    <div className="grid gap-4" data-testid="backups-page">
      <SectionTitle title="数据备份" kicker="密码和证件哈希不会写入备份" />
      <form className="flex flex-wrap items-end gap-2" data-testid="backup-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError(""); void api("/api/admin/backups", { json: { note: String(form.get("note") ?? "") } }).then(() => { (event.target as HTMLFormElement).reset(); return load(); }).catch((err: unknown) => setError(err instanceof Error ? err.message : "没有备份")).finally(() => setBusy(false)); }}>
        <Field label="备注"><Input name="note" data-testid="backup-note" placeholder="手动备份" /></Field>
        <Button type="submit" disabled={busy} data-testid="backup-submit">立即备份</Button>
      </form>
      {error ? <ErrorNote error={error} /> : null}
      {!rows ? <Loading /> : null}
      {rows && rows.length === 0 ? <Empty>还没有备份</Empty> : null}
      <ul className="grid gap-2 text-sm">
        {rows?.map((row) => (
          <li key={row.id} className="rounded-lg border px-3 py-2">
            <p>{row.note || "备份"} · {row.created_at}</p>
            <p className="break-all text-xs text-muted-foreground">{row.size} 字节 · SHA-256 {row.sha256}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
