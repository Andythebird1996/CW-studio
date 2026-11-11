import { describe, it, expect } from 'vitest';
import { validateQuestionnaire } from './validate-questionnaire';
import type {
  Questionnaire,
  Section,
  Question,
  ResponseTemplate,
  TextOption,
  Calculation,
  Flag,
  InnerCalculation,
  FlagCondition,
} from '../types/questionnaire';

// ── Factory helpers ───────────────────────────────────────────────────────────

function makeTexts(text = 'Some text'): Record<string, string> {
  return { NO: text } as Record<string, string>;
}

function makeEmptyTexts(): Record<string, string> {
  return { NO: '' } as Record<string, string>;
}

function makeQuestion(
  id: string,
  code: string,
  overrides: Partial<Question> = {},
): Question {
  return {
    id,
    code,
    required: false,
    texts: makeTexts('Question text'),
    type: 'radiobutton',
    ...overrides,
  } as Question;
}

function makeTextElement(id: string, code: string): Question {
  return {
    id,
    code,
    required: false,
    texts: makeTexts('Text content'),
    type: 'text',
    isQuestion: false,
  } as Question;
}

function makeSection(
  id: string,
  code: string,
  questions: Question[] = [],
  subSections?: Section[],
  titleText = 'Section title',
): Section {
  return {
    id,
    code,
    type: 'NORMAL',
    titles: makeTexts(titleText),
    questions,
    ...(subSections !== undefined ? { subSections } : {}),
  } as Section;
}

function makeOption(code: string, text = 'Option text'): TextOption {
  return {
    code,
    texts: makeTexts(text),
  };
}

function makeTemplate(
  code: string,
  options: TextOption[] = [],
  name = 'Template',
): ResponseTemplate {
  return { code, name, options };
}

function makeCalculation(
  code: string,
  name: string,
  innerCalculations: InnerCalculation[] = [],
): Calculation {
  return {
    code,
    name,
    type: 'SUM',
    innerCalculations,
  };
}

function makeFlag(
  code: string,
  name: string,
  conditions: FlagCondition[] = [],
): Flag {
  return {
    code,
    name,
    type: 'WARNING',
    conditions,
    logic: 'AND',
  };
}

function makeQuestionnaire(
  overrides: Partial<Questionnaire> = {},
): Questionnaire {
  return {
    code: 'TEST',
    version: '1.0',
    name: makeTexts('Test questionnaire'),
    type: 'QUESTIONNAIRE',
    defaultLanguage: 'NO',
    supportedLanguages: ['NO'],
    sections: [],
    ...overrides,
  } as Questionnaire;
}

// ── Tests: validateQuestionnaire ──────────────────────────────────────────────

