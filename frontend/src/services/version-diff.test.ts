import { describe, it, expect } from 'vitest';
import { buildSuiteDefs, buildSuite, unzipText } from '../test-packages/suite';
import { compareVersions, findPreviousVersion } from './version-diff';
import { importPackageFiles } from './package-import';
import type { Question, Questionnaire } from '../types/questionnaire';
import type { PackageSummary } from './store-api';

const base = (): Questionnaire => {
  const def = buildSuiteDefs({ date: '20261126', release: '0' }).find((d) => d.area === 'beregning');
  if (!def) throw new Error('mangler beregning');
  return structuredClone(def.questionnaire);
};
const qs = (q: Questionnaire): Question[] => q.sections[0].questions;
const withOptions = (x: Question): Extract<Question, { type: 'radiobutton' }> => {
  if (x.type !== 'radiobutton') throw new Error('ikke radio');
  return x;
};

describe('versjonsvarsel: sammenligning med forrige versjon', () => {
  it('ingen endringer gir ingen varsel', () => {
    expect(compareVersions(base(), base())).toEqual([]);
  });

  it('fjernet spørsmål og beregning som bruker det', () => {
    const next = base();
    next.sections[0].questions = qs(next).filter((x) => x.code !== 'B6');
    for (const c of next.calculations?.calculations ?? []) c.innerCalculations = c.innerCalculations.filter((ic) => ic.questionCode !== 'B6');
    const ch = compareVersions(base(), next);
    expect(ch).toContainEqual({ kind: 'QUESTION_REMOVED', code: 'B6' });
    expect(ch.filter((c) => c.kind === 'CALC_CHANGED').map((c) => c.code).sort()).toEqual(['DEL_B', 'SNITT', 'TOTAL']);
  });

  it('endret spørsmålskode gjenkjennes på teksten', () => {
    const next = base();
    qs(next)[1] = { ...qs(next)[1], code: 'B2_NY' };
    expect(compareVersions(base(), next)).toContainEqual({ kind: 'QUESTION_CODE_CHANGED', code: 'B2', from: 'B2', to: 'B2_NY' });
    expect(compareVersions(base(), next).some((c) => c.kind === 'QUESTION_REMOVED')).toBe(false);
  });

  it('endret type, reversedScore, alternativkode, skår og fjernet alternativ', () => {
    const next = base();
    const b1 = withOptions(qs(next)[0]);
    qs(next)[0] = { ...b1, type: 'checkbox' } as Question;
    qs(next)[1] = { ...qs(next)[1], reversedScore: true };
    const b3 = withOptions(qs(next)[2]);
    b3.options = (b3.options ?? []).map((o, i) => (i === 0 ? { ...o, code: 'B3_NULL' } : i === 1 ? { ...o, score: 5 } : o)).slice(0, 3);
    const ch = compareVersions(base(), next);
    expect(ch).toContainEqual({ kind: 'TYPE_CHANGED', code: 'B1', from: 'radiobutton', to: 'checkbox' });
    expect(ch).toContainEqual({ kind: 'REVERSED_CHANGED', code: 'B2', from: 'false', to: 'true' });
    expect(ch).toContainEqual({ kind: 'OPTION_CODE_CHANGED', code: 'B3', option: 'B3_0', from: 'B3_0', to: 'B3_NULL' });
    expect(ch).toContainEqual({ kind: 'SCORE_CHANGED', code: 'B3', option: 'B3_1', from: '1', to: '5' });
    expect(ch).toContainEqual({ kind: 'OPTION_REMOVED', code: 'B3', option: 'B3_3' });
  });

  it('nye spørsmål, alternativer og tekstendringer varsles ikke', () => {
    const next = base();
    qs(next).push({ ...qs(next)[0], id: 'ny', code: 'B7', texts: { ...qs(next)[0].texts, NO: 'Nytt spørsmål' } });
    qs(next)[3] = { ...qs(next)[3], texts: { ...qs(next)[3].texts, NO: 'Ny ordlyd' } };
    const b5 = withOptions(qs(next)[4]);
    b5.options = [...(b5.options ?? []), { code: 'B5_4', score: 4, texts: { NO: 'Ekstra' } as Record<string, string> }];
    expect(compareVersions(base(), next)).toEqual([]);
  });

  it('virker på en pakke slik den leses inn fra store (svarmaler)', async () => {
    const [pkg] = (await buildSuite({ date: '20261126', release: '0' })).filter((p) => p.def.area === 'beregning');
    const files = await unzipText(pkg.built.base64);
    const imported = importPackageFiles(Object.entries(files).map(([path, content]) => {
      const fileName = path.split('/').pop() ?? path;
      return { fileName, extension: fileName.split('.').pop() ?? '', content, encoding: 'text' as const };
    }));
    expect(compareVersions(imported.questionnaire, imported.questionnaire)).toEqual([]);
    const next = structuredClone(imported.questionnaire);
    next.sections[0].questions = next.sections[0].questions.filter((x) => x.code !== 'B1');
    expect(compareVersions(imported.questionnaire, next)).toContainEqual({ kind: 'QUESTION_REMOVED', code: 'B1' });
  });

  it('finner nyeste eldre versjon av samme kode', () => {
    const p = (uid: number, code: string, version: string, release: string): PackageSummary => ({ uid, code, version, release, name: code, isPublic: false });
    const list = [p(1, 'A', '1', '0'), p(2, 'A', '1', '2'), p(3, 'A', '1', '3'), p(4, 'B', '1', '2'), p(5, 'A', '2', '0')];
    expect(findPreviousVersion(list, 'A', '1', '3')?.uid).toBe(2);
    expect(findPreviousVersion(list, 'A', '2', '1')?.uid).toBe(5);
    expect(findPreviousVersion(list, 'A', '1', '0')).toBeUndefined();
    expect(findPreviousVersion(list, 'C', '1', '0')).toBeUndefined();
  });
});
