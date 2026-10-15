"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { COPY, yuanToCents, type PersonKind } from "@domain";
import { DownloadButton, Empty, ErrorNote, Field, Loading, Money, SectionTitle, StatusBadge, runAction } from "@/components/bits";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { hasRole } from "@/lib/labels";
import { useSession } from "@/lib/session";

type ContractView = {
  id: string;
  title: string;
  body: string;
  status: string;
  providerContractId: string | null;
  evidenceNo: string | null;
  fileId: string | null;
  fileSha256: string | null;
  silentConfirmAgreed: boolean;
  silentConfirmDays: number | null;
  designatedEmail: string;
  signedAt: string | null;
  terminatedAt: string | null;
  terminationReason: string | null;
};

type TaskBrief = { id: string; title: string; status: string; amountCents: number; createdAt: string };

type Dossier = {
  person: {
    id: string;
    name: string;
    email: string;
    designatedEmail: string;
    phone: string | null;
    status: string;
    identityStatus: string;
    idNumberMasked: string | null;
    settlementFlag: string | null;
  };
  readiness: { ready: boolean; blockers: string[]; consent: boolean; identity: boolean; signed: boolean; active: boolean };
  consent: { documentVersion: string; idNumberAgreed: boolean; faceAgreed: boolean; faceAlternative: string | null; bankAgreed: boolean; thirdPartyAgreed: boolean; agreedAt: string } | null;
  identity: { provider: string; method: string; status: string; providerRef: string; verifiedAt: string | null } | null;
  contracts: ContractView[];
  tasks: TaskBrief[];
};

