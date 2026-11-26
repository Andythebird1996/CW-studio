/**
 * Matriseseksjoner (Section.matrix): portalen viser første element som en vanlig blokk og resten som
 * en tabell med spørsmålene som rader og svaralternativene fra én felles svarmal som kolonner.
 */
import type { LanguageType, Question, Section } from '../types/questionnaire';
import { matrixKey, orderedChildren } from './xml-serializer';

export type MatrixProblem =
  | { kind: 'EMPTY' }
  | { kind: 'NO_SHARED_TEMPLATE'; code: string }
  | { kind: 'MIXED_TEMPLATES'; codes: string[] }
  | { kind: 'TEXT_NOT_FIRST'; code: string }
  | { kind: 'UNSUPPORTED_ELEMENT'; code: string };

/** Overskriften Studio skriver først i seksjonen (sectionTitleCode) teller som et Text-element. */
export function hasHeadingElement(section: Section, lang: LanguageType): boolean {
  return !!section.titles[lang] && !section.titleFromDescription;
}

function isAnswerElement(e: Question | Section): e is Question {
  return !('questions' in e) && e.type !== 'text';
}

/** Elementene i matrisen i visningsrekkefølge (uten Studio-overskriften). */
export function matrixElements(section: Section): Array<Question | Section> {
  return orderedChildren(section).map((c) => (c.kind === 'q' ? c.q : c.s));
}

export function matrixProblems(section: Section, lang: LanguageType): MatrixProblem[] {
  if (!section.matrix) return [];
  const problems: MatrixProblem[] = [];
  const els = matrixElements(section);
  const questions = els.filter(isAnswerElement);
  if (questions.length === 0) problems.push({ kind: 'EMPTY' });
  const heading = hasHeadingElement(section, lang);
  els.forEach((e, i) => {
    if ('questions' in e) {
      problems.push({ kind: 'UNSUPPORTED_ELEMENT', code: e.code ?? e.id });
      return;
    }
    if (e.type === 'text') {
      if (heading || i > 0) problems.push({ kind: 'TEXT_NOT_FIRST', code: e.code });
      return;
    }
    const key = matrixKey(e);
    if (key === null) problems.push({ kind: 'UNSUPPORTED_ELEMENT', code: e.code });
    else if (key.startsWith('inline:') && (!('options' in e) || !e.options?.length)) {
      problems.push({ kind: 'NO_SHARED_TEMPLATE', code: e.code });
    }
  });
  const keys = new Map<string, string[]>();
  for (const q of questions) {
    const k = matrixKey(q);
    if (k) keys.set(k, [...(keys.get(k) ?? []), q.code]);
  }
  if (keys.size > 1) problems.push({ kind: 'MIXED_TEMPLATES', codes: [...keys.values()].map((c) => c[0]) });
  return problems;
}

export function matrixProblemIsError(p: MatrixProblem): boolean {
  return p.kind === 'MIXED_TEMPLATES' || p.kind === 'NO_SHARED_TEMPLATE';
}
