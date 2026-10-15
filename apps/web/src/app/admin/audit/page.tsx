"use client";

import { useState } from "react";
import { DownloadButton, Empty, ErrorNote, Field, Loading, SectionTitle } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";

type AuditRow = { id: string; actor_name: string | null; action: string; object_type: string; object_id: string; created_at: string; ip: string | null };

export default function AuditPage() {
  const { me } = useSession();
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [error, setError] = useState("");
  const [booted, setBooted] = useState(false);

  function load(objectType = "", q = "") {
    const query = new URLSearchParams();
    if (objectType) query.set("objectType", objectType);
    if (q) query.set("q", q);
    const suffix = query.size ? `?${query}` : "";
    return api<AuditRow[]>(`/api/admin/audit${suffix}`).then(setRows).catch((err: unknown) => setError(err instanceof Error ? err.message : "审计日志没有打开"));
  }

  if (me && !booted) {
    setBooted(true);
    void load();
  }
  if (!me) return <Loading />;

  return (
    <div className="grid gap-4" data-testid="audit-page">
      <SectionTitle title="审计日志" kicker="只追加，不能改、不能删">
        <DownloadButton path="/api/admin/audit.csv" filename="审计日志.csv" testid="audit-csv">导出 CSV</DownloadButton>
      </SectionTitle>
      <form className="flex flex-wrap items-end gap-2" data-testid="audit-filter" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); setError(""); void load(String(form.get("objectType") ?? ""), String(form.get("q") ?? "")); }}>
        <Field label="对象类型">
          <Input name="objectType" data-testid="audit-type" placeholder="task" />
        </Field>
        <Field label="关键字">
          <Input name="q" data-testid="audit-q" placeholder="动作、对象或操作人" />
        </Field>
        <Button type="submit" data-testid="audit-search">筛选</Button>
      </form>
      {error ? <ErrorNote error={error} /> : null}
      {!rows && !error ? <Loading /> : null}
      {rows && rows.length === 0 ? <Empty>没有匹配的记录</Empty> : null}
      {rows && rows.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>时间</TableHead>
              <TableHead>操作人</TableHead>
              <TableHead>动作</TableHead>
              <TableHead>对象</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.created_at}</TableCell>
                <TableCell>{row.actor_name ?? "—"}</TableCell>
                <TableCell>{row.action}</TableCell>
                <TableCell>{row.object_type} · {row.object_id.slice(0, 8)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </div>
  );
}
