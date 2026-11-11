/**
 * Auto-generate codes for all elements in a Questionnaire.
 *
 * Mirrors the logic from Checkware Studio's AutogenerateCodeElement Java class.
 * Prefixes:
 *   Section          → S1, S2, ...
 *   Question         → Q1, Q2, ...  (global counter, across all sections)
 *   TextElement      → T1, T2, ...  (global counter)
 *   ResponseTemplate → QT1, QT2, ...
 *   Option (in tpl)  → {templateCode}-O1, {templateCode}-O2, ...
 *
 * Two modes (matching original Studio behaviour):
 *   overwrite: false (default) — only fills empty/null codes; advances the
 *                                counter past already-occupied values to avoid
 *                                collisions with existing codes.
 *   overwrite: true            — renumbers every element sequentially,
 *                                ignoring existing codes.
 *
 * The function is pure (immutable) — it returns a new Questionnaire.
 */

import type {
  Questionnaire,
  Section,
  Question,
  ResponseTemplate,
  TextOption,
} from '../types/questionnaire';

export interface GenerateCodesOptions {
  /** When true, overwrite all existing codes (like original Studio overwrite=true).
   *  When false (default), only fill empty codes and skip taken counter values. */
  overwrite?: boolean;
}

export interface GenerateCodesResult {
  questionnaire: Questionnaire;
  /** Number of codes that were written (new or replaced) */
  count: number;
  /** Number of codes skipped because they already existed (fill-only mode only) */
  skipped: number;
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Collect every non-empty code in the questionnaire into a set. */
function collectAllCodes(questionnaire: Questionnaire): Set<string> {
  const codes = new Set<string>();
  function addSection(s: Section) {
    if (s.code) codes.add(s.code);
    for (const q of s.questions) if (q.code) codes.add(q.code);
    for (const sub of s.subSections ?? []) addSection(sub);
  }
  for (const s of questionnaire.sections) addSection(s);
  for (const tpl of questionnaire.responseTemplates?.templates ?? []) {
    if (tpl.code) codes.add(tpl.code);
    for (const opt of tpl.options) if (opt.code) codes.add(opt.code);
  }
  return codes;
}

/** Return the next code `prefix+N` where N >= counter and the code is not
 *  already in `occupied`. Mutates `counter` in the counters object. */
function nextAvailable(
  prefix: string,
  counterKey: keyof Counters,
  counters: Counters,
  occupied: Set<string>,
): string {
  let code = `${prefix}${counters[counterKey]}`;
  while (occupied.has(code)) {
    (counters[counterKey] as number)++;
    code = `${prefix}${counters[counterKey]}`;
  }
  (counters[counterKey] as number)++;
  occupied.add(code);
  return code;
}

interface Counters {
  section: number;
  question: number;
  text: number;
  template: number;
}

// ── section recursion ────────────────────────────────────────────────────────

function processSection(
  section: Section,
  counters: Counters,
  occupied: Set<string>,
  overwrite: boolean,
  stats: { written: number; skipped: number },
): Section {
  // Section code
  let sectionCode: string;
  if (!overwrite && section.code && section.code.trim() !== '') {
    sectionCode = section.code;
    stats.skipped++;
  } else {
    sectionCode = nextAvailable('S', 'section', counters, occupied);
    stats.written++;
  }

  // Questions
  const newQuestions: Question[] = section.questions.map((q) => {
    if (!overwrite && q.code && q.code.trim() !== '') {
      stats.skipped++;
      return q;
    }
    const prefix = q.type === 'text' ? 'T' : 'Q';
    const counterKey: keyof Counters = q.type === 'text' ? 'text' : 'question';
    const code = nextAvailable(prefix, counterKey, counters, occupied);
    stats.written++;
    return { ...q, code };
  });

  // SubSections
  const newSubSections: Section[] = (section.subSections ?? []).map((sub) =>
    processSection(sub, counters, occupied, overwrite, stats),
  );

  return {
    ...section,
    code: sectionCode,
    questions: newQuestions,
    ...(section.subSections !== undefined ? { subSections: newSubSections } : {}),
  };
}

// ── main export ──────────────────────────────────────────────────────────────

export function generateCodes(
  questionnaire: Questionnaire,
  options: GenerateCodesOptions = {},
): GenerateCodesResult {
  const overwrite = options.overwrite ?? false;

  const counters: Counters = { section: 1, question: 1, text: 1, template: 1 };
  // In fill-only mode, pre-populate occupied so counters skip existing codes.
  const occupied: Set<string> = overwrite ? new Set() : collectAllCodes(questionnaire);
  const stats = { written: 0, skipped: 0 };

  // 1. ResponseTemplates
  const newTemplates: ResponseTemplate[] = (
    questionnaire.responseTemplates?.templates ?? []
  ).map((tpl) => {
    let tplCode: string;
    if (!overwrite && tpl.code && tpl.code.trim() !== '') {
      tplCode = tpl.code;
      stats.skipped++;
    } else {
      tplCode = nextAvailable('QT', 'template', counters, occupied);
      stats.written++;
    }

    let optN = 1;
    const newOptions: TextOption[] = tpl.options.map((opt) => {
      if (!overwrite && opt.code && opt.code.trim() !== '') {
        stats.skipped++;
        return opt;
      }
      let optCode = `${tplCode}-O${optN}`;
      while (occupied.has(optCode)) { optN++; optCode = `${tplCode}-O${optN}`; }
      optN++;
      occupied.add(optCode);
      stats.written++;
      return { ...opt, code: optCode };
    });

    return { ...tpl, code: tplCode, options: newOptions };
  });

  // 2. Sections (recursive)
  const newSections: Section[] = questionnaire.sections.map((s) =>
    processSection(s, counters, occupied, overwrite, stats),
  );

  return {
    questionnaire: {
      ...questionnaire,
      sections: newSections,
      ...(questionnaire.responseTemplates !== undefined
        ? { responseTemplates: { templates: newTemplates } }
        : {}),
    },
    count: stats.written,
    skipped: stats.skipped,
  };
}
