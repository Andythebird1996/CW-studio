/**
 * Client-side validation for a Questionnaire.
 *
 * Validation is purely informational — it never blocks saving or publishing.
 * Returns a list of ValidationIssue sorted: errors first, then warnings.
 */

import type { Questionnaire, Section, Question } from '../types/questionnaire';
import { t, tf, type UILang } from '../i18n';

export interface ValidationIssue {
  /** Dot-notation path, e.g. "sections[0].questions[2]" */
  path: string;
  /** The element's code (may be empty string if that is the problem) */
  elementCode: string;
  /** Human-readable label for display in the panel */
  elementLabel: string;
  severity: 'error' | 'warning';
  message: string;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function allTextsEmpty(texts: Record<string, string> | undefined): boolean {
  if (!texts) return true;
  return Object.values(texts).every((v) => !v || v.trim() === '');
}

function collectAllQuestionCodes(sections: Section[]): Set<string> {
  const codes = new Set<string>();
  const queue = [...sections];
  while (queue.length > 0) {
    const s = queue.shift()!;
    for (const q of s.questions) {
      if (q.code) codes.add(q.code);
    }
    if (s.subSections) queue.push(...s.subSections);
  }
  return codes;
}

function collectAllCalculationCodes(questionnaire: Questionnaire): Set<string> {
  const codes = new Set<string>();
  for (const calc of questionnaire.calculations?.calculations ?? []) {
    if (calc.code) codes.add(calc.code);
  }
  return codes;
}

// ── main export ───────────────────────────────────────────────────────────────

export function validateQuestionnaire(questionnaire: Questionnaire, lang: UILang = 'EN'): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Collect all codes globally for duplicate detection
  const allCodes: string[] = [];

  // ── ResponseTemplates ──────────────────────────────────────────────────────
  const templates = questionnaire.responseTemplates?.templates ?? [];
  templates.forEach((tpl, ti) => {
    const path = `responseTemplates.templates[${ti}]`;
    const label = tpl.name || tpl.code || tf('labelTemplate', lang, { n: ti + 1 });

    if (!tpl.code || tpl.code.trim() === '') {
      issues.push({
        path,
        elementCode: '',
        elementLabel: label,
        severity: 'error',
        message: t('valTemplateMissingCode', lang),
      });
    } else {
      allCodes.push(tpl.code);
    }

    tpl.options.forEach((opt, oi) => {
      const optPath = `${path}.options[${oi}]`;
      const optLabel = opt.texts
        ? (Object.values(opt.texts).find((v) => v) ?? (opt.code || tf('labelOption', lang, { n: oi + 1 })))
        : (opt.code || tf('labelOption', lang, { n: oi + 1 }));
      if (!opt.code || opt.code.trim() === '') {
        issues.push({
          path: optPath,
          elementCode: '',
          elementLabel: String(optLabel),
          severity: 'error',
          message: tf('valOptionMissingCode', lang, { label }),
        });
      } else {
        allCodes.push(opt.code);
      }
    });
  });

  // ── Sections (recursive) ──────────────────────────────────────────────────
  function validateSection(section: Section, path: string, sIdx: number): void {
    const sLabel = (Object.values(section.titles).find((v) => v) ?? section.code ?? tf('labelSection', lang, { n: sIdx + 1 }));

    if (!section.code || section.code.trim() === '') {
      issues.push({
        path,
        elementCode: '',
        elementLabel: String(sLabel),
        severity: 'error',
        message: t('valSectionMissingCode', lang),
      });
    } else {
      allCodes.push(section.code);
    }

    if (allTextsEmpty(section.titles)) {
      issues.push({
        path,
        elementCode: section.code ?? '',
        elementLabel: String(sLabel),
        severity: 'warning',
        message: t('valSectionNoTitle', lang),
      });
    }

    section.questions.forEach((q, qi) => {
      validateQuestion(q, `${path}.questions[${qi}]`, qi);
    });

    (section.subSections ?? []).forEach((sub, si) => {
      validateSection(sub, `${path}.subSections[${si}]`, si);
    });
  }

  function validateQuestion(q: Question, path: string, _qi: number): void {
    const questionText = Object.values(q.texts).find((v) => v) ?? '';
    const label = questionText || q.code || path;

    if (!q.code || q.code.trim() === '') {
      issues.push({
        path,
        elementCode: '',
        elementLabel: String(label),
        severity: 'error',
        message: q.type === 'text'
          ? t('valTextMissingCode', lang)
          : t('valQuestionMissingCode', lang),
      });
    } else {
      allCodes.push(q.code);
    }

    if (allTextsEmpty(q.texts)) {
      issues.push({
        path,
        elementCode: q.code,
        elementLabel: q.code || path,
        severity: 'warning',
        message: q.type === 'text'
          ? t('valTextNoContent', lang)
          : t('valQuestionNoText', lang),
      });
    }
  }

  questionnaire.sections.forEach((s, i) => {
    validateSection(s, `sections[${i}]`, i);
  });

  // ── Duplicate codes ────────────────────────────────────────────────────────
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const code of allCodes) {
    if (seen.has(code)) {
      duplicates.add(code);
    } else {
      seen.add(code);
    }
  }
  for (const dup of duplicates) {
    issues.push({
      path: '(global)',
      elementCode: dup,
      elementLabel: dup,
      severity: 'error',
      message: tf('valDuplicateCode', lang, { code: dup }),
    });
  }

  // ── Calculations cross-reference ──────────────────────────────────────────
  const questionCodes = collectAllQuestionCodes(questionnaire.sections);
  const calculationCodes = collectAllCalculationCodes(questionnaire);

  (questionnaire.calculations?.calculations ?? []).forEach((calc, ci) => {
    calc.innerCalculations.forEach((ic, ici) => {
      if (ic.questionCode && !questionCodes.has(ic.questionCode)) {
        issues.push({
          path: `calculations.calculations[${ci}].innerCalculations[${ici}]`,
          elementCode: calc.code,
          elementLabel: calc.name || calc.code || tf('labelCalculation', lang, { n: ci + 1 }),
          severity: 'warning',
          message: tf('valCalcMissingQuestion', lang, { calc: calc.code, question: ic.questionCode }),
        });
      }
    });
  });

  // ── Flags cross-reference ─────────────────────────────────────────────────
  (questionnaire.flags ?? []).forEach((flag, fi) => {
    flag.conditions.forEach((cond, ci) => {
      if (cond.calculationCode && !calculationCodes.has(cond.calculationCode)) {
        issues.push({
          path: `flags[${fi}].conditions[${ci}]`,
          elementCode: flag.code,
          elementLabel: flag.name || flag.code || tf('labelFlag', lang, { n: fi + 1 }),
          severity: 'warning',
          message: tf('valFlagMissingCalc', lang, { flag: flag.code, calc: cond.calculationCode }),
        });
      }
    });
  });

  // Sort: errors first, then warnings
  issues.sort((a, b) => {
    if (a.severity === b.severity) return 0;
    return a.severity === 'error' ? -1 : 1;
  });

  return issues;
}
