export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** Panggil API backend. Cookie sesi (httpOnly) ikut terkirim otomatis. */
export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const isForm = opts.body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? 'GET',
    credentials: 'include',
    headers: opts.body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body === undefined ? undefined : isForm ? (opts.body as FormData) : JSON.stringify(opts.body),
  });
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) {
    if (res.status === 401 && path !== '/auth/login' && path !== '/auth/me') {
      window.dispatchEvent(new Event('auth:expired'));
    }
    throw new ApiError(res.status, data?.error ?? `Error ${res.status}`, data?.details);
  }
  return data as T;
}

/** Ubah detail error validasi zod menjadi teks yang mudah dibaca. */
export function errorText(e: unknown): string {
  if (!(e instanceof ApiError)) return String((e as Error)?.message ?? e);
  const d = e.details as { fieldErrors?: Record<string, string[]> } | undefined;
  const fe = d?.fieldErrors ? Object.entries(d.fieldErrors).map(([k, v]) => `${k}: ${v.join(', ')}`) : [];
  return fe.length ? `${e.message} (${fe.join('; ')})` : e.message;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'KEPALA_BENGKEL';

export interface Me {
  id: number;
  nama: string;
  email: string;
  role: Role;
  branchId: number | null;
  branch: { id: number; kodeCabang: string; namaCabang: string } | null;
  employeeId: number | null;
}

export const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin Cabang',
  KEPALA_BENGKEL: 'Kepala Bengkel',
};

export const rupiah = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === ''
    ? '-'
    : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 2 }).format(Number(v));

/** Unduh file (Excel, dsb) dari API dengan sesi login yang sama. */
export async function download(path: string, fallbackName: string) {
  const res = await fetch(`/api${path}`, { credentials: 'include' });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data?.error ?? `Error ${res.status}`);
  }
  const cd = res.headers.get('content-disposition') ?? '';
  const name = /filename="([^"]+)"/.exec(cd)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const tanggal = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '-';

export const angka = (v: number | string | null | undefined) => new Intl.NumberFormat('id-ID').format(Number(v ?? 0));