export function PersonDesk({ kind }: { kind: PersonKind }) {
  const copy = COPY[kind];
  const params = useSearchParams();
  const router = useRouter();
  const { me } = useSession();
  const id = params.get("id") || (me?.kind === kind ? me.id : "");
  const [data, setData] = useState<Dossier | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  async function reload(personId = id) {
    if (!personId) {
      setLoading(false);
      setError(kind === "employee" ? "请从劳动员工名册进入档案" : "请从项目合作方名册进入档案");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const path = kind === "employee" ? `/api/employees/${personId}` : `/api/collaborators/${personId}`;
      setData(await api<Dossier>(path));
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "档案没有打开");
    } finally {
      setLoading(false);
    }
  }

  const [booted, setBooted] = useState("");
  if (me && id && booted !== id) {
    setBooted(id);
    void reload(id);
  }

  if (!me) return <Loading label="正在核对登录状态" />;
  if (!id) return <ErrorNote error={error || "缺少档案编号"} />;
  if (loading && !data) return <Loading label={`正在打开${copy.person}档案`} />;
  if (error && !data) return <ErrorNote error={error} />;
  if (!data) return <Empty>没有这份档案</Empty>;

  const openContract = data.contracts.find((item) => item.status === "signing" || item.status === "signed");
  const canIssue = hasRole(me.roles, "issuer");
  const canTerminate = hasRole(me.roles, "admin") && data.contracts.some((item) => item.status === "signed");

  return (
    <div className="flex flex-col gap-6" data-testid={`${kind}-desk`}>
      <SectionTitle kicker={copy.relationship} title={data.person.name}>
        <StatusBadge value={data.person.status} />
      </SectionTitle>
      <p className="text-sm text-muted-foreground">
        {copy.person} · 指定邮箱 {data.person.designatedEmail}
        {data.person.phone ? ` · ${data.person.phone}` : ""} · 证件 {data.person.idNumberMasked ?? "未核验"}
        {data.person.settlementFlag ? ` · 结清标记 ${data.person.settlementFlag === "settled" ? "已结清" : data.person.settlementFlag === "pending_settlement" ? "待结清" : data.person.settlementFlag}` : ""}
      </p>

      <Card className={kind === "employee" ? "kind-employee" : "kind-collaborator"}>
        <CardHeader>
          <CardTitle>开工条件</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {data.readiness.ready ? (
            <Alert>
              <AlertDescription>单独同意、实名和{copy.contract}都已完成，可以接收{copy.task}。</AlertDescription>
            </Alert>
          ) : (
            <ul className="list-disc pl-5 text-sm" data-testid="blockers">
              {data.readiness.blockers.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">{copy.silence}</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>个人信息单独同意</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {data.consent ? (
              <>
                <p>版本 {data.consent.documentVersion}</p>
                <p>证件号码：{data.consent.idNumberAgreed ? "已单独同意" : "未同意"}</p>
                <p>电子签共享：{data.consent.thirdPartyAgreed ? "已单独同意" : "未同意"}</p>
                <p>人脸：{data.consent.faceAgreed ? "已同意" : `未同意${data.consent.faceAlternative ? `，替代方式：${data.consent.faceAlternative}` : ""}`}</p>
                <p>银行卡：{data.consent.bankAgreed ? "已同意" : "未同意"}</p>
                <p className="text-muted-foreground">记录时间 {data.consent.agreedAt}</p>
              </>
            ) : (
              <Empty>还没有本版单独同意</Empty>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>实名认证</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <p>
              状态 <StatusBadge value={data.person.identityStatus} />
            </p>
            {data.identity ? (
              <>
                <p>服务商 {data.identity.provider} · {data.identity.method === "offline" ? "线下核验" : "姓名、证件与手机号"}</p>
                <p className="break-all text-muted-foreground">回执 {data.identity.providerRef}</p>
              </>
            ) : (
              <Empty>还没有核验记录。平台不保存证件原图，只留掩码和哈希。</Empty>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{copy.contract}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {data.contracts.length === 0 ? <Empty>还没有{copy.contract}</Empty> : null}
          {data.contracts.map((contract) => (
            <article key={contract.id} className="grid gap-2 rounded-lg border p-3" data-testid={`contract-${contract.status}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-medium">{contract.title}</h2>
                <StatusBadge value={contract.status} />
              </div>
              <p className="text-sm text-muted-foreground">
                指定邮箱 {contract.designatedEmail}
                {contract.silentConfirmAgreed ? ` · 已约定 ${contract.silentConfirmDays} 个自然日沉默确认` : " · 未约定沉默确认"}
                {contract.evidenceNo ? ` · 存证 ${contract.evidenceNo}` : ""}
              </p>
              {contract.terminationReason ? <p className="text-sm">终止原因：{contract.terminationReason}</p> : null}
              {contract.fileSha256 ? <p className="break-all text-xs text-muted-foreground">SHA-256 {contract.fileSha256}</p> : null}
              <details>
                <summary className="cursor-pointer text-sm">查看合同正文</summary>
                <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap text-xs" data-testid="contract-body">
                  {contract.body}
                </pre>
              </details>
              <div className="flex flex-wrap gap-2">
                {contract.status === "signing" && contract.providerContractId && me.id === data.person.id ? (
                  <Button type="button" data-testid="open-esign" onClick={() => router.push(`/mock-esign/?ref=${encodeURIComponent(contract.providerContractId ?? "")}`)}>
                    前往电子签沙箱签署
                  </Button>
                ) : null}
                {contract.fileId ? (
                  <DownloadButton path={`/api/contracts/${contract.id}/file`} filename={`${contract.title}.txt`} testid="download-contract">
                    下载签署文本
                  </DownloadButton>
                ) : null}
              </div>
            </article>
          ))}
          <p className="text-xs text-muted-foreground">法务初稿 V0.1，未经法务审核，不得对外使用。正式环境由持牌电子签回传 PDF，当前为模拟文本。</p>
          {canIssue && !openContract ? (
            <form
              className="grid gap-3 rounded-lg bg-muted/40 p-3"
              data-testid="contract-form"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void runAction(setFormError, setBusy, async () => {
                  if (kind === "employee") {
                    await api("/api/labor-contracts", { json: { personId: data.person.id, silentConfirmAgreed: false } });
                  } else {
                    const silent = form.get("silent") === "on";
                    await api("/api/service-contracts", {
                      json: {
                        personId: data.person.id,
                        silentConfirmAgreed: silent,
                        silentConfirmDays: silent ? Number(form.get("days")) : null,
                      },
                    });
                  }
                  (event.target as HTMLFormElement).reset();
                  await reload();
                });
              }}
            >
              <p className="text-sm font-medium">发起{copy.contract}</p>
              {kind === "collaborator" ? (
                <>
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" name="silent" data-testid="silence-clause" className="mt-1" />
                    <span>在协议中单独约定：收到服务费核算单后若干自然日内既未确认也未书面异议的，视为确认。劳动报酬不适用此条。</span>
                  </label>
                  <Field label="自然日（1–30，仅勾选上条时需要）">
                    <Input name="days" type="number" min={1} max={30} defaultValue={3} data-testid="silence-days" />
                  </Field>
                </>
              ) : (
                <p className="text-sm">劳动合同不设置沉默确认。未回复不视为放弃工资。</p>
              )}
              <Button type="submit" disabled={busy} data-testid="create-contract">
                发起签署
              </Button>
              <ErrorNote error={formError} />
            </form>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{copy.task}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {data.tasks.length === 0 ? <Empty>还没有{copy.task}</Empty> : null}
          <ul className="grid gap-2">
            {data.tasks.map((task) => (
              <li key={task.id}>
                <Link href={`/task/?id=${task.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 hover:bg-muted/50" data-testid={`task-link-${task.id}`}>
                  <span>{task.title}</span>
                  <span className="flex items-center gap-2 text-sm">
                    <Money cents={task.amountCents} />
                    <StatusBadge value={task.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {canIssue ? (
            <form
              className="grid gap-3"
              data-testid="task-form"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const cents = yuanToCents(String(form.get("amount") ?? ""));
                void runAction(setFormError, setBusy, async () => {
                  if (cents == null) throw new Error("金额请填写到分，例如 6400.00");
                  const path = kind === "employee" ? "/api/employee-tasks" : "/api/collaborator-tasks";
                  const created = await api<{ id: string }>(path, {
                    json: {
                      personId: data.person.id,
                      title: String(form.get("title") ?? ""),
                      whatToDo: String(form.get("whatToDo") ?? ""),
                      whatToDeliver: String(form.get("whatToDeliver") ?? ""),
                      howPaid: String(form.get("howPaid") ?? ""),
                      whenSettles: String(form.get("whenSettles") ?? ""),
                      amountCents: cents,
                    },
                  });
                  router.push(`/task/?id=${created.id}`);
                });
              }}
            >
              <p className="text-sm font-medium">新的{copy.task}，只写四件事</p>
              <Field label="标题">
                <Input name="title" required data-testid="task-title" placeholder={kind === "employee" ? "十一月客户回访纪要" : "活动主视觉延展"} />
              </Field>
              <Field label="做什么">
                <Textarea name="whatToDo" required data-testid="task-what" placeholder={kind === "employee" ? "整理指定客户的回访记录，写成周报" : "按已确认的风格延展一套活动主视觉"} />
              </Field>
              <Field label="交付什么">
                <Textarea name="whatToDeliver" required data-testid="task-deliver" placeholder={kind === "employee" ? "周报一份，含客户编号对照" : "可编辑源文件和导出图"} />
              </Field>
              <Field label={kind === "employee" ? "工资怎么构成" : "服务费怎么计算"}>
                <Textarea name="howPaid" required data-testid="task-pay" placeholder={copy.howPaidHint} />
              </Field>
              <Field label="何时结">
                <Input name="whenSettles" required data-testid="task-when" placeholder={kind === "employee" ? "验收通过后随当月工资核算单结清" : "验收通过并确认服务费核算单后登记付款"} />
              </Field>
              <Field label={`${copy.money}（元）`}>
                <Input name="amount" required inputMode="decimal" data-testid="task-amount" placeholder={kind === "employee" ? "6400.00" : "18000.00"} />
              </Field>
              <Button type="submit" disabled={busy} data-testid="create-task">
                发布{copy.task}
              </Button>
            </form>
          ) : null}
          <ErrorNote error={formError} />
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <DownloadButton path={`/api/evidence/persons/${data.person.id}`} filename={`${data.person.name}-证据包.zip`} testid="evidence-person">
          导出此人证据包
        </DownloadButton>
      </div>

      {canTerminate ? (
        <Card>
          <CardHeader>
            <CardTitle>终止{copy.contract}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-3"
              data-testid="terminate-form"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const signed = data.contracts.find((item) => item.status === "signed");
                if (!signed) return;
                void runAction(setFormError, setBusy, async () => {
                  await api(`/api/contracts/${signed.id}/terminate`, {
                    json: { reason: String(form.get("reason") ?? ""), settlement: String(form.get("settlement") ?? "") },
                  });
                  await reload();
                });
              }}
            >
              <p className="text-sm text-muted-foreground">终止后账号停用，不能再登录。未结清事项要标明已结清或待结清。不要对正在使用的测试账号提交。</p>
              <Field label="原因">
                <Textarea name="reason" required data-testid="terminate-reason" placeholder="双方协商一致解除" />
              </Field>
              <Field label="未结事项">
                <select name="settlement" className="h-8 rounded-lg border bg-transparent px-2 text-sm" data-testid="terminate-settlement" defaultValue="settled">
                  <option value="settled">已结清</option>
                  <option value="pending_settlement">待结清</option>
                </select>
              </Field>
              <Button type="submit" variant="destructive" disabled={busy} data-testid="terminate-submit">
                终止并停用账号
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
