/**
 * Advanced RAP interpreter tests
 * Covers: computeZscore, lookupNorm, DIM_T, LOOKUP, PERCENTILE,
 *         evaluateFlag edge-cases, COUNT_SURVEY, computeCalc MEAN/COUNT
 */

import { describe, it, expect } from 'vitest';
import { interpretRap } from './rap-interpreter';
import type { SimContext } from './rap-interpreter';
import type { Questionnaire } from '../types/questionnaire';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeQuestionnaire(overrides: Partial<Questionnaire> = {}): Questionnaire {
  return {
    code: 'TEST',
    version: '1',
    name: { NO: 'Test', EN: 'Test', SV: '', DA: '', FI: '', DE: '', FR: '', PL: '' },
    type: 'QUESTIONNAIRE',
    defaultLanguage: 'NO',
    supportedLanguages: ['NO'],
    sections: [],
    ...overrides,
  };
}

function makeCtx(overrides: Partial<SimContext> = {}): SimContext {
  return {
    questionnaire: makeQuestionnaire(),
    answers: new Map(),
    patient: {
      name: 'Test Pasient',
      dob: '1990-01-01',
      gender: 0,
    },
    ...overrides,
  };
}

// ─── ZSCORE ─────────────────────────────────────────────────────────────────

describe('computeZscore via substituteText', () => {
  it('returns correct z-score for value 60 with mean=50, sd=10 → 1', () => {
    const ctx = makeCtx({
      questionnaire: makeQuestionnaire({
        calculations: {
          calculations: [],
          norms: [
            {
              code: 'NORM_Z',
              name: 'Z-norm',
              type: 'ZSCORE',
              data: [{ score: 50, normValue: 10 }], // mean=50, sd=10
            },
          ],
        },
      }),
    });
    const result = interpretRap('ZSCORE(NORM_Z, 60)', ctx);
    expect(result).toContain('1');
  });

  it('returns 0 when sd=0 (division-by-zero guard)', () => {
    const ctx = makeCtx({
      questionnaire: makeQuestionnaire({
        calculations: {
          calculations: [],
          norms: [
            {
              code: 'NORM_ZERO_SD',
              name: 'Zero-SD norm',
              type: 'ZSCORE',
              data: [{ score: 50, normValue: 0 }], // sd=0
            },
          ],
        },
      }),
    });
    const result = interpretRap('ZSCORE(NORM_ZERO_SD, 60)', ctx);
    expect(result).toContain('0');
  });
});

// ─── PERCENTILE ──────────────────────────────────────────────────────────────

describe('PERCENTILE via substituteText', () => {
  it('returns normValue from lookup table for given value', () => {
    const ctx = makeCtx({
      questionnaire: makeQuestionnaire({
        calculations: {
          calculations: [],
          norms: [
            {
              code: 'PERC_NORM',
              name: 'Percentile norm',
              type: 'PERCENTILE',
              data: [
                { score: 0,  normValue: 5  },
                { score: 10, normValue: 50 },
                { score: 20, normValue: 95 },
              ],
            },
          ],
        },
      }),
    });
    // value=10 matches score=10 → normValue=50
    const result = interpretRap('PERCENTILE(PERC_NORM, 10)', ctx);
    expect(result).toContain('50');
  });
});

// ─── DIM_T ───────────────────────────────────────────────────────────────────

describe('DIM_T via substituteText', () => {
  it('computes T-score = round(50 + 10 * z): mean=50 sd=10 value=60 → 60', () => {
    // CALC(TOTAL) = 60 (one question answered with score 60)
    const ctx = makeCtx({
      questionnaire: makeQuestionnaire({
        calculations: {
          calculations: [
            {
              code: 'TOTAL',
              name: 'Total',
              type: 'SUM',
              innerCalculations: [{ questionCode: 'Q1' }],
            },
          ],
          norms: [
            {
              code: 'NORM_Z',
              name: 'Z-norm',
              type: 'ZSCORE',
              data: [{ score: 50, normValue: 10 }],
            },
          ],
        },
      }),
      answers: new Map([['Q1', { score: 60, text: '60' }]]),
    });
    // z = (60-50)/10 = 1 → T = round(50 + 10*1) = 60
    const result = interpretRap('DIM_T(TOTAL, NORM_Z)', ctx);
    expect(result).toContain('60');
  });
});

// ─── LOOKUP ──────────────────────────────────────────────────────────────────

