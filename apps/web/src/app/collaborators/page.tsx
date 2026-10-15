"use client";

import Link from "next/link";
import { useState } from "react";
import { Empty, ErrorNote, Loading, SectionTitle, StatusBadge } from "@/components/bits";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";

type Row = { id: string; name: string; email: string; status: string; identityStatus: string; ready: boolean; blockers: string[]; contractStatus: string | null };

export default function CollaboratorsPage() {
  const { me } = useSession();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const [booted, setBooted] = useState(false);
  if (me && !booted) {
    setBooted(true);
    void api<Row[]>("/api/collaborators").then(setRows).catch((err: unknown) => setError(err instanceof Error ? err.message : "名册没有打开"));
  }
  if (!me) return <Loading />;
  return (
    <div className="grid gap-4" data-testid="collaborator-list">
      <SectionTitle kicker="民事服务关系" title="项目合作方" />
      <p className="text-sm text-muted-foreground">这里只有项目服务协议。劳动员工不在这本名册里。</p>
      {error ? <ErrorNote error={error} /> : null}
      {!rows && !error ? <Loading /> : null}
      {rows && rows.length === 0 ? <Empty>还没有项目合作方</Empty> : null}
      <ul className="grid gap-2">
        {rows?.map((row) => (
          <li key={row.id}>
            <Link href={`/collaborator/?id=${row.id}`} className="kind-collaborator flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3 py-3" data-testid={`collaborator-${row.email}`}>
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
