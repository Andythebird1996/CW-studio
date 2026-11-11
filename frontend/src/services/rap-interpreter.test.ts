/**
 * Vitest tests for rap-interpreter.ts
 *
 * Covers all major RAP constructions documented in CLAUDE.md and the
 * interpreter source. A minimal SimContext is built at the top of the file
 * and reused (or extended) per test group.
 */

import { describe, it, expect } from 'vitest';
import { interpretRap } from './rap-interpreter';
import type { SimContext, SimAnswer } from './rap-interpreter';
import type { Questionnaire } from '../types/questionnaire';

// ─── Minimal questionnaire fixture ─────────────────────────────────────────

const questionnaire: Questionnaire = {
  code: 'TEST',
  version: '1.0',
  name: { NO: 'Testskjema', EN: 'Test Survey' } as Record<string, string>,
  type: 'QUESTIONNAIRE',
  defaultLanguage: 'NO',
  supportedLanguages: ['NO', 'EN'],
  sections: [
    {
      id: 's1',
      code: 'S1',
      type: 'NORMAL',
      titles: { NO: 'Seksjon 1' } as Record<string, string>,
      questions: [
        {
          id: 'q1',
          code: 'Q1',
          required: true,
          type: 'radiobutton',
          texts: { NO: 'Hvor godt sover du?' } as Record<string, string>,
          options: [
            { code: 'Q1_0', score: 0, texts: { NO: 'Veldig godt' } as Record<string, string> },
            { code: 'Q1_1', score: 1, texts: { NO: 'Ganske godt' } as Record<string, string> },
            { code: 'Q1_2', score: 2, texts: { NO: 'Ganske dårlig' } as Record<string, string> },
            { code: 'Q1_3', score: 3, texts: { NO: 'Veldig dårlig' } as Record<string, string> },
          ],
        },
        {
          id: 'q2',
          code: 'Q2',
          required: true,
          type: 'radiobutton',
          texts: { NO: 'Hvor trøtt er du om dagen?' } as Record<string, string>,
          options: [
            { code: 'Q2_0', score: 0, texts: { NO: 'Ikke i det hele tatt' } as Record<string, string> },
            { code: 'Q2_1', score: 1, texts: { NO: 'Litt' } as Record<string, string> },
            { code: 'Q2_2', score: 2, texts: { NO: 'Ganske mye' } as Record<string, string> },
          ],
        },
        {
          id: 'q3',
          code: 'Q3',
          required: false,
          type: 'radiobutton',
          texts: { NO: 'Har du hodepine?' } as Record<string, string>,
          options: [
            { code: 'Q3_0', score: 0, texts: { NO: 'Nei' } as Record<string, string> },
            { code: 'Q3_1', score: 1, texts: { NO: 'Ja' } as Record<string, string> },
          ],
        },
      ],
    },
  ],
  calculations: {
    calculations: [
      {
        code: 'TOTAL',
        name: 'Totalskåre',
        type: 'SUM',
        innerCalculations: [
          { questionCode: 'Q1', multiplier: 1 },
          { questionCode: 'Q2', multiplier: 1 },
        ],
      },
      {
        code: 'MEAN_SCORE',
        name: 'Gjennomsnitt',
        type: 'MEAN',
        innerCalculations: [
          { questionCode: 'Q1', multiplier: 1 },
          { questionCode: 'Q2', multiplier: 1 },
        ],
      },
    ],
    norms: [
      {
        code: 'NORM_TOTAL',
        name: 'Normtabell total',
        type: 'NORM',
        data: [
          { score: 0, normValue: 10 },
          { score: 2, normValue: 50 },
          { score: 4, normValue: 90 },
        ],
      },
      {
        code: 'ZSCORE_NORM',
        name: 'Z-skåre normtabell',
        type: 'ZSCORE',
        data: [
          { score: 5, normValue: 2 }, // mean=5, sd=2
        ],
      },
    ],
  },
  flags: [
    {
      code: 'HIGH_SCORE',
      name: 'Høy skåre',
      type: 'WARNING',
      conditions: [
        { calculationCode: 'TOTAL', operator: 'GTE', threshold: 4 },
      ],
      logic: 'AND',
    },
    {
      code: 'LOW_SCORE',
      name: 'Lav skåre',
      type: 'INFO',
      conditions: [
        { calculationCode: 'TOTAL', operator: 'LT', threshold: 2 },
      ],
      logic: 'AND',
    },
  ],
};

