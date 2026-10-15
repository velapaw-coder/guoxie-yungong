"use client";

import { formatCents } from "@domain";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { statusLabel } from "@/lib/labels";

export function Loading({ label = "正在读取" }: { label?: string }) {
  return (
    <p className="text-sm text-muted-foreground" data-testid="loading">
      {label}…
    </p>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground" data-testid="empty">
      {children}
    </p>
  );
}

export function ErrorNote({ error }: { error: string }) {
  if (!error) return null;
  return (
    <Alert variant="destructive" data-testid="form-error">
      <AlertTitle>没有完成</AlertTitle>
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  );
}

export function StatusBadge({ value }: { value: string | null | undefined }) {
  const tone = value === "rejected" || value === "disabled" || value === "terminated" || value === "failed" || value === "objected" ? "destructive" : value === "approved" || value === "signed" || value === "confirmed" || value === "verified" || value === "accepted" ? "default" : "secondary";
  return <Badge variant={tone}>{statusLabel(value)}</Badge>;
}

export function Money({ cents }: { cents: number }) {
  return <span className="tabular-nums">¥{formatCents(cents)}</span>;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <Label>{label}</Label>
      {children}
    </label>
  );
}

export function SectionTitle({ kicker, title, children }: { kicker?: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        {kicker ? <p className="text-xs tracking-[0.18em] text-muted-foreground">{kicker}</p> : null}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      </div>
      {children}
    </div>
  );
}

export async function runAction(setError: (value: string) => void, setBusy: (value: boolean) => void, action: () => Promise<void>) {
  setError("");
  setBusy(true);
  try {
    await action();
  } catch (error) {
    setError(error instanceof Error ? error.message : "请求没有完成");
  } finally {
    setBusy(false);
  }
}

export function DownloadButton({ path, filename, children, testid }: { path: string; filename: string; children: React.ReactNode; testid?: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      data-testid={testid}
      onClick={() => {
        void import("@/lib/api").then(({ downloadFile }) => downloadFile(path, filename).catch((error: unknown) => {
          window.alert(error instanceof Error ? error.message : "下载失败");
        }));
      }}
    >
      {children}
    </Button>
  );
}