describe('LOOKUP via substituteText', () => {
  it('looks up value from normtable (dimCode ignored)', () => {
    const ctx = makeCtx({
      questionnaire: makeQuestionnaire({
        calculations: {
          calculations: [],
          norms: [
            {
              code: 'LU_NORM',
              name: 'Lookup norm',
              type: 'NORM',
              data: [
                { score: 0,  normValue: 10 },
                { score: 5,  normValue: 40 },
                { score: 15, normValue: 80 },
              ],
            },
          ],
        },
      }),
    });
    // value=5 → normValue=40
    const result = interpretRap('LOOKUP(5, IGNORED, LU_NORM)', ctx);
    expect(result).toContain('40');
  });
});

// ─── lookupNorm edge-cases ────────────────────────────────────────────────────

describe('lookupNorm edge-cases via NORM()', () => {
  it('returns first row normValue when value is below minimum score', () => {
    const ctx = makeCtx({
      questionnaire: makeQuestionnaire({
        calculations: {
          calculations: [],
          norms: [
            {
              code: 'EDGE_NORM',
              name: 'Edge norm',
              type: 'NORM',
              data: [
                { score: 10, normValue: 99 },
                { score: 20, normValue: 88 },
              ],
            },
          ],
        },
      }),
    });
    // value=0 is below min score 10 → falls back to sorted[0].normValue = 99
    const result = interpretRap('NORM(EDGE_NORM, 0)', ctx);
    expect(result).toContain('99');
  });

  it('returns 0 when norm data is empty', () => {
    const ctx = makeCtx({
      questionnaire: makeQuestionnaire({
        calculations: {
          calculations: [],
          norms: [
            {
              code: 'EMPTY_NORM',
              name: 'Empty norm',
              type: 'NORM',
              data: [],
            },
          ],
        },
      }),
    });
    const result = interpretRap('NORM(EMPTY_NORM, 5)', ctx);
    expect(result).toContain('0');
  });

  it('sorts unsorted data and returns correct normValue', () => {
    const ctx = makeCtx({
      questionnaire: makeQuestionnaire({
        calculations: {
          calculations: [],
          norms: [
            {
              code: 'UNSORTED_NORM',
              name: 'Unsorted norm',
              type: 'NORM',
              data: [
                { score: 30, normValue: 70 },
                { score: 10, normValue: 20 },
                { score: 20, normValue: 50 },
              ],
            },
          ],
        },
      }),
    });
    // After sort by score: [{10,20},{20,50},{30,70}]
    // value=20 → largest score <= 20 is 20 → normValue=50
    const result = interpretRap('NORM(UNSORTED_NORM, 20)', ctx);
    expect(result).toContain('50');
  });
});

// ─── evaluateFlag ─────────────────────────────────────────────────────────────

