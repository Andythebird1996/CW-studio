// Vakt: pålogging til store skal bare komme fra miljøet / rot-.env (gitignorert) eller brukerens innstillinger,
// aldri som tekst i koden. Testen skriver aldri ut verdier, bare filnavn og linjenummer.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';

const ROOTS = [resolve(__dirname, '..'), resolve(__dirname, '../../../backend/src'), resolve(__dirname, '../../../electron')];
const SKIP = /node_modules|dist|\.local\.test\./;

function files(dir: string): string[] {
  let out: string[] = [];
  let entries: string[] = [];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    if (SKIP.test(p)) continue;
    if (statSync(p).isDirectory()) out = out.concat(files(p));
    else if (/\.(ts|tsx|js|mjs|json)$/.test(e)) out.push(p);
  }
  return out;
}

// Header- eller nøkkelnavn for pålogging satt direkte til en strengverdi
const LITERAL = /(['"]?(X-Store-Password|X-Store-User|STORE_PASSWORD|STORE_USER|password|passord)['"]?\s*[:=]\s*)(['"`])([^'"`\s]{4,})\3/i;
const ALLOWED_VALUES = new Set(['your-password', 'your-username', 'password', 'text']);

describe('ingen pålogging i koden', () => {
  it('ingen kildefil setter brukernavn eller passord til en fast verdi', () => {
    const hits: string[] = [];
    for (const root of ROOTS) {
      for (const f of files(root)) {
        readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
          const m = line.match(LITERAL);
          if (m && !ALLOWED_VALUES.has(m[4]) && !m[4].startsWith('${')) hits.push(`${f.replace(resolve(__dirname, '../../..'), '')}:${i + 1}`);
        });
      }
    }
    expect(hits).toEqual([]);
  });
});