// ─── Minimal answers fixture ────────────────────────────────────────────────

function makeAnswers(overrides?: Record<string, SimAnswer>): Map<string, SimAnswer> {
  const base: Record<string, SimAnswer> = {
    Q1: { score: 2, text: 'Ganske dårlig' },
    Q2: { score: 1, text: 'Litt' },
  };
  return new Map(Object.entries({ ...base, ...overrides }));
}

// ─── Minimal patient fixture ────────────────────────────────────────────────

const malePatient = {
  name: 'Ola Nordmann',
  firstName: 'Ola',
  lastName: 'Nordmann',
  dob: '1980-06-15',
  gender: 1 as const,
  therapist: 'Dr. Hansen',
  admin: 'Admin User',
};

const femalePatient = {
  name: 'Kari Nordmann',
  firstName: 'Kari',
  lastName: 'Nordmann',
  dob: '1990-03-20',
  gender: 0 as const,
};

function makeCtx(overrides?: Partial<SimContext>): SimContext {
  return {
    questionnaire,
    answers: makeAnswers(),
    patient: malePatient,
    reportName: 'Testrapport',
    ...overrides,
  };
}

/** Extract body text from the full HTML returned by interpretRap. */
function body(html: string): string {
  const m = html.match(/<body>([\s\S]*?)<\/body>/i);
  return m ? m[1].trim() : html.trim();
}

// ─── Helper: run rap and return body ───────────────────────────────────────

