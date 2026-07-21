const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = typeof window !== "undefined" ? window.localStorage.getItem("closeloop_token") : null;
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers } });
  if (!response.ok) { const detail = await response.json().catch(() => null); throw new Error(detail?.detail ?? `Request failed: ${response.status}`); }
  return response.status === 204 ? (undefined as T) : response.json();
}
