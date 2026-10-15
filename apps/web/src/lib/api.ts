export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

export type Me = {
  id: string;
  kind: "operator" | "employee" | "collaborator";
  name: string;
  email: string;
  designatedEmail: string;
  phone: string | null;
  status: string;
  identityStatus: string;
  idNumberMasked: string | null;
  settlementFlag: string | null;
  roles: string[];
};

export function authToken(): string {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem("gy_token") ?? "";
}

export function setAuthToken(value: string) {
  sessionStorage.setItem("gy_token", value);
}

export function clearAuthToken() {
  sessionStorage.removeItem("gy_token");
}

export async function api<T>(path: string, options: { method?: string; json?: unknown; form?: FormData; token?: string | null } = {}): Promise<T> {
  const headers = new Headers();
  const token = options.token === undefined ? authToken() : options.token;
  if (token) headers.set("authorization", `Bearer ${token}`);
  let body: BodyInit | undefined;
  if (options.form) body = options.form;
  else if (options.json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(options.json);
  }
  const response = await fetch(`${API_BASE}${path}`, { method: options.method ?? (body ? "POST" : "GET"), headers, body });
  const text = await response.text();
  const data = text ? JSON.parse(text) as { error?: string } : {};
  if (!response.ok) throw new Error(data.error || "请求没有完成");
  return data as T;
}

export async function downloadFile(path: string, filename: string) {
  const headers = new Headers();
  if (authToken()) headers.set("authorization", `Bearer ${authToken()}`);
  const response = await fetch(`${API_BASE}${path}`, { headers });
  if (!response.ok) {
    const text = await response.text();
    let message = "下载失败";
    try {
      message = (JSON.parse(text) as { error?: string }).error || message;
    } catch {
      message = "下载失败";
    }
    throw new Error(message);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
