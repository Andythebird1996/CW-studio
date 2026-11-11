import type { Settings } from '../stores/settings-store';

const BASE = '/api/store';

function headers(settings: Settings): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Store-Url': settings.storeUrl,
    'X-Store-User': settings.user,
    'X-Store-Password': settings.password,
  };
}

async function parseResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: any;
  try {
    data = text.trim() ? JSON.parse(text) : {};
  } catch {
    // Server returned non-JSON (HTML error page, empty body, etc.)
    if (!res.ok) throw new Error(`HTTP ${res.status}${text ? ': ' + text.slice(0, 200) : ''}`);
    throw new Error(`Ugyldig svar fra server (ikke JSON): ${text.slice(0, 200)}`);
  }
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return data as T;
}

async function get<T>(path: string, settings: Settings): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: headers(settings) });
  return parseResponse<T>(res);
}

async function post<T>(path: string, settings: Settings, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: headers(settings),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return parseResponse<T>(res);
}

export interface PackageSummary {
  uid: number;
  name: string;
  code: string;
  version: string;
  release: string;
  isPublic: boolean;
}

export interface PackageDetail {
  uid: number;
  name: string;
  code: string;
  version: string;
  release: string;
  files: Array<{
    fileName: string;
    path: string;
    extension: string;
    content: string;
    encoding: 'text' | 'base64';
  }>;
}

export const storeApi = {
  listPackages: (settings: Settings) =>
    get<PackageSummary[]>('/packages', settings),

  getPackage: (settings: Settings, uid: number) =>
    get<PackageDetail>(`/packages/${uid}`, settings),

  validate: (settings: Settings, payload: object) =>
    post<{ allowed: boolean; denials: string[] }>('/validate', settings, payload),

  publish: (settings: Settings, payload: object) =>
    post<{ success: boolean }>('/publish', settings, payload),

  clearCache: (settings: Settings) =>
    post<{ ok: boolean }>('/clear-cache', settings),
};
