"use client";

import Link from "next/link";
import { useState } from "react";
import type { PersonKind } from "@domain";
import { Empty, ErrorNote, Loading, Money, SectionTitle, StatusBadge } from "@/components/bits";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";

type StatementRow = { id: string; taskId: string; personId: string; version: number; amountCents: number; periodLabel: string; status: string; createdAt: string };
type PaymentRow = { id: string; statementId: string; personId: string; personName: string; amountCents: number; paidOn: string; referenceNo: string; status: string };

export function MoneyList({ kind, table }: { kind: PersonKind; table: "statements" | "payments" }) {
  const { me } = useSession();
  const [rows, setRows] = useState<Array<StatementRow | PaymentRow> | null>(null);
  const [error, setError] = useState("");
  const [booted, setBooted] = useState(false);
  const title = kind === "employee" ? (table === "statements" ? "工资核算单" : "工资发放登记") : table === "statements" ? "服务费核算单" : "服务费付款登记";
  const path = kind === "employee" ? (table === "statements" ? "/api/wage-slips" : "/api/wage-payments") : table === "statements" ? "/api/service-fees" : "/api/service-payments";

  if (me && !booted) {
    setBooted(true);
    void api<Array<StatementRow | PaymentRow>>(path).then(setRows).catch((err: unknown) => setError(err instanceof Error ? err.message : "没有读到记录"));
  }

  if (!me) return <Loading />;
  return (
    <div className="flex flex-col gap-4" data-testid={`${kind}-${table}`}>
      <SectionTitle kicker={kind === "employee" ? "劳动关系" : "项目合作"} title={title} />
      <p className="text-sm text-muted-foreground">这一页只列{kind === "employee" ? "劳动员工的工资" : "项目合作方的服务费"}，不和另一类混在一起。</p>
      {error ? <ErrorNote error={error} /> : null}
      {!rows && !error ? <Loading /> : null}
      {rows && rows.length === 0 ? <Empty>还没有记录</Empty> : null}
      {rows && rows.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              {table === "payments" ? <TableHead>人员</TableHead> : <TableHead>期间</TableHead>}
              <TableHead>金额</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>任务</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{"personName" in row ? row.personName : "periodLabel" in row ? `${row.periodLabel} · 第 ${row.version} 版` : ""}</TableCell>
                <TableCell>
                  <Money cents={row.amountCents} />
                </TableCell>
                <TableCell>
                  <StatusBadge value={row.status} />
                </TableCell>
                <TableCell>
                  {"taskId" in row ? (
                    <Link className="inline-flex min-h-11 items-center px-1 font-medium text-[var(--gx-blue)] underline-offset-4 hover:underline md:min-h-0" href={`/task/?id=${row.taskId}`}>
                      打开
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">{"referenceNo" in row ? row.referenceNo : ""}</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </div>
  );
}
