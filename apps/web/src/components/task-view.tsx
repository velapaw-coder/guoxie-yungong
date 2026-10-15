"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { yuanToCents, type PersonKind } from "@domain";
import { DownloadButton, Empty, ErrorNote, Field, Loading, Money, SectionTitle, StatusBadge, runAction } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { hasRole, statusLabel } from "@/lib/labels";
import { useSession } from "@/lib/session";

type Deliverable = { id: string; version: number; note: string; fileId: string; sha256: string; filename: string; submittedAt: string };
type Acceptance = { id: string; version: number; decision: string; reason: string | null; reviewerName: string; reviewedAt: string };
type Statement = {
  id: string;
  version: number;
  statementKind: string;
  amountCents: number;
  periodLabel: string;
  note: string;
  status: string;
  fileId: string;
  sha256: string | null;
  filename: string | null;
  confirmation: {
    status: string;
    sentAt: string;
    confirmMethod: string | null;
    confirmedAt: string | null;
    receiptText: string | null;
    silenceAllowed: boolean;
    silenceDeadlineAt: string | null;
    objectionText: string | null;
    recipientEmail: string;
    attachmentSha256: string;
  } | null;
  payment: {
    id: string;
    amountCents: number;
    paidOn: string;
    referenceNo: string;
    status: string;
    makerId: string;
    makerName: string;
    checkerName: string | null;
    checkerNote: string | null;
    voucherFileId: string | null;
    settlementFlag: string;
  } | null;
};
type TaskData = {
  id: string;
  title: string;
  whatToDo: string;
  whatToDeliver: string;
  howPaid: string;
  whenSettles: string;
  amountCents: number;
  status: string;
  issuerId: string;
  issuerName: string;
  personKind: PersonKind;
  personId: string;
  personName: string;
  labels: { person: string; contract: string; task: string; deliverable: string; statement: string; payment: string; money: string; statementPath: string; detailPath: string };
  deliverables: Deliverable[];
  acceptances: Acceptance[];
  statements: Statement[];
};

const FILE_ACCEPT = ".pdf,.txt,.png,.jpg,.jpeg,.xlsx,.xls";

