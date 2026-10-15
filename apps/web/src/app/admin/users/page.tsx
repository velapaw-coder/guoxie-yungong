"use client";

import { useState } from "react";
import { Empty, ErrorNote, Field, Loading, SectionTitle, StatusBadge } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { ROLE_LABEL, ROLE_OPTIONS, statusLabel } from "@/lib/labels";
import { useSession } from "@/lib/session";

type UserRow = { id: string; name: string; email: string; kind: string; status: string; roles: string[] };

export default function UsersPage() {
  const { me } = useSession();
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [booted, setBooted] = useState(false);

  function load() {
    return api<UserRow[]>("/api/admin/users").then(setRows).catch((err: unknown) => setError(err instanceof Error ? err.message : "没有读到账号"));
  }
  if (me && !booted) {
    setBooted(true);
    void load();
  }
  if (!me) return <Loading />;

  return (
    <div className="grid gap-4" data-testid="users-page">
      <SectionTitle title="岗位" kicker="劳动员工和项目合作方不能授予管理岗位" />
      {error ? <ErrorNote error={error} /> : null}
      {!rows ? <Loading /> : null}
      {rows && rows.length === 0 ? <Empty>还没有账号</Empty> : null}
      <ul className="grid gap-3">
        {rows?.map((row) => (
          <li key={row.id} className="rounded-lg border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {row.name} · {row.email}
                <span className="text-muted-foreground"> · {statusLabel(row.kind)}</span>
              </span>
              <StatusBadge value={row.status} />
            </div>
            {row.kind === "operator" ? (
              <form className="mt-2 grid gap-2" data-testid={`roles-${row.email}`} onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const roles = ROLE_OPTIONS.filter((role) => form.get(role) === "on"); setBusy(true); setError(""); void api(`/api/admin/users/${row.id}/roles`, { json: { roles } }).then(() => load()).catch((err: unknown) => setError(err instanceof Error ? err.message : "没有更新岗位")).finally(() => setBusy(false)); }}>
                <div className="flex flex-wrap gap-3">
                  {ROLE_OPTIONS.map((role) => (
                    <label key={role} className="flex items-center gap-1">
                      <input type="checkbox" name={role} defaultChecked={row.roles.includes(role)} />
                      {ROLE_LABEL[role]}
                    </label>
                  ))}
                </div>
                <Button type="submit" variant="outline" disabled={busy}>保存岗位</Button>
              </form>
            ) : (
              <p className="mt-1 text-muted-foreground">身份在注册时确定，不能改成管理人员。</p>
            )}
          </li>
        ))}
      </ul>
      <form className="grid gap-3 rounded-lg border p-3" data-testid="operator-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const roles = ROLE_OPTIONS.filter((role) => form.get(role) === "on"); setBusy(true); setError(""); void api("/api/admin/users", { json: { name: String(form.get("name") ?? ""), email: String(form.get("email") ?? ""), designatedEmail: String(form.get("email") ?? ""), phone: String(form.get("phone") ?? ""), password: String(form.get("password") ?? ""), roles } }).then(() => { (event.target as HTMLFormElement).reset(); return load(); }).catch((err: unknown) => setError(err instanceof Error ? err.message : "没有创建")).finally(() => setBusy(false)); }}>
        <p className="font-medium">开设管理人员</p>
        <Field label="姓名"><Input name="name" required data-testid="operator-name" /></Field>
        <Field label="邮箱"><Input name="email" type="email" required data-testid="operator-email" /></Field>
        <Field label="手机"><Input name="phone" data-testid="operator-phone" /></Field>
        <Field label="密码"><Input name="password" type="password" required minLength={8} data-testid="operator-password" /></Field>
        <div className="flex flex-wrap gap-3 text-sm">
          {ROLE_OPTIONS.map((role) => (
            <label key={role} className="flex items-center gap-1">
              <input type="checkbox" name={role} data-testid={`operator-role-${role}`} />
              {ROLE_LABEL[role]}
            </label>
          ))}
        </div>
        <Button type="submit" disabled={busy} data-testid="operator-submit">开设</Button>
      </form>
    </div>
  );
}