describe('evaluateFlag via FLAG() in substituteText', () => {
  it('returns 0 (false) when conditions list is empty — not 1', () => {
    const ctx = makeCtx({
      questionnaire: makeQuestionnaire({
        flags: [
          {
            code: 'EMPTY_FLAG',
            name: 'Empty flag',
            type: 'WARNING',
            conditions: [],
            logic: 'OR',
          },
        ],
      }),
    });
    const result = interpretRap('FLAG(EMPTY_FLAG)', ctx);
    expect(result).toContain('0');
    // Extract body content only — the HTML wrapper contains '1' in CSS values like '960px'
    const bodyMatch = result.match(/<body>([\s\S]*?)<\/body>/);
    const body = bodyMatch ? bodyMatch[1].trim() : result;
    expect(body).toBe('0');
  });

  it('returns 1 (true) with OR logic when one condition is satisfied', () => {
    const ctx = makeCtx({
      questionnaire: makeQuestionnaire({
        calculations: {
          calculations: [
            {
              code: 'CALC_A',
              name: 'Calc A',
              type: 'SUM',
              innerCalculations: [{ questionCode: 'Q1' }],
            },
            {
              code: 'CALC_B',
              name: 'Calc B',
              type: 'SUM',
              innerCalculations: [{ questionCode: 'Q2' }],
            },
          ],
          norms: [],
        },
        flags: [
          {
            code: 'OR_FLAG',
            name: 'OR flag',
            type: 'WARNING',
            conditions: [
              { calculationCode: 'CALC_A', operator: 'GTE', threshold: 10 }, // 5 < 10 → false
              { calculationCode: 'CALC_B', operator: 'GTE', threshold: 3  }, // 5 >= 3 → true
            ],
            logic: 'OR',
          },
        ],
      }),
      answers: new Map([
        ['Q1', { score: 5, text: '5' }],
        ['Q2', { score: 5, text: '5' }],
      ]),
    });
    const result = interpretRap('FLAG(OR_FLAG)', ctx);
    expect(result).toContain('1');
  });

  it('returns 1 (true) with AND logic when all conditions are satisfied', () => {
    const ctx = makeCtx({
      questionnaire: makeQuestionnaire({
        calculations: {
          calculations: [
            {
              code: 'CALC_A',
              name: 'Calc A',
              type: 'SUM',
              innerCalculations: [{ questionCode: 'Q1' }],
            },
            {
              code: 'CALC_B',
              name: 'Calc B',
              type: 'SUM',
              innerCalculations: [{ questionCode: 'Q2' }],
            },
          ],
          norms: [],
        },
        flags: [
          {
            code: 'AND_FLAG_PASS',
            name: 'AND flag pass',
            type: 'WARNING',
            conditions: [
              { calculationCode: 'CALC_A', operator: 'GTE', threshold: 3 }, // 5 >= 3 → true
              { calculationCode: 'CALC_B', operator: 'GTE', threshold: 3 }, // 5 >= 3 → true
            ],
            logic: 'AND',
          },
        ],
      }),
      answers: new Map([
        ['Q1', { score: 5, text: '5' }],
        ['Q2', { score: 5, text: '5' }],
      ]),
    });
    const result = interpretRap('FLAG(AND_FLAG_PASS)', ctx);
    expect(result).toContain('1');
  });

  it('returns 0 (false) with AND logic when one condition fails', () => {
    const ctx = makeCtx({
      questionnaire: makeQuestionnaire({
        calculations: {
          calculations: [
            {
              code: 'CALC_A',
              name: 'Calc A',
              type: 'SUM',
              innerCalculations: [{ questionCode: 'Q1' }],
            },
            {
              code: 'CALC_B',
              name: 'Calc B',
              type: 'SUM',
              innerCalculations: [{ questionCode: 'Q2' }],
            },
          ],
          norms: [],
        },
        flags: [
          {
            code: 'AND_FLAG_FAIL',
            name: 'AND flag fail',
            type: 'WARNING',
            conditions: [
              { calculationCode: 'CALC_A', operator: 'GTE', threshold: 3  }, // 5 >= 3 → true
              { calculationCode: 'CALC_B', operator: 'GTE', threshold: 10 }, // 5 < 10 → false
            ],
            logic: 'AND',
          },
        ],
      }),
      answers: new Map([
        ['Q1', { score: 5, text: '5' }],
        ['Q2', { score: 5, text: '5' }],
      ]),
    });
    const result = interpretRap('FLAG(AND_FLAG_FAIL)', ctx);
    expect(result).toContain('0');
  });
});

// ─── COUNT_SURVEY ─────────────────────────────────────────────────────────────

describe('COUNT_SURVEY', () => {
  it("returns '0' in simulator (no historical survey data)", () => {
    const ctx = makeCtx();
    const result = interpretRap('COUNT_SURVEY(TEST)', ctx);
    expect(result).toContain('0');
  });
});

// ─── computeCalc MEAN ────────────────────────────────────────────────────────

describe('computeCalc MEAN', () => {
  it('returns 0 when no questions are answered', () => {
    const ctx = makeCtx({
      questionnaire: makeQuestionnaire({
        calculations: {
          calculations: [
            {
              code: 'MEAN_CALC',
              name: 'Mean calc',
              type: 'MEAN',
              innerCalculations: [
                { questionCode: 'Q1' },
                { questionCode: 'Q2' },
              ],
            },
          ],
          norms: [],
        },
      }),
      answers: new Map(), // no answers
    });
    const result = interpretRap('CALC(MEAN_CALC)', ctx);
    expect(result).toContain('0');
  });
});

// ─── computeCalc COUNT ────────────────────────────────────────────────────────

describe('computeCalc COUNT', () => {
  it('counts only answered questions', () => {
    const ctx = makeCtx({
      questionnaire: makeQuestionnaire({
        calculations: {
          calculations: [
            {
              code: 'COUNT_CALC',
              name: 'Count calc',
              type: 'COUNT',
              innerCalculations: [
                { questionCode: 'Q1' },
                { questionCode: 'Q2' },
                { questionCode: 'Q3' }, // unanswered
              ],
            },
          ],
          norms: [],
        },
      }),
      answers: new Map([
        ['Q1', { score: 1, text: 'yes' }],
        ['Q2', { score: 2, text: 'maybe' }],
        // Q3 not answered
      ]),
    });
    const result = interpretRap('CALC(COUNT_CALC)', ctx);
    expect(result).toContain('2');
  });
});
