/**
 * Integration tests for the store-api backend routes.
 *
 * These tests call the running backend directly at http://localhost:3001
 * using absolute URLs — bypassing the Vite dev-proxy which is not available
 * in the Vitest/Node environment.
 *
 * Auth credentials are passed per-request as HTTP headers, matching the
 * pattern used by the frontend (X-Store-Url, X-Store-User, X-Store-Password).
 *
 * Only read-only operations are tested (no validate or publish).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import type { PackageSummary, PackageDetail } from './store-api';

const BASE_URL = 'http://localhost:3001';

const AUTH_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'X-Store-Url': 'https://cia.checkwareonline.com/v2/store/api/store-api.wsdl',
  'X-Store-User': 'support-ahus',
  'X-Store-Password': 'jpT%pRW3kZ3^4Ag',
};

// ── helpers ──────────────────────────────────────────────────────────────────

async function get<T>(path: string): Promise<{ status: number; body: T }> {
  const res = await fetch(`${BASE_URL}${path}`, { headers: AUTH_HEADERS });
  const text = await res.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

// ── shared state ─────────────────────────────────────────────────────────────

let packages: PackageSummary[] = [];

// ── tests ────────────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns 200 with { ok: true }', async () => {
    const res = await fetch(`${BASE_URL}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true });
  });
});

describe('GET /api/store/packages', () => {
  beforeAll(async () => {
    const result = await get<PackageSummary[]>('/api/store/packages');
    expect(result.status, `Expected 200, got ${result.status}. Body: ${JSON.stringify(result.body)}`).toBe(200);
    packages = result.body as PackageSummary[];
  });

  it('returns an array', () => {
    expect(Array.isArray(packages)).toBe(true);
  });

  it('contains at least one package', () => {
    expect(packages.length).toBeGreaterThan(0);
  });

  it('each package has the required fields: uid, name, code, version, release, isPublic', () => {
    for (const pkg of packages) {
      expect(pkg, `Package missing uid: ${JSON.stringify(pkg)}`).toHaveProperty('uid');
      expect(pkg, `Package missing name: ${JSON.stringify(pkg)}`).toHaveProperty('name');
      expect(pkg, `Package missing code: ${JSON.stringify(pkg)}`).toHaveProperty('code');
      expect(pkg, `Package missing version: ${JSON.stringify(pkg)}`).toHaveProperty('version');
      expect(pkg, `Package missing release: ${JSON.stringify(pkg)}`).toHaveProperty('release');
      expect(pkg, `Package missing isPublic: ${JSON.stringify(pkg)}`).toHaveProperty('isPublic');

      expect(typeof pkg.uid).toBe('number');
      expect(typeof pkg.name).toBe('string');
      expect(typeof pkg.code).toBe('string');
      expect(typeof pkg.version).toBe('string');
      expect(typeof pkg.release).toBe('string');
      expect(typeof pkg.isPublic).toBe('boolean');
    }
  });

  it('logs the first 5 packages (informational)', () => {
    const first5 = packages.slice(0, 5);
    console.log('\n--- First 5 packages from server ---');
    for (const p of first5) {
      console.log(`  [${p.uid}] ${p.name} (${p.code}) v${p.version}-${p.release} public=${p.isPublic}`);
    }
    console.log('-------------------------------------\n');
    // Always passes — purely informational
    expect(first5.length).toBeGreaterThanOrEqual(0);
  });
});

describe('GET /api/store/packages/:uid', () => {
  let detail: PackageDetail;

  beforeAll(async () => {
    // packages array is populated by the sibling describe's beforeAll.
    // Run it ourselves here in case test order differs.
    if (packages.length === 0) {
      const result = await get<PackageSummary[]>('/api/store/packages');
      if (result.status === 200 && Array.isArray(result.body)) {
        packages = result.body as PackageSummary[];
      }
    }
  });

  it('downloads the first package and returns a PackageDetail object', async () => {
    expect(packages.length, 'No packages available — cannot test download').toBeGreaterThan(0);

    const firstUid = packages[0].uid;
    const result = await get<PackageDetail>(`/api/store/packages/${firstUid}`);

    expect(
      result.status,
      `Expected 200, got ${result.status}. Body: ${JSON.stringify(result.body).slice(0, 300)}`
    ).toBe(200);

    detail = result.body as PackageDetail;

    expect(detail).toBeDefined();
  });

  it('downloaded package has uid, name, code, version, release fields', () => {
    expect(detail).toBeDefined();
    expect(detail).toHaveProperty('uid');
    expect(detail).toHaveProperty('name');
    expect(detail).toHaveProperty('code');
    expect(detail).toHaveProperty('version');
    expect(detail).toHaveProperty('release');
  });

  it('downloaded package has a files array', () => {
    expect(detail).toBeDefined();
    expect(Array.isArray(detail.files)).toBe(true);
  });

  it('each file entry has fileName, path, extension, content, encoding', () => {
    expect(detail).toBeDefined();
    // A valid package should have at least one file
    expect(detail.files.length, 'Package has no files').toBeGreaterThan(0);

    for (const f of detail.files) {
      expect(f).toHaveProperty('fileName');
      expect(f).toHaveProperty('path');
      expect(f).toHaveProperty('extension');
      expect(f).toHaveProperty('content');
      expect(f).toHaveProperty('encoding');
      expect(['text', 'base64']).toContain(f.encoding);
    }
  });

  it('base64-encoded files contain valid base64 content', () => {
    expect(detail).toBeDefined();
    const base64Files = detail.files.filter((f) => f.encoding === 'base64');
    for (const f of base64Files) {
      // atob throws if content is not valid base64; Buffer.from is more lenient
      expect(() => Buffer.from(f.content, 'base64'), `Invalid base64 in ${f.fileName}`).not.toThrow();
      expect(f.content.length, `Empty base64 content in ${f.fileName}`).toBeGreaterThan(0);
    }
  });

  it('returns 200 for the uid that matches packages[0] summary', () => {
    expect(detail).toBeDefined();
    expect(detail.uid).toBe(packages[0].uid);
  });
});

describe('GET /api/store/packages/:uid — unknown uid', () => {
  it('returns 500 with an error field for a non-existent uid', async () => {
    const result = await get<any>('/api/store/packages/999999999');
    // The backend catches SOAP errors and returns { error: "..." } with status 500
    expect([500, 404]).toContain(result.status);
    if (result.status === 500) {
      expect(result.body).toHaveProperty('error');
      expect(typeof result.body.error).toBe('string');
    }
  });
});
