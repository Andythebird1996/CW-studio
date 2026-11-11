/**
 * Pure-logic tests for AssessmentPreview helper functions.
 *
 * The functions (evalStatement, evalExpression, isVisible, canContinue,
 * flattenSections) are not exported from the component, so we replicate
 * identical inline versions here and test them directly — no React, no DOM.
 */

import { describe, it, expect } from 'vitest';
import { respondentProgress } from './AssessmentPreview';

// ── Types (minimal, mirroring questionnaire.ts) ───────────────────────────────

type AnswerMap = Map<string, string | string[]>;

interface SimpleStatement {
  questionCode: string;
  operator: string;
  value?: string;
}

interface Expression {
  statements: SimpleStatement[];
  logic?: 'AND' | 'OR';
}

interface Section {
  hideExpressions?: Expression[];
  showExpressions?: Expression[];
  continueIfExpressions?: Expression[];
  subSections?: Section[];
  // index signature for structural compatibility
  [key: string]: unknown;
}

// ── Inline logic (identical to AssessmentPreview.tsx) ─────────────────────────

function evalStatement(stmt: SimpleStatement, answers: AnswerMap): boolean {
  const raw = answers.get(stmt.questionCode);
  const strVal = Array.isArray(raw) ? raw.join(',') : (raw ?? '');
  const hasVal = strVal !== '' && strVal !== undefined;

  switch (stmt.operator) {
    case 'HAS_VALUE': return hasVal;
    case 'NO_VALUE':  return !hasVal;
    case 'EQ':        return strVal === (stmt.value ?? '');
    case 'NEQ':       return strVal !== (stmt.value ?? '');
    case 'GT':        return parseFloat(strVal) > parseFloat(stmt.value ?? '0');
    case 'GTE':       return parseFloat(strVal) >= parseFloat(stmt.value ?? '0');
    case 'LT':        return parseFloat(strVal) < parseFloat(stmt.value ?? '0');
    case 'LTE':       return parseFloat(strVal) <= parseFloat(stmt.value ?? '0');
    default:          return true;
  }
}

function evalExpression(expr: Expression, answers: AnswerMap): boolean {
  if (expr.statements.length === 0) return false;
  if (expr.logic === 'AND') return expr.statements.every((s) => evalStatement(s, answers));
  return expr.statements.some((s) => evalStatement(s, answers));
}

function isVisible(q: Section, answers: AnswerMap): boolean {
  if (q.hideExpressions?.length) {
    for (const expr of q.hideExpressions) {
      if (evalExpression(expr, answers)) return false;
    }
  }
  if (q.showExpressions?.length) {
    for (const expr of q.showExpressions) {
      if (!evalExpression(expr, answers)) return false;
    }
  }
  return true;
}

function canContinue(section: Section, answers: AnswerMap): boolean {
  if (!section.continueIfExpressions?.length) return true;
  return section.continueIfExpressions.every((expr) => evalExpression(expr, answers));
}

