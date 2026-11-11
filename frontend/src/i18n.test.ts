import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ALL_STRINGS, copyCode, reportTabLabel, t, tf, type UILang } from './i18n';

const LANGS: UILang[] = ['EN', 'NO'];

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

describe('UI catalog parity', () => {
  it('fails when a key exists in one language but not the other', () => {
    const problems: string[] = [];

    for (const [key, entry] of Object.entries(ALL_STRINGS)) {
      const record = entry as Record<string, unknown>;
      const present = new Set(Object.keys(record));

      for (const lang of LANGS) {
        const value = record[lang];
        if (typeof value !== 'string') {
          problems.push(`${key} is missing ${lang}`);
          continue;
        }
        if (value.trim() === '') {
          problems.push(`${key}.${lang} is empty`);
        }
        present.delete(lang);
      }

      for (const extra of present) {
        problems.push(`${key} has ${extra} but the UI languages are only EN and NO`);
      }

      const en = record.EN;
      const no = record.NO;
      if (typeof en === 'string' && typeof no === 'string') {
        const enSlots = placeholders(en).join(',');
        const noSlots = placeholders(no).join(',');
        if (enSlots !== noSlots) {
          problems.push(`${key} placeholders differ (EN: ${enSlots || 'none'}, NO: ${noSlots || 'none'})`);
        }
      }
    }

    expect(problems).toEqual([]);
  });

  it('resolves the language that was requested', () => {
    expect(t('publish', 'NO')).toBe('Publiser');
    expect(t('publish', 'EN')).toBe('Publish');
    expect(tf('openedFile', 'NO', { name: 'PHQ-9' })).toBe('Åpnet «PHQ-9»');
    expect(tf('openedFile', 'EN', { name: 'PHQ-9' })).toBe('Opened “PHQ-9”');
    expect(t('appTitle', 'NO')).toBe('CW Studio Web');
    expect(t('appTitle', 'EN')).toBe('CW Studio Web');
    expect(t('tabDebugger', 'NO')).toBe('Feilsøking');
    expect(t('tabDebugger', 'EN')).toBe('Debugger');
    expect(reportTabLabel(1, 'NO')).toBe('Rapport');
    expect(reportTabLabel(1, 'EN')).toBe('Report');
    expect(reportTabLabel(0, 'NO')).toBe('Rapporter');
    expect(reportTabLabel(2, 'EN')).toBe('Reports');
    expect(copyCode('Q1', 'NO')).toBe('Q1-kopi');
    expect(copyCode('Q1', 'EN')).toBe('Q1-copy');
    expect(copyCode('', 'NO')).toBe('');
    expect(copyCode(undefined, 'EN')).toBe('');
  });
});

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      out.push(...sourceFiles(path));
    } else if ((name.endsWith('.ts') || name.endsWith('.tsx')) && !name.endsWith('.test.ts') && !name.endsWith('.test.tsx')) {
      out.push(path);
    }
  }
  return out;
}

describe('UI strings stay in the catalog', () => {
  it('does not leave bilingual string ternaries in components', () => {
    const src = join(process.cwd(), 'src');
    const stringTernary = /===\s*'NO'\s*\?\s*['"`]/;
    const languageFlip = /===\s*'NO'\s*\?\s*'EN'\s*:\s*'NO'/;
    const hits: string[] = [];

    for (const file of sourceFiles(src)) {
      if (file.endsWith(`${join('src', 'i18n.ts')}`) || file.endsWith('/i18n.ts')) continue;
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, index) => {
        if (stringTernary.test(line) && !languageFlip.test(line)) {
          hits.push(`${file}:${index + 1}`);
        }
      });
    }

    expect(hits).toEqual([]);
  });
});
