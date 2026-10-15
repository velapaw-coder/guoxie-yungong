"use client";

import Link from "next/link";
import { useState } from "react";
import { ErrorNote, Loading, SectionTitle, StatusBadge } from "@/components/bits";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";

type PersonRow = { id: string; name: string; status: string; identityStatus: string; ready: boolean; blockers: string[]; contractStatus: string | null };

export default function HomePage() {
  const { me } = useSession();
  const [employees, setEmployees] = useState<PersonRow[] | null>(null);
  const [collaborators, setCollaborators] = useState<PersonRow[] | null>(null);
  const [error, setError] = useState("");
  const [booted, setBooted] = useState(false);

  if (me?.kind === "operator" && !booted) {
    setBooted(true);
    void Promise.all([api<PersonRow[]>("/api/employees"), api<PersonRow[]>("/api/collaborators")])
      .then(([left, right]) => {
        setEmployees(left);
        setCollaborators(right);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "名册没有打开"));
  }

  if (!me) return <Loading />;

  if (me.kind !== "operator") {
    const href = me.kind === "employee" ? `/employee/?id=${me.id}` : `/collaborator/?id=${me.id}`;
    const word = me.kind === "employee" ? "劳动合同和工资" : "服务协议和服务费";
    return (
      <div className="grid gap-4">
        <SectionTitle title={`${me.name}的工作台`} kicker={me.kind === "employee" ? "劳动关系" : "项目合作"} />
        <p className="text-sm text-muted-foreground">你的事项按{word}办理。另一类人员的页面不会出现在导航里。</p>
        <Card className={me.kind === "employee" ? "kind-employee" : "kind-collaborator"}>
          <CardHeader>
            <CardTitle>继续办理</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3 text-sm">
            <Link href={href} data-testid="home-desk" className="underline-offset-4 hover:underline">
              打开我的档案
            </Link>
            <Link href="/consent/" className="underline-offset-4 hover:underline">
              个人信息单独同意
            </Link>
            <Link href="/verify/" className="underline-offset-4 hover:underline">
              实名认证
            </Link>
            <Link href="/privacy/" className="underline-offset-4 hover:underline">
              查阅、更正、删除或投诉
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <SectionTitle title="工作台" kicker={`管理人员 · ${me.name}`} />
      <p className="max-w-3xl text-sm text-muted-foreground">
        发单和验收必须是两个人，付款制单和复核也必须是两个人。劳动员工与项目合作方从名册开始就分开，没有合并筛选。
      </p>
      {error ? <ErrorNote error={error} /> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Roster title="劳动员工" tone="kind-employee" rows={employees} href={(id) => `/employee/?id=${id}`} testid="home-employees" />
        <Roster title="项目合作方" tone="kind-collaborator" rows={collaborators} href={(id) => `/collaborator/?id=${id}`} testid="home-collaborators" />
      </div>
    </div>
  );
}

function Roster({ title, tone, rows, href, testid }: { title: string; tone: string; rows: PersonRow[] | null; href: (id: string) => string; testid: string }) {
  return (
    <Card className={tone}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2" data-testid={testid}>
        {!rows ? <Loading /> : null}
        {rows && rows.length === 0 ? <p className="text-sm text-muted-foreground">名册是空的</p> : null}
        {rows?.map((row) => (
          <Link key={row.id} href={href(row.id)} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted/40">
            <span>
              {row.name}
              <span className="block text-xs text-muted-foreground">{row.ready ? "可以发单" : row.blockers[0]}</span>
            </span>
            <StatusBadge value={row.status === "disabled" ? "disabled" : row.contractStatus} />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
