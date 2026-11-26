/**
 * Sammenligner en ny versjon av et skjema med forrige versjon i store, og finner endringer som kan
 * påvirke svar som allerede er gitt: fjernede spørsmål, endrede koder, typer, alternativer og skårer,
 * reversedScore og beregninger. Brukes som varsel i PublishDialog (blokkerer ikke).
 */
import type { Calculation, Question, Questionnaire, Section, TextOption } from '../types/questionnaire';
import type { PackageSummary } from './store-api';

export type VersionChangeKind =
  | 'QUESTION_REMOVED'
  | 'QUESTION_CODE_CHANGED'
  | 'TYPE_CHANGED'
  | 'OPTION_REMOVED'
  | 'OPTION_CODE_CHANGED'
  | 'SCORE_CHANGED'
  | 'REVERSED_CHANGED'
  | 'CALC_REMOVED'
  | 'CALC_CHANGED';

export interface VersionChange {
  kind: VersionChangeKind;
  /** Spørsmåls- eller beregningskode i forrige versjon */
  code: string;
  /** Svaralternativ (kode i forrige versjon) */
  option?: string;
  from?: string;
  to?: string;
}

/** Elementer uten svar (tekst, bilde, lyd) påvirker ikke gitte svar */
const NON_ANSWER_TYPES = new Set<Question['type']>(['text', 'image', 'audioVideo']);

function flatten(sections: Section[]): Question[] {
  return sections.flatMap((s) => [...s.questions, ...flatten(s.subSections ?? [])]);
}

function answerQuestions(q: Questionnaire): Question[] {
  return flatten(q.sections).filter((x) => !NON_ANSWER_TYPES.has(x.type));
}

/** Alternativene et spørsmål faktisk har: egne, ellers fra svarmalen */
export function resolvedOptions(question: Question, q: Questionnaire): TextOption[] {
  if (!('options' in question) && !('responseTemplateCode' in question)) return [];
  const own = 'options' in question ? (question.options ?? []) : [];
  if (own.length > 0) return own;
  const tplCode = 'responseTemplateCode' in question ? question.responseTemplateCode : undefined;
  return q.responseTemplates?.templates.find((t) => t.code === (tplCode ?? question.code))?.options ?? [];
}

const text = (x: { texts?: Partial<Record<string, string>> }, lang: string) => (x.texts?.[lang] ?? '').trim();
const fmtScore = (s: number | undefined) => (s === undefined ? '–' : String(s));

function compareOptions(code: string, prev: TextOption[], next: TextOption[], lang: string): VersionChange[] {
  const out: VersionChange[] = [];
  const nextByCode = new Map(next.map((o) => [o.code, o]));
  const prevCodes = new Set(prev.map((o) => o.code));
  const unmatchedNext = next.filter((o) => !prevCodes.has(o.code));
  prev.forEach((po, i) => {
    let no = nextByCode.get(po.code);
    if (!no) {
      // Samme tekst, eller samme plass med ny kode → koden er endret
      const byText = unmatchedNext.find((o) => text(o, lang) && text(o, lang) === text(po, lang));
      const byPos = next[i] && unmatchedNext.includes(next[i]) ? next[i] : undefined;
      no = byText ?? byPos;
      if (no) {
        unmatchedNext.splice(unmatchedNext.indexOf(no), 1);
        out.push({ kind: 'OPTION_CODE_CHANGED', code, option: po.code, from: po.code, to: no.code });
      } else {
        out.push({ kind: 'OPTION_REMOVED', code, option: po.code });
        return;
      }
    }
    if ((po.score ?? undefined) !== (no.score ?? undefined)) {
      out.push({ kind: 'SCORE_CHANGED', code, option: po.code, from: fmtScore(po.score), to: fmtScore(no.score) });
    }
  });
  return out;
}

function calcSignature(c: Calculation): string {
  const terms = c.innerCalculations
    .map((ic) => `${ic.questionCode ?? ''}*${ic.multiplier ?? 1}`)
    .sort()
    .join(',');
  return `${c.type}:${terms}`;
}

export function compareVersions(prev: Questionnaire, next: Questionnaire): VersionChange[] {
  const lang = prev.defaultLanguage;
  const changes: VersionChange[] = [];
  const prevQs = answerQuestions(prev);
  const nextQs = answerQuestions(next);
  const nextByCode = new Map(nextQs.map((x) => [x.code, x]));
  const prevCodes = new Set(prevQs.map((x) => x.code));
  const unmatchedNext = nextQs.filter((x) => !prevCodes.has(x.code));

  prevQs.forEach((pq, i) => {
    let nq = nextByCode.get(pq.code);
    if (!nq) {
      const byText = unmatchedNext.find((x) => text(x, lang) && text(x, lang) === text(pq, lang));
      const byPos = nextQs[i] && unmatchedNext.includes(nextQs[i]) && nextQs[i].type === pq.type ? nextQs[i] : undefined;
      nq = byText ?? byPos;
      if (!nq) {
        changes.push({ kind: 'QUESTION_REMOVED', code: pq.code });
        return;
      }
      unmatchedNext.splice(unmatchedNext.indexOf(nq), 1);
      changes.push({ kind: 'QUESTION_CODE_CHANGED', code: pq.code, from: pq.code, to: nq.code });
    }
    if (nq.type !== pq.type) {
      changes.push({ kind: 'TYPE_CHANGED', code: pq.code, from: pq.type, to: nq.type });
    }
    if ((pq.reversedScore === true) !== (nq.reversedScore === true)) {
      changes.push({ kind: 'REVERSED_CHANGED', code: pq.code, from: String(pq.reversedScore === true), to: String(nq.reversedScore === true) });
    }
    changes.push(...compareOptions(pq.code, resolvedOptions(pq, prev), resolvedOptions(nq, next), lang));
  });

  const nextCalcs = new Map((next.calculations?.calculations ?? []).map((c) => [c.code, c]));
  for (const pc of prev.calculations?.calculations ?? []) {
    const nc = nextCalcs.get(pc.code);
    if (!nc) changes.push({ kind: 'CALC_REMOVED', code: pc.code });
    else if (calcSignature(pc) !== calcSignature(nc)) changes.push({ kind: 'CALC_CHANGED', code: pc.code });
  }
  return changes;
}

function versionKey(v: string | number, r: string | number): [number, number] {
  return [Number.parseFloat(String(v)) || 0, Number.parseInt(String(r), 10) || 0];
}

/** Nyeste versjon i store av samme kode som er eldre enn den som publiseres */
export function findPreviousVersion(
  packages: PackageSummary[],
  code: string,
  version: string,
  release: string,
): PackageSummary | undefined {
  const [cv, cr] = versionKey(version, release);
  return packages
    .filter((p) => p.code === code)
    .filter((p) => {
      const [v, r] = versionKey(p.version, p.release);
      return v < cv || (v === cv && r < cr);
    })
    .sort((a, b) => {
      const [av, ar] = versionKey(a.version, a.release);
      const [bv, br] = versionKey(b.version, b.release);
      return bv - av || br - ar || b.uid - a.uid;
    })[0];
}
