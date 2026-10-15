"use client";

import Link from "next/link";
import { useState } from "react";
import { Empty, ErrorNote, Loading, SectionTitle, StatusBadge } from "@/components/bits";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";

type Row = { id: string; name: string; email: string; status: string; identityStatus: string; ready: boolean; blockers: string[]; contractStatus: string | null };

export default function EmployeesPage() {
  const { me } = useSession();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const [booted, setBooted] = useState(false);
  if (me && !booted) {
    setBooted(true);
    void api<Row[]>("/api/employees").then(setRows).catch((err: unknown) => setError(err instanceof Error ? err.message : "名册没有打开"));
  }
  if (!me) return <Loading />;
  return (
    <div className="grid gap-4" data-testid="employee-list">
      <SectionTitle kicker="劳动关系" title="劳动员工" />
      <p className="text-sm text-muted-foreground">这里只有劳动合同关系。项目合作方不在这本名册里。</p>
      {error ? <ErrorNote error={error} /> : null}
      {!rows && !error ? <Loading /> : null}
      {rows && rows.length === 0 ? <Empty>还没有劳动员工</Empty> : null}
      <ul className="grid gap-2">
        {rows?.map((row) => (
          <li key={row.id}>
            <Link href={`/employee/?id=${row.id}`} className="kind-employee flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3 py-3" data-testid={`employee-${row.email}`}>
              <span>
                <span className="block font-medium">{row.name}</span>
                <span className="text-xs text-muted-foreground">{row.email} · {row.ready ? "可以发单" : row.blockers[0]}</span>
              </span>
              <span className="flex gap-2">
                <StatusBadge value={row.identityStatus} />
                <StatusBadge value={row.status === "disabled" ? "disabled" : row.contractStatus} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