function flattenSections(secs: Section[]): Section[] {
  const result: Section[] = [];
  const stack = [...secs].reverse();
  while (stack.length > 0) {
    const s = stack.pop()!;
    result.push(s);
    if (s.subSections?.length) {
      for (let i = s.subSections.length - 1; i >= 0; i--) stack.push(s.subSections[i]);
    }
  }
  return result;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function answers(pairs: [string, string | string[]][]): AnswerMap {
  return new Map(pairs);
}

function stmt(questionCode: string, operator: string, value?: string): SimpleStatement {
  return { questionCode, operator, value };
}

function expr(statements: SimpleStatement[], logic?: 'AND' | 'OR'): Expression {
  return { statements, logic };
}

function section(opts: Partial<Section> = {}): Section {
  return opts as Section;
}

// ── evalStatement ─────────────────────────────────────────────────────────────

describe('evalStatement', () => {
  // HAS_VALUE
  it('HAS_VALUE with a set answer → true', () => {
    expect(evalStatement(stmt('q1', 'HAS_VALUE'), answers([['q1', 'yes']]))).toBe(true);
  });

  it('HAS_VALUE with no answer → false', () => {
    expect(evalStatement(stmt('q1', 'HAS_VALUE'), answers([]))).toBe(false);
  });

  it('HAS_VALUE with empty string → false', () => {
    expect(evalStatement(stmt('q1', 'HAS_VALUE'), answers([['q1', '']]))).toBe(false);
  });

  it('HAS_VALUE with empty array → false', () => {
    expect(evalStatement(stmt('q1', 'HAS_VALUE'), answers([['q1', []]]))).toBe(false);
  });

  // NO_VALUE
  it('NO_VALUE with no answer → true', () => {
    expect(evalStatement(stmt('q1', 'NO_VALUE'), answers([]))).toBe(true);
  });

  it('NO_VALUE with a set answer → false', () => {
    expect(evalStatement(stmt('q1', 'NO_VALUE'), answers([['q1', 'yes']]))).toBe(false);
  });

  it('NO_VALUE with empty string → true', () => {
    expect(evalStatement(stmt('q1', 'NO_VALUE'), answers([['q1', '']]))).toBe(true);
  });

  // EQ
  it('EQ exact match → true', () => {
    expect(evalStatement(stmt('q1', 'EQ', 'A'), answers([['q1', 'A']]))).toBe(true);
  });

  it('EQ no match → false', () => {
    expect(evalStatement(stmt('q1', 'EQ', 'B'), answers([['q1', 'A']]))).toBe(false);
  });

  it('EQ with stmt.value = undefined matches empty string', () => {
    // value is undefined → stmt.value ?? '' = '' → strVal must be '' to match
    expect(evalStatement(stmt('q1', 'EQ', undefined), answers([['q1', '']]))).toBe(true);
  });

  it('EQ with stmt.value = undefined does not match non-empty answer', () => {
    expect(evalStatement(stmt('q1', 'EQ', undefined), answers([['q1', 'X']]))).toBe(false);
  });

  // NEQ
  it('NEQ with different value → true', () => {
    expect(evalStatement(stmt('q1', 'NEQ', 'B'), answers([['q1', 'A']]))).toBe(true);
  });

  it('NEQ with same value → false', () => {
    expect(evalStatement(stmt('q1', 'NEQ', 'A'), answers([['q1', 'A']]))).toBe(false);
  });

  // GT
  it('GT: 5 > 3 → true', () => {
    expect(evalStatement(stmt('q1', 'GT', '3'), answers([['q1', '5']]))).toBe(true);
  });

  it('GT: 3 > 5 → false', () => {
    expect(evalStatement(stmt('q1', 'GT', '5'), answers([['q1', '3']]))).toBe(false);
  });

  it('GT: equal values → false', () => {
    expect(evalStatement(stmt('q1', 'GT', '5'), answers([['q1', '5']]))).toBe(false);
  });

  it('GT with NaN value (parseFloat("abc")) → false', () => {
    // NaN > anything is always false
    expect(evalStatement(stmt('q1', 'GT', '0'), answers([['q1', 'abc']]))).toBe(false);
  });

  // GTE
  it('GTE: 5 >= 5 → true', () => {
    expect(evalStatement(stmt('q1', 'GTE', '5'), answers([['q1', '5']]))).toBe(true);
  });

  it('GTE: 4 >= 5 → false', () => {
    expect(evalStatement(stmt('q1', 'GTE', '5'), answers([['q1', '4']]))).toBe(false);
  });

  // LT
  it('LT: 2 < 5 → true', () => {
    expect(evalStatement(stmt('q1', 'LT', '5'), answers([['q1', '2']]))).toBe(true);
  });

  it('LT: 5 < 5 → false', () => {
    expect(evalStatement(stmt('q1', 'LT', '5'), answers([['q1', '5']]))).toBe(false);
  });

  // LTE
  it('LTE: 5 <= 5 → true', () => {
    expect(evalStatement(stmt('q1', 'LTE', '5'), answers([['q1', '5']]))).toBe(true);
  });

  it('LTE: 6 <= 5 → false', () => {
    expect(evalStatement(stmt('q1', 'LTE', '5'), answers([['q1', '6']]))).toBe(false);
  });

  // Unknown operator fallback
  it('unknown operator → true (fallback)', () => {
    expect(evalStatement(stmt('q1', 'UNKNOWN_OP', 'x'), answers([['q1', 'y']]))).toBe(true);
  });

  // Array answers
  it('HAS_VALUE with ["A","B"] → true', () => {
    expect(evalStatement(stmt('q1', 'HAS_VALUE'), answers([['q1', ['A', 'B']]]))).toBe(true);
  });

  it('HAS_VALUE with [] → false', () => {
    expect(evalStatement(stmt('q1', 'HAS_VALUE'), answers([['q1', []]]))).toBe(false);
  });

  it('EQ against "A" where value is ["A","B"] (joined = "A,B") → false', () => {
    // Array is joined with comma; "A,B" !== "A"
    expect(evalStatement(stmt('q1', 'EQ', 'A'), answers([['q1', ['A', 'B']]]))).toBe(false);
  });

  it('EQ against "A,B" where value is ["A","B"] (joined) → true', () => {
    expect(evalStatement(stmt('q1', 'EQ', 'A,B'), answers([['q1', ['A', 'B']]]))).toBe(true);
  });
});

// ── evalExpression ────────────────────────────────────────────────────────────

describe('evalExpression', () => {
  it('empty statements → false', () => {
    expect(evalExpression(expr([]), answers([]))).toBe(false);
  });

  it('AND: all true → true', () => {
    const e = expr(
      [stmt('q1', 'HAS_VALUE'), stmt('q2', 'HAS_VALUE')],
      'AND',
    );
    expect(evalExpression(e, answers([['q1', 'yes'], ['q2', 'yes']]))).toBe(true);
  });

  it('AND: one false → false', () => {
    const e = expr(
      [stmt('q1', 'HAS_VALUE'), stmt('q2', 'HAS_VALUE')],
      'AND',
    );
    expect(evalExpression(e, answers([['q1', 'yes']]))).toBe(false);
  });

  it('OR: all false → false', () => {
    const e = expr(
      [stmt('q1', 'HAS_VALUE'), stmt('q2', 'HAS_VALUE')],
      'OR',
    );
    expect(evalExpression(e, answers([]))).toBe(false);
  });

  it('OR: one true → true', () => {
    const e = expr(
      [stmt('q1', 'HAS_VALUE'), stmt('q2', 'HAS_VALUE')],
      'OR',
    );
    expect(evalExpression(e, answers([['q2', 'yes']]))).toBe(true);
  });

  it('logic undefined → treated as OR (some)', () => {
    const e = expr([stmt('q1', 'HAS_VALUE'), stmt('q2', 'HAS_VALUE')]);
    // Only q2 answered — OR should return true
    expect(evalExpression(e, answers([['q2', 'val']]))).toBe(true);
  });

  it('logic undefined with all false → false', () => {
    const e = expr([stmt('q1', 'HAS_VALUE'), stmt('q2', 'HAS_VALUE')]);
    expect(evalExpression(e, answers([]))).toBe(false);
  });
});

// ── isVisible ─────────────────────────────────────────────────────────────────

describe('isVisible', () => {
  it('no hide, no show → true', () => {
    expect(isVisible(section(), answers([]))).toBe(true);
  });

  it('hideExpression is true → false (hidden)', () => {
    const s = section({
      hideExpressions: [expr([stmt('q1', 'HAS_VALUE')])],
    });
    expect(isVisible(s, answers([['q1', 'yes']]))).toBe(false);
  });

  it('hideExpression is false → true (visible)', () => {
    const s = section({
      hideExpressions: [expr([stmt('q1', 'HAS_VALUE')])],
    });
    expect(isVisible(s, answers([]))).toBe(true);
  });

  it('showExpression is true → true (visible)', () => {
    const s = section({
      showExpressions: [expr([stmt('q1', 'HAS_VALUE')])],
    });
    expect(isVisible(s, answers([['q1', 'yes']]))).toBe(true);
  });

  it('showExpression is false → false (hidden)', () => {
    const s = section({
      showExpressions: [expr([stmt('q1', 'HAS_VALUE')])],
    });
    expect(isVisible(s, answers([]))).toBe(false);
  });

  it('both hide (true) and show (true) → false (hide wins, checked first)', () => {
    const s = section({
      hideExpressions: [expr([stmt('q1', 'HAS_VALUE')])],
      showExpressions: [expr([stmt('q1', 'HAS_VALUE')])],
    });
    expect(isVisible(s, answers([['q1', 'yes']]))).toBe(false);
  });

  it('both empty arrays → true', () => {
    const s = section({
      hideExpressions: [],
      showExpressions: [],
    });
    expect(isVisible(s, answers([]))).toBe(true);
  });
});

// ── canContinue ───────────────────────────────────────────────────────────────

describe('canContinue', () => {
  it('no continueIfExpressions → true', () => {
    expect(canContinue(section(), answers([]))).toBe(true);
  });

  it('empty array → true', () => {
    expect(canContinue(section({ continueIfExpressions: [] }), answers([]))).toBe(true);
  });

  it('one expression that matches → true', () => {
    const s = section({
      continueIfExpressions: [expr([stmt('q1', 'HAS_VALUE')])],
    });
    expect(canContinue(s, answers([['q1', 'yes']]))).toBe(true);
  });

  it('one expression that does not match → false', () => {
    const s = section({
      continueIfExpressions: [expr([stmt('q1', 'HAS_VALUE')])],
    });
    expect(canContinue(s, answers([]))).toBe(false);
  });

  it('two expressions, both match → true (every)', () => {
    const s = section({
      continueIfExpressions: [
        expr([stmt('q1', 'HAS_VALUE')]),
        expr([stmt('q2', 'HAS_VALUE')]),
      ],
    });
    expect(canContinue(s, answers([['q1', 'a'], ['q2', 'b']]))).toBe(true);
  });

  it('two expressions, one does not match → false', () => {
    const s = section({
      continueIfExpressions: [
        expr([stmt('q1', 'HAS_VALUE')]),
        expr([stmt('q2', 'HAS_VALUE')]),
      ],
    });
    expect(canContinue(s, answers([['q1', 'a']]))).toBe(false);
  });
});

// ── flattenSections ───────────────────────────────────────────────────────────

describe('flattenSections', () => {
  it('empty list → empty array', () => {
    expect(flattenSections([])).toEqual([]);
  });

  it('flat list of 3 sections → 3 in result', () => {
    const s1 = section({ id: '1' });
    const s2 = section({ id: '2' });
    const s3 = section({ id: '3' });
    const result = flattenSections([s1, s2, s3]);
    expect(result).toHaveLength(3);
    expect(result[0]).toBe(s1);
    expect(result[1]).toBe(s2);
    expect(result[2]).toBe(s3);
  });

  it('2 sections, one with 1 subSection → 3 in result (parent + sub)', () => {
    const sub = section({ id: 'sub' });
    const s1 = section({ id: 'A', subSections: [sub] });
    const s2 = section({ id: 'B' });
    const result = flattenSections([s1, s2]);
    expect(result).toHaveLength(3);
    expect(result[0]).toBe(s1);
    expect(result[1]).toBe(sub);
    expect(result[2]).toBe(s2);
  });

  it('depth 3 → correct pre-order traversal', () => {
    const leaf1 = section({ id: 'leaf1' });
    const leaf2 = section({ id: 'leaf2' });
    const mid = section({ id: 'mid', subSections: [leaf1, leaf2] });
    const root = section({ id: 'root', subSections: [mid] });

    const result = flattenSections([root]);
    expect(result).toHaveLength(4);
    expect(result[0]).toBe(root);
    expect(result[1]).toBe(mid);
    expect(result[2]).toBe(leaf1);
    expect(result[3]).toBe(leaf2);
  });

  it('multiple top-level sections with subs preserve order', () => {
    const sub1 = section({ id: 'sub1' });
    const sub2 = section({ id: 'sub2' });
    const a = section({ id: 'A', subSections: [sub1] });
    const b = section({ id: 'B', subSections: [sub2] });
    const result = flattenSections([a, b]);
    expect(result).toHaveLength(4);
    expect(result[0]).toBe(a);
    expect(result[1]).toBe(sub1);
    expect(result[2]).toBe(b);
    expect(result[3]).toBe(sub2);
  });
});

describe('respondentProgress', () => {
  it('rounds the share of items reached at the end of the page', () => {
    // 22 items paged 6 / 5 / 5 / 6 — same shape as a 4-page respondent form.
    expect(respondentProgress([6, 5, 5, 6], 0)).toBe(27);
    expect(respondentProgress([6, 5, 5, 6], 1)).toBe(50);
    expect(respondentProgress([6, 5, 5, 6], 2)).toBe(73);
    expect(respondentProgress([6, 5, 5, 6], 3)).toBe(100);
  });

  it('returns 0 when there is nothing to measure', () => {
    expect(respondentProgress([], 0)).toBe(0);
    expect(respondentProgress([0, 0], 1)).toBe(0);
  });
});