export function TaskView() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const { me } = useSession();
  const [data, setData] = useState<TaskData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [seen, setSeen] = useState("");

  async function reload(taskId = id) {
    if (!taskId) {
      setLoading(false);
      setError("缺少任务编号");
      return;
    }
    setLoading(true);
    setError("");
    try {
      setData(await api<TaskData>(`/api/tasks/${taskId}`));
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "任务没有打开");
    } finally {
      setLoading(false);
    }
  }

  if (me && id && seen !== id) {
    setSeen(id);
    void reload(id);
  }

  if (!me) return <Loading />;
  if (loading && !data) return <Loading label="正在打开任务" />;
  if (!data) return <ErrorNote error={error || "没有这项任务"} />;

  const latest = data.deliverables.at(-1);
  const latestDecision = latest ? data.acceptances.find((item) => item.version === latest.version) : undefined;
  const canDeliver = me.id === data.personId && data.status !== "accepted" && data.status !== "closed" && (!latest || latestDecision?.decision === "rejected");
  const canAccept = hasRole(me.roles, "acceptor") && Boolean(latest) && !latestDecision && me.id !== data.issuerId && me.id !== data.personId;
  const statementPath = data.personKind === "employee" ? "/api/wage-slips" : "/api/service-fees";
  const canMakeStatement = hasRole(me.roles, "payment_maker") && data.status === "accepted";
  const openStatement = data.statements.find((item) => ["draft", "sent", "confirmed"].includes(item.status));

  return (
    <div className="flex flex-col gap-6" data-testid="task-page">
      <SectionTitle kicker={data.labels.task} title={data.title}>
        <StatusBadge value={data.status} />
      </SectionTitle>
      <p className="text-sm text-muted-foreground">
        {data.labels.person}{" "}
        <Link className="underline-offset-4 hover:underline" href={`${data.labels.detailPath}?id=${data.personId}`}>
          {data.personName}
        </Link>
        {" · "}发单人 {data.issuerName} · 约定 <Money cents={data.amountCents} />
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {[
          ["做什么", data.whatToDo],
          ["交付什么", data.whatToDeliver],
          ["怎么算钱", data.howPaid],
          ["何时结", data.whenSettles],
        ].map(([label, text]) => (
          <Card key={label}>
            <CardHeader>
              <CardTitle>{label}</CardTitle>
            </CardHeader>
            <CardContent className="whitespace-pre-wrap text-sm">{text}</CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{data.labels.deliverable}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {data.deliverables.length === 0 ? <Empty>还没有提交</Empty> : null}
          {data.deliverables.map((item) => {
            const decision = data.acceptances.find((row) => row.version === item.version);
            return (
              <article key={item.id} className="grid gap-1 rounded-lg border p-3 text-sm" data-testid={`deliverable-v${item.version}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>第 {item.version} 版</strong>
                  {decision ? <StatusBadge value={decision.decision} /> : <StatusBadge value="delivered" />}
                </div>
                <p>{item.note}</p>
                <p className="break-all text-xs text-muted-foreground">
                  {item.filename} · SHA-256 {item.sha256}
                </p>
                {decision ? (
                  <p>
                    {decision.reviewerName}：{decision.reason} · {statusLabel(decision.decision)}
                  </p>
                ) : null}
                <DownloadButton path={`/api/files/${item.fileId}`} filename={item.filename} testid={`download-deliverable-${item.version}`}>
                  下载这一版
                </DownloadButton>
              </article>
            );
          })}
          {canDeliver ? (
            <form
              className="grid gap-3"
              data-testid="deliver-form"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void runAction(setFormError, setBusy, async () => {
                  await api(`/api/tasks/${data.id}/deliverables`, { form });
                  (event.target as HTMLFormElement).reset();
                  await reload();
                });
              }}
            >
              <Field label="说明">
                <Textarea name="note" required data-testid="deliver-note" placeholder="这一版改了什么" />
              </Field>
              <Field label="附件（PDF、Excel、图片或文本，10MB 以内）">
                <Input name="file" type="file" required accept={FILE_ACCEPT} data-testid="deliver-file" />
              </Field>
              <Button type="submit" disabled={busy} data-testid="deliver-submit">
                提交{data.labels.deliverable}
              </Button>
            </form>
          ) : null}
          {canAccept ? (
            <form
              className="grid gap-3"
              data-testid="accept-form"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void runAction(setFormError, setBusy, async () => {
                  await api(`/api/tasks/${data.id}/acceptance`, {
                    json: { decision: String(form.get("decision")), reason: String(form.get("reason") ?? "") },
                  });
                  await reload();
                });
              }}
            >
              <Field label="验收结论">
                <select name="decision" className="h-8 rounded-lg border bg-transparent px-2" data-testid="accept-decision" defaultValue="accepted">
                  <option value="accepted">通过</option>
                  <option value="rejected">驳回</option>
                </select>
              </Field>
              <Field label="意见（驳回必须写原因）">
                <Textarea name="reason" required data-testid="accept-reason" />
              </Field>
              <Button type="submit" disabled={busy} data-testid="accept-submit">
                写入验收
              </Button>
            </form>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{data.labels.statement}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {data.statements.length === 0 ? <Empty>验收通过后，由制单人上传线下核算结果。</Empty> : null}
          {data.statements.map((statement) => (
            <article key={statement.id} className="grid gap-2 rounded-lg border p-3 text-sm" data-testid={`statement-v${statement.version}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>
                  第 {statement.version} 版 · {statement.periodLabel} · <Money cents={statement.amountCents} />
                </strong>
                <StatusBadge value={statement.status} />
              </div>
              {statement.note ? <p>{statement.note}</p> : null}
              {statement.sha256 ? <p className="break-all text-xs text-muted-foreground">SHA-256 {statement.sha256}</p> : null}
              {statement.confirmation ? (
                <p className="text-muted-foreground">
                  已发送至 {statement.confirmation.recipientEmail}
                  {statement.confirmation.silenceAllowed ? ` · 沉默期限 ${statement.confirmation.silenceDeadlineAt ?? ""}` : " · 沉默不构成确认"}
                  {statement.confirmation.confirmMethod ? ` · ${statusLabel(statement.confirmation.confirmMethod)}` : ""}
                  {statement.confirmation.receiptText ? ` · ${statement.confirmation.receiptText}` : ""}
                  {statement.confirmation.objectionText ? ` · 异议：${statement.confirmation.objectionText}` : ""}
                </p>
              ) : null}
              {statement.payment ? (
                <p>
                  {data.labels.payment} {statement.payment.referenceNo} · {statement.payment.paidOn} · <Money cents={statement.payment.amountCents} /> · {statusLabel(statement.payment.status)} · 制单 {statement.payment.makerName}
                  {statement.payment.checkerName ? ` · 复核 ${statement.payment.checkerName}` : ""}
                  {statement.payment.checkerNote ? ` · ${statement.payment.checkerNote}` : ""}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {statement.fileId ? (
                  <DownloadButton path={`/api/files/${statement.fileId}`} filename={statement.filename || "核算单.txt"} testid={`download-statement-${statement.version}`}>
                    下载核算单
                  </DownloadButton>
                ) : null}
                {statement.payment?.voucherFileId ? (
                  <DownloadButton path={`/api/files/${statement.payment.voucherFileId}`} filename="付款凭证.txt" testid={`download-voucher-${statement.version}`}>
                    下载付款凭证
                  </DownloadButton>
                ) : null}
              </div>
              {hasRole(me.roles, "payment_maker") && statement.status === "draft" ? (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" data-testid={`send-statement-${statement.version}`} disabled={busy} onClick={() => void runAction(setFormError, setBusy, async () => { await api(`/api/statements/${statement.id}/send`, { method: "POST", json: {} }); await reload(); })}>
                    发送到指定邮箱
                  </Button>
                  <Button type="button" variant="outline" data-testid={`void-statement-${statement.version}`} disabled={busy} onClick={() => void runAction(setFormError, setBusy, async () => { await api(`/api/statements/${statement.id}/void`, { method: "POST", json: {} }); await reload(); })}>
                    作废草稿
                  </Button>
                </div>
              ) : null}
              {hasRole(me.roles, "payment_maker") && statement.status === "sent" ? (
                <Button type="button" variant="outline" disabled={busy} data-testid={`void-sent-${statement.version}`} onClick={() => void runAction(setFormError, setBusy, async () => { await api(`/api/statements/${statement.id}/void`, { method: "POST", json: {} }); await reload(); })}>
                  作废这张待确认核算单
                </Button>
              ) : null}
              {me.id === data.personId && statement.status === "sent" ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <form className="grid gap-2" data-testid={`confirm-form-${statement.version}`} onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void runAction(setFormError, setBusy, async () => { await api(`/api/statements/${statement.id}/confirm`, { json: { receiptText: String(form.get("receipt") ?? "") } }); await reload(); }); }}>
                    <Field label="本人确认说明">
                      <Textarea name="receipt" data-testid={`confirm-text-${statement.version}`} placeholder="我已核对这张核算单" />
                    </Field>
                    <Button type="submit" disabled={busy} data-testid={`confirm-statement-${statement.version}`}>
                      在平台确认
                    </Button>
                  </form>
                  <form className="grid gap-2" data-testid={`object-form-${statement.version}`} onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void runAction(setFormError, setBusy, async () => { await api(`/api/statements/${statement.id}/object`, { json: { text: String(form.get("text") ?? "") } }); await reload(); }); }}>
                    <Field label="异议">
                      <Textarea name="text" required data-testid={`object-text-${statement.version}`} placeholder="写明哪一项与约定不一致" />
                    </Field>
                    <Button type="submit" variant="outline" disabled={busy} data-testid={`object-statement-${statement.version}`}>
                      提出异议
                    </Button>
                  </form>
                </div>
              ) : null}
              {hasRole(me.roles, "payment_maker") && statement.status === "sent" ? (
                <form className="grid gap-2" data-testid={`reply-form-${statement.version}`} onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void runAction(setFormError, setBusy, async () => { await api(`/api/statements/${statement.id}/email-reply`, { json: { receiptText: String(form.get("receipt") ?? "") } }); await reload(); }); }}>
                  <Field label="登记指定邮箱的回复（正文需包含「确认」）">
                    <Textarea name="receipt" required data-testid={`reply-text-${statement.version}`} placeholder="回复：确认" />
                  </Field>
                  <Button type="submit" variant="outline" disabled={busy} data-testid={`reply-submit-${statement.version}`}>
                    登记邮件确认
                  </Button>
                </form>
              ) : null}
              {hasRole(me.roles, "payment_maker") && statement.status === "confirmed" && !statement.payment ? (
                <form className="grid gap-2" data-testid={`payment-form-${statement.version}`} onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); form.set("statementId", statement.id); void runAction(setFormError, setBusy, async () => { await api("/api/payments", { form }); await reload(); }); }}>
                  <p>金额以已确认核算单为准：<Money cents={statement.amountCents} />。这里只登记，不划转。</p>
                  <Field label="付款日期">
                    <Input name="paidOn" type="date" required data-testid={`paid-on-${statement.version}`} defaultValue="2026-10-15" />
                  </Field>
                  <Field label="银行流水号">
                    <Input name="referenceNo" required data-testid={`reference-${statement.version}`} placeholder="YH202610150001" />
                  </Field>
                  <Field label="付款凭证">
                    <Input name="file" type="file" required accept={FILE_ACCEPT} data-testid={`voucher-${statement.version}`} />
                  </Field>
                  <Button type="submit" disabled={busy} data-testid={`payment-submit-${statement.version}`}>
                    登记{data.labels.payment}
                  </Button>
                </form>
              ) : null}
              {statement.payment && statement.payment.status === "pending_check" && hasRole(me.roles, "payment_checker") ? (
                <form className="grid gap-2" data-testid={`decision-form-${statement.version}`} onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void runAction(setFormError, setBusy, async () => { await api(`/api/payments/${statement.payment?.id}/decision`, { json: { decision: String(form.get("decision")), note: String(form.get("note") ?? "") } }); await reload(); }); }}>
                  {me.id === statement.payment.makerId ? <p>你是制单人，不能复核自己的登记。</p> : null}
                  <Field label="复核">
                    <select name="decision" className="h-8 rounded-lg border bg-transparent px-2" data-testid={`decision-${statement.version}`} defaultValue="approved" disabled={me.id === statement.payment.makerId}>
                      <option value="approved">通过</option>
                      <option value="rejected">退回</option>
                    </select>
                  </Field>
                  <Field label="复核说明">
                    <Textarea name="note" data-testid={`decision-note-${statement.version}`} placeholder="流水与核算单金额一致" />
                  </Field>
                  <Button type="submit" disabled={busy || me.id === statement.payment.makerId} data-testid={`decision-submit-${statement.version}`}>
                    提交复核
                  </Button>
                </form>
              ) : null}
            </article>
          ))}
          {canMakeStatement && !openStatement ? (
            <form className="grid gap-3" data-testid="statement-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const cents = yuanToCents(String(form.get("amountYuan") ?? "")); void runAction(setFormError, setBusy, async () => { if (cents == null) throw new Error("金额请填写到分，例如 6400.00"); form.set("taskId", data.id); form.set("amountCents", String(cents)); form.delete("amountYuan"); await api(statementPath, { form }); (event.target as HTMLFormElement).reset(); await reload(); }); }}>
              <p className="text-sm">上传线下已经算好的{data.labels.statement}。系统不计算工资、个税或服务费。</p>
              <Field label="期间">
                <Input name="periodLabel" required data-testid="statement-period" placeholder="2026年10月" />
              </Field>
              <Field label="金额（元）">
                <Input name="amountYuan" required data-testid="statement-amount" placeholder={(data.amountCents / 100).toFixed(2)} />
              </Field>
              <Field label="备注">
                <Textarea name="note" data-testid="statement-note" />
              </Field>
              <Field label="核算单附件">
                <Input name="file" type="file" required accept={FILE_ACCEPT} data-testid="statement-file" />
              </Field>
              <Button type="submit" disabled={busy} data-testid="statement-submit">
                保存草稿
              </Button>
            </form>
          ) : null}
          <ErrorNote error={formError} />
        </CardContent>
      </Card>
      <DownloadButton path={`/api/evidence/tasks/${data.id}`} filename={`${data.title}-证据包.zip`} testid="evidence-task">
        导出本任务证据包
      </DownloadButton>
    </div>
  );
}