describe('validateQuestionnaire', () => {
  it('valid questionnaire with codes everywhere and no duplicates → empty array', () => {
    const q = makeQuestionnaire({
      sections: [
        makeSection('s1', 'S1', [makeQuestion('q1', 'Q1')]),
      ],
      responseTemplates: {
        templates: [makeTemplate('QT1', [makeOption('QT1-O1')])],
      },
    });
    const issues = validateQuestionnaire(q);
    expect(issues).toHaveLength(0);
  });

  it('question missing code → error with severity "error"', () => {
    const q = makeQuestionnaire({
      sections: [makeSection('s1', 'S1', [makeQuestion('q1', '')])],
    });
    const issues = validateQuestionnaire(q);
    const errors = issues.filter((i) => i.severity === 'error');
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors.some((e) => e.message.includes('missing a code') && !e.message.includes('Section'))).toBe(true);
  });

  it('section missing code → error', () => {
    const q = makeQuestionnaire({
      sections: [makeSection('s1', '', [makeQuestion('q1', 'Q1')])],
    });
    const issues = validateQuestionnaire(q);
    expect(issues.some((i) => i.severity === 'error' && i.message.includes('Section is missing a code'))).toBe(true);
  });

  it('text element missing code → error', () => {
    const q = makeQuestionnaire({
      sections: [makeSection('s1', 'S1', [makeTextElement('t1', '')])],
    });
    const issues = validateQuestionnaire(q);
    expect(issues.some((i) => i.severity === 'error' && i.message.includes('Text element is missing a code'))).toBe(true);
  });

  it('response template missing code → error', () => {
    const q = makeQuestionnaire({
      sections: [makeSection('s1', 'S1', [makeQuestion('q1', 'Q1')])],
      responseTemplates: {
        templates: [makeTemplate('', [makeOption('O1')])],
      },
    });
    const issues = validateQuestionnaire(q);
    expect(issues.some((i) => i.severity === 'error' && i.message.includes('Response template is missing a code'))).toBe(true);
  });

  it('option inside template missing code → error', () => {
    const q = makeQuestionnaire({
      sections: [makeSection('s1', 'S1', [makeQuestion('q1', 'Q1')])],
      responseTemplates: {
        templates: [makeTemplate('QT1', [makeOption('')])],
      },
    });
    const issues = validateQuestionnaire(q);
    expect(issues.some((i) => i.severity === 'error' && i.message.includes('missing a code'))).toBe(true);
  });

  it('duplicate question codes (two questions with Q1) → error about duplicate', () => {
    const q = makeQuestionnaire({
      sections: [
        makeSection('s1', 'S1', [
          makeQuestion('q1', 'Q1'),
          makeQuestion('q2', 'Q1'),
        ]),
      ],
    });
    const issues = validateQuestionnaire(q);
    expect(
      issues.some(
        (i) =>
          i.severity === 'error' &&
          i.message.includes('Duplicate code') &&
          i.message.includes('"Q1"'),
      ),
    ).toBe(true);
  });

  it('duplicate codes across section and subsection → detected', () => {
    const sub = makeSection('sub1', 'S2', [makeQuestion('q2', 'Q1')]);
    const q = makeQuestionnaire({
      sections: [makeSection('s1', 'S1', [makeQuestion('q1', 'Q1')], [sub])],
    });
    const issues = validateQuestionnaire(q);
    expect(
      issues.some(
        (i) =>
          i.severity === 'error' &&
          i.message.includes('Duplicate code') &&
          i.message.includes('"Q1"'),
      ),
    ).toBe(true);
  });

  it('section without title (all languages empty) → warning', () => {
    const section: Section = {
      id: 's1',
      code: 'S1',
      type: 'NORMAL',
      titles: makeEmptyTexts(),
      questions: [makeQuestion('q1', 'Q1')],
    };
    const q = makeQuestionnaire({ sections: [section] });
    const issues = validateQuestionnaire(q);
    expect(
      issues.some(
        (i) => i.severity === 'warning' && i.message.includes('Section has no title'),
      ),
    ).toBe(true);
  });

  it('question without text (all languages empty) → warning', () => {
    const question = makeQuestion('q1', 'Q1', { texts: makeEmptyTexts() });
    const q = makeQuestionnaire({
      sections: [makeSection('s1', 'S1', [question])],
    });
    const issues = validateQuestionnaire(q);
    expect(
      issues.some(
        (i) => i.severity === 'warning' && i.message.includes('Question has no text'),
      ),
    ).toBe(true);
  });

  it('calculation references non-existent question code → warning', () => {
    const q = makeQuestionnaire({
      sections: [makeSection('s1', 'S1', [makeQuestion('q1', 'Q1')])],
      calculations: {
        calculations: [
          makeCalculation('CALC1', 'Calc 1', [
            { questionCode: 'NON_EXISTENT', operator: 'ADD' },
          ]),
        ],
        norms: [],
      },
    });
    const issues = validateQuestionnaire(q);
    expect(
      issues.some(
        (i) =>
          i.severity === 'warning' &&
          i.message.includes('"NON_EXISTENT"') &&
          i.message.includes('does not exist'),
      ),
    ).toBe(true);
  });

  it('flag references non-existent calculation code → warning', () => {
    const q = makeQuestionnaire({
      sections: [makeSection('s1', 'S1', [makeQuestion('q1', 'Q1')])],
      calculations: {
        calculations: [],
        norms: [],
      },
      flags: [
        makeFlag('F1', 'Flag 1', [
          { calculationCode: 'MISSING_CALC', operator: 'GT', threshold: 10 },
        ]),
      ],
    });
    const issues = validateQuestionnaire(q);
    expect(
      issues.some(
        (i) =>
          i.severity === 'warning' &&
          i.message.includes('"MISSING_CALC"') &&
          i.message.includes('does not exist'),
      ),
    ).toBe(true);
  });

  it('errors are sorted before warnings in the result list', () => {
    // Section code missing (error) + section no title (warning)
    const section: Section = {
      id: 's1',
      code: '',
      type: 'NORMAL',
      titles: makeEmptyTexts(),
      questions: [],
    };
    const q = makeQuestionnaire({ sections: [section] });
    const issues = validateQuestionnaire(q);
    expect(issues.length).toBeGreaterThanOrEqual(2);
    const firstError = issues.findIndex((i) => i.severity === 'error');
    const firstWarning = issues.findIndex((i) => i.severity === 'warning');
    expect(firstError).toBeLessThan(firstWarning);
  });

  it('questionnaire with only warnings → no errors', () => {
    // Valid codes everywhere, but section title and question text are empty
    const question = makeQuestion('q1', 'Q1', { texts: makeEmptyTexts() });
    const section: Section = {
      id: 's1',
      code: 'S1',
      type: 'NORMAL',
      titles: makeEmptyTexts(),
      questions: [question],
    };
    const q = makeQuestionnaire({ sections: [section] });
    const issues = validateQuestionnaire(q);
    expect(issues.every((i) => i.severity === 'warning')).toBe(true);
    expect(issues.length).toBeGreaterThanOrEqual(1);
  });

  it('path field contains section index and question index', () => {
    const q = makeQuestionnaire({
      sections: [
        makeSection('s1', 'S1', [
          makeQuestion('q1', 'Q1'),
          makeQuestion('q2', ''), // missing code at index 1
        ]),
      ],
    });
    const issues = validateQuestionnaire(q);
    const missingCodeIssue = issues.find(
      (i) => i.severity === 'error' && i.message.includes('missing a code'),
    );
    expect(missingCodeIssue).toBeDefined();
    expect(missingCodeIssue!.path).toContain('sections[0]');
    expect(missingCodeIssue!.path).toContain('questions[1]');
  });

  it('elementLabel is a meaningful non-empty string', () => {
    const q = makeQuestionnaire({
      sections: [makeSection('s1', '', [makeQuestion('q1', 'Q1')])],
    });
    const issues = validateQuestionnaire(q);
    expect(issues.length).toBeGreaterThan(0);
    for (const issue of issues) {
      expect(typeof issue.elementLabel).toBe('string');
      expect(issue.elementLabel.length).toBeGreaterThan(0);
    }
  });

  it('mix of errors and warnings: 3 errors + 2 warnings → 5 issues total', () => {
    // Produce 3 errors: 2 missing question codes + 1 missing section code
    // Produce 2 warnings: section no title + question no text
    const sectionNoCode: Section = {
      id: 's1',
      code: '',               // error 1: section missing code
      type: 'NORMAL',
      titles: makeEmptyTexts(), // warning 1: section no title
      questions: [
        makeQuestion('q1', ''),  // error 2: question missing code (also warning: no text skipped because code issue takes precedence, but texts are set)
        makeQuestion('q2', ''),  // error 3: question missing code
        makeQuestion('q3', 'Q3', { texts: makeEmptyTexts() }), // warning 2: question no text
      ],
    };
    const q = makeQuestionnaire({ sections: [sectionNoCode] });
    const issues = validateQuestionnaire(q);
    const errors = issues.filter((i) => i.severity === 'error');
    const warnings = issues.filter((i) => i.severity === 'warning');
    expect(errors).toHaveLength(3);
    expect(warnings).toHaveLength(2);
    expect(issues).toHaveLength(5);
  });
});