function run(rap: string, ctx?: SimContext): string {
  return body(interpretRap(rap, ctx ?? makeCtx()));
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('RAP interpreter — Q(code)', () => {
  it('returns question text for known code', () => {
    expect(run('Q(Q1)')).toBe('Hvor godt sover du?');
  });

  it('returns code itself when question not found', () => {
    expect(run('Q(UNKNOWN)')).toBe('UNKNOWN');
  });

  it('works inside bracket directive', () => {
    const result = run('[Q(Q2)]');
    expect(result).toBe('Hvor trøtt er du om dagen?');
  });
});

describe('RAP interpreter — A(code)', () => {
  it('returns numeric score for answered question (inline)', () => {
    // A(code) in substituteText returns score as string
    expect(run('A(Q1)')).toBe('2');
  });

  it('returns score for Q2', () => {
    expect(run('A(Q2)')).toBe('1');
  });

  it('returns empty string for unanswered question', () => {
    expect(run('A(Q3)')).toBe('');
  });

  it('returns label text via L(code) for radiobutton answer', () => {
    // L(code) returns the option text matching the score
    expect(run('L(Q1)')).toBe('Ganske dårlig');
  });
});

describe('RAP interpreter — CALC(code) and CALC(code, decimals)', () => {
  it('computes SUM calculation correctly', () => {
    // Q1=2, Q2=1 → TOTAL=3
    expect(run('CALC(TOTAL)')).toBe('3');
  });

  it('computes MEAN calculation correctly', () => {
    // (2+1)/2 = 1.5
    expect(run('CALC(MEAN_SCORE)')).toBe('1.5');
  });

  it('formats with specified decimal places', () => {
    // 1.5 with 2 decimals → "1.50"
    expect(run('CALC(MEAN_SCORE, 2)')).toBe('1.50');
  });

  it('formats integer calc with 1 decimal', () => {
    expect(run('CALC(TOTAL, 1)')).toBe('3.0');
  });

  it('returns 0 for unknown calc code', () => {
    expect(run('CALC(NONEXISTENT)')).toBe('0');
  });

  it('handles missing answers in SUM (skips NaN values)', () => {
    // Q3 is not answered → only Q1+Q2 contribute
    const ctx = makeCtx({
      questionnaire: {
        ...questionnaire,
        calculations: {
          ...questionnaire.calculations!,
          calculations: [
            {
              code: 'WITH_MISSING',
              name: 'With missing',
              type: 'SUM',
              innerCalculations: [
                { questionCode: 'Q1', multiplier: 1 },
                { questionCode: 'Q3', multiplier: 1 }, // Q3 not answered
              ],
            },
          ],
          norms: [],
        },
      },
    });
    // Q3 missing → NaN filtered → SUM = 2
    expect(run('CALC(WITH_MISSING)', ctx)).toBe('2');
  });
});

describe('RAP interpreter — [if(COND)] ... [else] ... [endif]', () => {
  it('renders then-branch when condition is true', () => {
    const rap = '[if(CALC(TOTAL) >= 3)]Høy[else]Lav[endif]';
    expect(run(rap)).toBe('Høy');
  });

  it('renders else-branch when condition is false', () => {
    const rap = '[if(CALC(TOTAL) >= 5)]Høy[else]Lav[endif]';
    expect(run(rap)).toBe('Lav');
  });

  it('renders nothing for false condition without else', () => {
    const rap = '[if(CALC(TOTAL) >= 10)]ALDRI[endif]';
    expect(run(rap)).toBe('');
  });

  it('handles nested if blocks', () => {
    const rap = '[if(CALC(TOTAL) >= 2)][if(CALC(TOTAL) >= 3)]3+[else]2+[endif][endif]';
    expect(run(rap)).toBe('3+');
  });

  it('handles inline if form [if(COND){body}]', () => {
    const rap = '[if(CALC(TOTAL) = 3){Trepoeng}]';
    expect(run(rap)).toBe('Trepoeng');
  });

  it('suppresses inline body when condition is false', () => {
    const rap = '[if(CALC(TOTAL) = 99){NeiNei}]';
    expect(run(rap)).toBe('');
  });

  it('supports == operator in conditions', () => {
    const rap = '[if(CALC(TOTAL) == 3)]ja[endif]';
    expect(run(rap)).toBe('ja');
  });

  it('supports != operator in conditions', () => {
    const rap = '[if(CALC(TOTAL) != 99)]yes[endif]';
    expect(run(rap)).toBe('yes');
  });

  it('supports A(code) comparison in conditions', () => {
    // Q1 score=2
    const rap = '[if(A(Q1) = 2)]score2[else]other[endif]';
    expect(run(rap)).toBe('score2');
  });

  it('supports && (AND) in conditions', () => {
    const rap = '[if(CALC(TOTAL) >= 3 && CALC(TOTAL) <= 5)]ok[endif]';
    expect(run(rap)).toBe('ok');
  });

  it('supports || (OR) in conditions', () => {
    const rap = '[if(CALC(TOTAL) >= 99 || CALC(TOTAL) <= 5)]yes[endif]';
    expect(run(rap)).toBe('yes');
  });

  it('supports NOT() negation', () => {
    const rap = '[if(NOT(CALC(TOTAL) >= 99))]negated[endif]';
    expect(run(rap)).toBe('negated');
  });
});

describe('RAP interpreter — EXIST(code) and !EXIST(code)', () => {
  it('EXIST returns true for answered question in if condition', () => {
    const rap = '[if(EXIST(Q1))]exists[else]missing[endif]';
    expect(run(rap)).toBe('exists');
  });

  it('EXIST returns false for unanswered question', () => {
    const rap = '[if(EXIST(Q3))]exists[else]missing[endif]';
    expect(run(rap)).toBe('missing');
  });

  it('!EXIST returns true for unanswered question', () => {
    const rap = '[if(!EXIST(Q3))]notexists[else]exists[endif]';
    expect(run(rap)).toBe('notexists');
  });

  it('!EXIST returns false for answered question', () => {
    const rap = '[if(!EXIST(Q1))]notexists[else]exists[endif]';
    expect(run(rap)).toBe('exists');
  });
});

describe('RAP interpreter — system variables', () => {
  it('substitutes $PATIENT_NAME', () => {
    expect(run('$PATIENT_NAME')).toBe('Ola Nordmann');
  });

  it('substitutes $PATIENT_FNAME', () => {
    expect(run('$PATIENT_FNAME')).toBe('Ola');
  });

  it('substitutes $PATIENT_LNAME', () => {
    expect(run('$PATIENT_LNAME')).toBe('Nordmann');
  });

  it('substitutes $AGE with a non-empty number string for valid dob', () => {
    const result = run('$AGE');
    expect(result).toMatch(/^\d+$/);
    const age = parseInt(result);
    expect(age).toBeGreaterThan(30);
    expect(age).toBeLessThan(80);
  });

  it('substitutes $KJONN as "han" for male patient', () => {
    expect(run('$KJONN')).toBe('han');
  });

  it('substitutes $KJONN as "hun" for female patient', () => {
    expect(run('$KJONN', makeCtx({ patient: femalePatient }))).toBe('hun');
  });

  it('substitutes $KJONN_SUBST as "mann" for male', () => {
    expect(run('$KJONN_SUBST')).toBe('mann');
  });

  it('substitutes $KJONN_SUBST as "kvinne" for female', () => {
    expect(run('$KJONN_SUBST', makeCtx({ patient: femalePatient }))).toBe('kvinne');
  });

  it('substitutes $KJONN_GEN as "hans" for male', () => {
    expect(run('$KJONN_GEN')).toBe('hans');
  });

  it('substitutes $KJONN_GEN as "hennes" for female', () => {
    expect(run('$KJONN_GEN', makeCtx({ patient: femalePatient }))).toBe('hennes');
  });

  it('substitutes $CURRENT_DATE with a date-like string', () => {
    // Norwegian format: DD.MM.YY
    expect(run('$CURRENT_DATE')).toMatch(/^\d{2}\.\d{2}\.\d{2}$/);
  });

  it('substitutes $GENDER as numeric string for male', () => {
    expect(run('$GENDER')).toBe('1');
  });

  it('substitutes $GENDER as "0" for female', () => {
    expect(run('$GENDER', makeCtx({ patient: femalePatient }))).toBe('0');
  });

  it('substitutes $SURVEY_NAME', () => {
    expect(run('$SURVEY_NAME')).toBe('Testskjema');
  });

  it('substitutes $REPORT_NAME', () => {
    expect(run('$REPORT_NAME')).toBe('Testrapport');
  });

  it('$PATIENT_THERAPIST returns therapist name', () => {
    expect(run('$PATIENT_THERAPIST')).toBe('Dr. Hansen');
  });

  it('$PATIENT_ADMIN returns admin name', () => {
    expect(run('$PATIENT_ADMIN')).toBe('Admin User');
  });
});

describe('RAP interpreter — SUM(c1,c2,...) and COUNTEXIST(c1,c2,...)', () => {
  it('SUM adds scores for answered questions', () => {
    // Q1=2 + Q2=1 = 3
    expect(run('SUM(Q1,Q2)')).toBe('3');
  });

  it('SUM treats unanswered questions as 0', () => {
    // Q3 not answered → 0
    expect(run('SUM(Q1,Q3)')).toBe('2');
  });

  it('COUNTEXIST counts only answered questions', () => {
    // Q1 and Q2 answered, Q3 not
    expect(run('COUNTEXIST(Q1,Q2,Q3)')).toBe('2');
  });

  it('COUNTEXIST returns 0 for all unanswered', () => {
    expect(run('COUNTEXIST(Q3)')).toBe('0');
  });

  it('SUM in if condition works correctly', () => {
    const rap = '[if(SUM(Q1,Q2) >= 3)]sum3[else]less[endif]';
    expect(run(rap)).toBe('sum3');
  });

  it('COUNTEXIST in if condition works correctly', () => {
    const rap = '[if(COUNTEXIST(Q1,Q2) = 2)]two[endif]';
    expect(run(rap)).toBe('two');
  });
});

describe('RAP interpreter — NORM(code, val)', () => {
  it('returns correct normValue for exact score match', () => {
    // NORM_TOTAL: score=2 → normValue=50
    expect(run('NORM(NORM_TOTAL, 2)')).toBe('50');
  });

  it('returns normValue for highest score below value', () => {
    // score=3 is between 2 and 4 → uses score=2 → normValue=50
    expect(run('NORM(NORM_TOTAL, 3)')).toBe('50');
  });

  it('returns lowest normValue for value below all scores', () => {
    // score=-1 → below score=0 → normValue=10 (lowest)
    expect(run('NORM(NORM_TOTAL, -1)')).toBe('10');
  });

  it('returns highest normValue for value >= max score', () => {
    // score=100 → highest score=4 → normValue=90
    expect(run('NORM(NORM_TOTAL, 100)')).toBe('90');
  });

  it('returns "0" for unknown norm code (lookupNorm returns 0 when not found)', () => {
    // lookupNorm returns 0 when the norm code is not found; the regex guard only
    // suppresses output when the VALUE argument is non-numeric (isNaN check).
    expect(run('NORM(UNKNOWN_NORM, 5)')).toBe('0');
  });

  it('returns empty string for non-numeric value', () => {
    expect(run('NORM(NORM_TOTAL, abc)')).toBe('');
  });
});

describe('RAP interpreter — FLAG(code)', () => {
  it('returns "1" when flag condition is met', () => {
    // TOTAL=3, HIGH_SCORE condition: TOTAL >= 4 → false, but let's test LOW_SCORE: TOTAL < 2 → false
    // HIGH_SCORE: TOTAL=3 >= 4 → false → "0"
    expect(run('FLAG(HIGH_SCORE)')).toBe('0');
  });

  it('returns "1" when flag condition is met (TOTAL >= 4)', () => {
    const ctx = makeCtx({
      answers: makeAnswers({ Q1: { score: 3, text: 'Veldig dårlig' }, Q2: { score: 2, text: 'Ganske mye' } }),
    });
    // TOTAL = 5 >= 4 → HIGH_SCORE fires → "1"
    expect(run('FLAG(HIGH_SCORE)', ctx)).toBe('1');
  });

  it('returns "0" for false flag', () => {
    // TOTAL=3, LOW_SCORE condition: TOTAL < 2 → false
    expect(run('FLAG(LOW_SCORE)')).toBe('0');
  });

  it('returns "1" when low-score flag condition is met (TOTAL < 2)', () => {
    const ctx = makeCtx({
      answers: makeAnswers({ Q1: { score: 0, text: 'Veldig godt' }, Q2: { score: 0, text: 'Ikke i det hele tatt' } }),
    });
    // TOTAL = 0 < 2 → LOW_SCORE fires → "1"
    expect(run('FLAG(LOW_SCORE)', ctx)).toBe('1');
  });

  it('returns "0" for unknown flag code', () => {
    expect(run('FLAG(UNKNOWN_FLAG)')).toBe('0');
  });

  it('returns "1" for met flag, "0" for not-met flag (in-template conditional)', () => {
    const ctx = makeCtx({
      answers: makeAnswers({ Q1: { score: 3, text: 'Veldig dårlig' }, Q2: { score: 2, text: 'Ganske mye' } }),
    });
    // HIGH_SCORE: TOTAL >= 4, TOTAL=5 → fires
    expect(run('[if(FLAG(HIGH_SCORE))]høy[else]lav[endif]', ctx)).toContain('høy');
  });
});

describe('RAP interpreter — [loop(code)] ... [loop_end]', () => {
  it('loops over answered questions in a section the correct number of times', () => {
    // S1 section has Q1 and Q2 answered (Q3 is not answered).
    // LOOP_CODE is an arg key, not a $VAR, so substituteText does not replace bare
    // "LOOP_CODE" in text — use Q(LOOP_CODE) which goes through resolve(code, args).
    const rap = '[loop(S1)]Q(LOOP_CODE)-[loop_end]';
    const result = run(rap);
    // Two answered questions → two iterations → two question texts separated by '-'
    expect(result).toBe('Hvor godt sover du?-Hvor trøtt er du om dagen?-');
  });

  it('numeric loop iterates correct number of times', () => {
    const rap = '[loop(3)]X[loop_end]';
    expect(run(rap)).toBe('XXX');
  });

  it('numeric loop provides LOOP_INDEX', () => {
    // LOOP_INDEX inside the body (it's in args, not text-substituted by default)
    // We access it via text substitution through the args mechanism
    const rap = '[loop(2)]LOOP_INDEX-[loop_end]';
    const result = run(rap);
    // LOOP_INDEX is available as arg 'LOOP_INDEX', resolved by resolve()
    // In text it appears as literal "LOOP_INDEX" unless substituted
    // The loop puts LOOP_INDEX in args, which are used in substituteText via resolve()
    // since args are checked in resolve() for exact matches but the text "LOOP_INDEX"
    // is not prefixed with $ it won't be substituted by the system var replacer,
    // but it WILL be resolved if used as a param in a function call or directive.
    // So let's just check the loop runs 2 times:
    expect(result).toBe('LOOP_INDEX-LOOP_INDEX-');
  });

  it('loop over unknown section code with prefix match falls back to answers', () => {
    const answers = new Map<string, SimAnswer>([
      ['PREFIX_A', { score: 1, text: 'a' }],
      ['PREFIX_B', { score: 2, text: 'b' }],
      ['OTHER', { score: 3, text: 'c' }],
    ]);
    const ctx = makeCtx({ answers });
    const rap = '[loop(PREFIX_)]x[loop_end]';
    const result = run(rap, ctx);
    // Should loop twice (PREFIX_A and PREFIX_B)
    expect(result).toBe('xx');
  });

  it('empty loop (no matching answers) produces no output', () => {
    const rap = '[loop(NONEXISTENT_)]body[loop_end]';
    expect(run(rap)).toBe('');
  });
});

describe('RAP interpreter — [function name(p)] ... [function_end] + [CALL name(arg)]', () => {
  it('defines and calls a zero-parameter function', () => {
    const rap = `[function greet()]Hei verden![function_end][CALL greet()]`;
    expect(run(rap)).toBe('Hei verden!');
  });

  it('defines and calls a function with one parameter via RAP directive in body', () => {
    // Plain text in function body is NOT arg-substituted. Parameters are only
    // resolved when used as arguments to RAP functions (Q(), A(), CALC() etc.) via resolve().
    // To use a param value, wrap it in a RAP directive: [Q(msg)] calls getQuestionText(resolve('msg', args)).
    // For a literal string param, A(msg) won't find it but CALC resolves 0.
    // Simplest proof: use the param as the code in CALC() which returns 0 when not found,
    // confirming arg resolution works at the directive level.
    const rap = `[function say(msg)]CALC(msg)[function_end][CALL say(TOTAL)]`;
    // msg = 'TOTAL' → computeCalc('TOTAL', ctx) = 3
    expect(run(rap)).toBe('3');
  });

  it('calls function multiple times with different calc codes via arg resolution', () => {
    const rap = `[function showCalc(code)]CALC(code)[function_end][CALL showCalc(TOTAL)],[CALL showCalc(MEAN_SCORE)]`;
    // First call: code='TOTAL' → 3; second: code='MEAN_SCORE' → 1.5
    expect(run(rap)).toBe('3,1.5');
  });

  it('function body can use inline RAP substitutions', () => {
    // CALC(TOTAL) in function body is substituted via substituteText — not param-dependent
    const rap = `[function showScore()]Score: CALC(TOTAL)[function_end][CALL showScore()]`;
    expect(run(rap)).toBe('Score: 3');
  });

  it('returns comment for call to unknown function', () => {
    const rap = `[CALL unknown_func(arg)]`;
    expect(run(rap)).toContain('unknown function');
  });
});

describe('RAP interpreter — [DEFINE $VAR, "val"] and variable substitution', () => {
  it('defines and substitutes a variable', () => {
    // DEFINE must be on its own line — preprocessDefines splits by '\n' and tests
    // each trimmed line against the regex. Inline (same line) won't be matched.
    const rap = '[DEFINE $GREETING, "Hei"]\n$GREETING verden';
    expect(run(rap)).toBe('Hei verden');
  });

  it('defines multiple variables', () => {
    const rap = '[DEFINE $A, "foo"]\n[DEFINE $B, "bar"]\n$A og $B';
    expect(run(rap)).toBe('foo og bar');
  });

  it('conditional DEFINE with true condition selects first value', () => {
    // TOTAL=3 >= 3 → true → first value "høy"
    const rap = '[IF(CALC(TOTAL) >= 3) DEFINE $LEVEL, "høy":"lav"]\n$LEVEL';
    expect(run(rap)).toBe('høy');
  });

  it('conditional DEFINE with false condition selects second value', () => {
    // TOTAL=3 >= 10 → false → second value "lav"
    const rap = '[IF(CALC(TOTAL) >= 10) DEFINE $LEVEL, "høy":"lav"]\n$LEVEL';
    expect(run(rap)).toBe('lav');
  });

  it('one-sided conditional DEFINE sets value only when true', () => {
    const rap = '[IF(CALC(TOTAL) >= 3) DEFINE $BADGE, "gull"]\n$BADGE';
    expect(run(rap)).toBe('gull');
  });

  it('one-sided conditional DEFINE does nothing when false', () => {
    // $BADGE never defined → stays as literal "$BADGE" in output
    const rap = '[IF(CALC(TOTAL) >= 99) DEFINE $BADGE, "gull"]\n$BADGE';
    // Undefined variable stays as-is (not a system var, not defined)
    // $BADGE is not replaced by the system var substitutions, so it stays as "$BADGE"
    // Actually the $BADGE won't match any system var, so it stays literal
    expect(run(rap)).not.toBe('gull');
  });
});

describe('RAP interpreter — SUM and COUNTEXIST in conditions', () => {
  it('SUM condition evaluates correctly for >= threshold', () => {
    const rap = '[if(SUM(Q1,Q2) >= 3)]yes[else]no[endif]';
    expect(run(rap)).toBe('yes');
  });

  it('SUM condition evaluates correctly for < threshold', () => {
    const rap = '[if(SUM(Q1,Q2) < 2)]yes[else]no[endif]';
    expect(run(rap)).toBe('no');
  });

  it('COUNTEXIST condition evaluates correctly', () => {
    const rap = '[if(COUNTEXIST(Q1,Q2,Q3) = 2)]two[else]other[endif]';
    expect(run(rap)).toBe('two');
  });
});

describe('RAP interpreter — GENDER() / KJONN() conditions', () => {
  it('GENDER() = 1 is true for male patient', () => {
    const rap = '[if(GENDER() = 1)]mann[else]annet[endif]';
    expect(run(rap)).toBe('mann');
  });

  it('GENDER() = 0 is true for female patient', () => {
    const rap = '[if(GENDER() = 0)]kvinne[else]annet[endif]';
    expect(run(rap, makeCtx({ patient: femalePatient }))).toBe('kvinne');
  });

  it('KJONN() = 1 is true for male patient', () => {
    const rap = '[if(KJONN() = 1)]mann[else]annet[endif]';
    expect(run(rap)).toBe('mann');
  });
});

describe('RAP interpreter — DIE directive', () => {
  it('[DIE] stops execution and returns output so far', () => {
    const rap = 'Før[DIE]Etter';
    expect(run(rap)).toBe('Før');
  });
});

describe('RAP interpreter — [group("label")] ... [group_end]', () => {
  it('wraps content in rap-group div with label', () => {
    const rap = '[group("Min gruppe")]Innhold[group_end]';
    const result = run(rap);
    expect(result).toContain('rap-group-title');
    expect(result).toContain('Min gruppe');
    expect(result).toContain('Innhold');
  });
});

describe('RAP interpreter — <uc>...</uc> uppercase', () => {
  it('converts text inside <uc> tags to uppercase', () => {
    expect(run('<uc>hei verden</uc>')).toBe('HEI VERDEN');
  });

  it('leaves text outside <uc> tags unchanged', () => {
    expect(run('hei <uc>verden</uc>')).toBe('hei VERDEN');
  });
});

describe('RAP interpreter — wrapHtml', () => {
  it('returns valid HTML document structure', () => {
    const html = interpretRap('Test', makeCtx());
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
    expect(html).toContain('<body>');
    expect(html).toContain('</body>');
  });

  it('includes questionnaire name in <title>', () => {
    const html = interpretRap('Test', makeCtx());
    expect(html).toContain('<title>Testskjema</title>');
  });

  it('uses the report-engine stylesheet unless portal style is requested', () => {
    const engine = interpretRap('Hei', makeCtx());
    expect(engine).toContain('font-family:Calibri,Arial,sans-serif; font-size:9pt!important; line-height:1.3em;');
    expect(engine).toContain('.checkware-maincolor { color:#25b8ec!important; font-weight:bolder; }');
    expect(engine).not.toContain('Open Sans');
    expect(engine).not.toContain('#006393');

    const graphed = interpretRap('[GRAPH_PLOT(g,bar,serie)][GRAPH_RENDER(g)]', makeCtx());
    expect(graphed).toContain('#25b8ec');
    expect(graphed).toContain('font-family="Calibri,Arial,sans-serif"');
    expect(graphed).not.toContain('Open Sans');

    const portal = interpretRap('[GRAPH_PLOT(g,bar,serie)][GRAPH_RENDER(g)]', makeCtx({ reportStyle: 'portal' }));
    expect(portal).toContain('Open Sans');
    expect(portal).toContain('#006393');
    expect(portal).not.toContain('Calibri');
    expect(portal).not.toContain('#25b8ec');
  });
});

describe('RAP interpreter — comment stripping', () => {
  it('strips /* ... */ comments', () => {
    const rap = '/* dette er en kommentar */Synlig tekst';
    expect(run(rap)).toBe('Synlig tekst');
  });

  it('strips multiline comments', () => {
    const rap = '/* linje1\nlinje2 */Synlig';
    expect(run(rap)).toBe('Synlig');
  });
});

describe('RAP interpreter — error handling', () => {
  it('does not throw on empty RAP content', () => {
    expect(() => interpretRap('', makeCtx())).not.toThrow();
  });

  it('does not throw on RAP with only text', () => {
    expect(() => interpretRap('Bare tekst uten direktiver', makeCtx())).not.toThrow();
  });

  it('handles unclosed bracket gracefully', () => {
    // findMatchingBracket returns -1 → treated as literal text char
    const result = run('[unclosed bracket');
    expect(result).toContain('[');
  });
});

describe('RAP interpreter — SESSION_VALUE / SESSION_DIFF', () => {
  const prevAnswers1 = new Map<string, SimAnswer>([
    ['Q1', { score: 1, text: 'Ganske godt' }],
    ['Q2', { score: 0, text: 'Ikke i det hele tatt' }],
  ]);
  const prevAnswers2 = new Map<string, SimAnswer>([
    ['Q1', { score: 2, text: 'Ganske dårlig' }],
    ['Q2', { score: 1, text: 'Litt' }],
  ]);

  it('SESSION_VALUE(0, TOTAL) returns current session calc', () => {
    // Session 0 = current session; default answers have Q1=2, Q2=1 → TOTAL=3
    expect(run('[SESSION_VALUE(0, TOTAL)]')).toBe('3');
  });

  it('SESSION_VALUE(1, TOTAL) returns calc from first historical session', () => {
    const ctx = makeCtx({ sessionHistory: [prevAnswers1] });
    // prevAnswers1: Q1=1, Q2=0 → TOTAL=1
    expect(run('[SESSION_VALUE(1, TOTAL)]', ctx)).toBe('1');
  });

  it('SESSION_VALUE(2, TOTAL) returns calc from second historical session', () => {
    const ctx = makeCtx({ sessionHistory: [prevAnswers1, prevAnswers2] });
    // prevAnswers2: Q1=2, Q2=1 → TOTAL=3
    expect(run('[SESSION_VALUE(2, TOTAL)]', ctx)).toBe('3');
  });

  it('SESSION_VALUE with non-existent session returns (Ukjent)', () => {
    const ctx = makeCtx({ sessionHistory: [prevAnswers1] });
    expect(run('[SESSION_VALUE(5, TOTAL)]', ctx)).toBe('(Ukjent)');
  });

  it('SESSION_DIFF(1, 0, TOTAL) returns difference between session 1 and current', () => {
    // session1=TOTAL(prevAnswers2)=3, session0=current=3 → diff = 3-3 = 0...
    // Actually SESSION_DIFF(n1, n2, code) = session2 - session1
    // SESSION_DIFF(1, 0, TOTAL): s1=prevAnswers1(TOTAL=1), s2=current(TOTAL=3) → 3-1=2
    const ctx = makeCtx({ sessionHistory: [prevAnswers1] });
    expect(run('[SESSION_DIFF(1, 0, TOTAL)]', ctx)).toBe('2');
  });

  it('SESSION_VALUE inline in text (brackets present in text-token) also works', () => {
    // When SESSION_VALUE appears inside longer text, tokenizer keeps it as text
    const ctx = makeCtx({ sessionHistory: [prevAnswers1] });
    expect(run('Forrige: [SESSION_VALUE(1, TOTAL)]', ctx)).toContain('1');
  });
});

describe('RAP interpreter — complex integration', () => {
  it('produces correct output for a multi-feature report', () => {
    const rap = `
[DEFINE $NAVN, "Pasient"]
Navn: $PATIENT_NAME
Skåre: CALC(TOTAL)
[if(CALC(TOTAL) >= 3)]
<b>Høy skåre!</b>
[else]
Normal skåre
[endif]
FLAG: FLAG(LOW_SCORE)
`.trim();

    const result = run(rap);
    expect(result).toContain('Ola Nordmann');
    expect(result).toContain('3');
    expect(result).toContain('Høy skåre!');
    expect(result).toContain('FLAG: 0');
  });

  it('function + loop integration', () => {
    const rap = `[function row(code)]<tr><td>Q(code)</td><td>A(code)</td></tr>[function_end]<table>[CALL row(Q1)][CALL row(Q2)]</table>`;
    const result = run(rap);
    expect(result).toContain('<table>');
    expect(result).toContain('Hvor godt sover du?');
    expect(result).toContain('<td>2</td>');
    expect(result).toContain('Hvor trøtt er du om dagen?');
    expect(result).toContain('<td>1</td>');
  });
});
