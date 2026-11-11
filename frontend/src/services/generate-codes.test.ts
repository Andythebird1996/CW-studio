import { describe, it, expect } from 'vitest';
import { generateCodes } from './generate-codes';
import type {
  Questionnaire,
  Section,
  Question,
  ResponseTemplate,
  TextOption,
} from '../types/questionnaire';

// ── Factory helpers ───────────────────────────────────────────────────────────

function makeTexts(text = ''): Record<string, string> {
  return { NO: text } as Record<string, string>;
}

function makeQuestion(
  id: string,
  overrides: Partial<Question> = {},
): Question {
  return {
    id,
    code: '',
    required: false,
    texts: makeTexts('Question text'),
    type: 'radiobutton',
    ...overrides,
  } as Question;
}

function makeTextElement(id: string): Question {
  return {
    id,
    code: '',
    required: false,
    texts: makeTexts('Some text'),
    type: 'text',
    isQuestion: false,
  } as Question;
}

function makeSection(
  id: string,
  questions: Question[] = [],
  subSections?: Section[],
  code = '',
): Section {
  return {
    id,
    code,
    type: 'NORMAL',
    titles: makeTexts('Section title'),
    questions,
    ...(subSections !== undefined ? { subSections } : {}),
  } as Section;
}

function makeTemplate(id: string, options: TextOption[] = []): ResponseTemplate {
  return {
    code: '',
    name: `Template ${id}`,
    options,
  };
}

function makeOption(id: string, code = ''): TextOption {
  return {
    code,
    texts: makeTexts(`Option ${id}`),
  };
}

function makeQuestionnaire(
  overrides: Partial<Questionnaire> = {},
): Questionnaire {
  return {
    code: 'TEST',
    version: '1.0',
    name: makeTexts('Test'),
    type: 'QUESTIONNAIRE',
    defaultLanguage: 'NO',
    supportedLanguages: ['NO'],
    sections: [],
    ...overrides,
  } as Questionnaire;
}

// ── Tests: overwrite mode (overwrite: true) ───────────────────────────────────

describe('generateCodes — overwrite: true', () => {
  it('empty questionnaire returns unchanged, count=0', () => {
    const q = makeQuestionnaire();
    const { questionnaire, count } = generateCodes(q, { overwrite: true });
    expect(questionnaire.sections).toHaveLength(0);
    expect(count).toBe(0);
  });

  it('one section with one question → S1, Q1', () => {
    const q = makeQuestionnaire({
      sections: [makeSection('s1', [makeQuestion('q1')])],
    });
    const { questionnaire } = generateCodes(q, { overwrite: true });
    expect(questionnaire.sections[0].code).toBe('S1');
    expect(questionnaire.sections[0].questions[0].code).toBe('Q1');
  });

  it('two sections with 3+2 questions → S1/S2, Q1–Q5 (global counters)', () => {
    const q = makeQuestionnaire({
      sections: [
        makeSection('s1', [makeQuestion('q1'), makeQuestion('q2'), makeQuestion('q3')]),
        makeSection('s2', [makeQuestion('q4'), makeQuestion('q5')]),
      ],
    });
    const { questionnaire } = generateCodes(q, { overwrite: true });
    expect(questionnaire.sections[0].code).toBe('S1');
    expect(questionnaire.sections[1].code).toBe('S2');
    expect(questionnaire.sections[0].questions.map((x) => x.code)).toEqual(['Q1', 'Q2', 'Q3']);
    expect(questionnaire.sections[1].questions.map((x) => x.code)).toEqual(['Q4', 'Q5']);
  });

  it('text element → T1 (not Q)', () => {
    const q = makeQuestionnaire({
      sections: [makeSection('s1', [makeTextElement('t1')])],
    });
    const { questionnaire } = generateCodes(q, { overwrite: true });
    expect(questionnaire.sections[0].questions[0].code).toBe('T1');
  });

  it('mix of questions and text elements → Q and T counted separately', () => {
    const q = makeQuestionnaire({
      sections: [
        makeSection('s1', [
          makeQuestion('q1'),
          makeTextElement('t1'),
          makeQuestion('q2'),
          makeTextElement('t2'),
        ]),
      ],
    });
    const { questionnaire } = generateCodes(q, { overwrite: true });
    const qs = questionnaire.sections[0].questions;
    expect(qs[0].code).toBe('Q1');
    expect(qs[1].code).toBe('T1');
    expect(qs[2].code).toBe('Q2');
    expect(qs[3].code).toBe('T2');
  });

  it('response template → QT1, options get QT1-O1/QT1-O2', () => {
    const q = makeQuestionnaire({
      responseTemplates: {
        templates: [makeTemplate('tpl1', [makeOption('o1'), makeOption('o2')])],
      },
    });
    const { questionnaire } = generateCodes(q, { overwrite: true });
    const tpl = questionnaire.responseTemplates!.templates[0];
    expect(tpl.code).toBe('QT1');
    expect(tpl.options[0].code).toBe('QT1-O1');
    expect(tpl.options[1].code).toBe('QT1-O2');
  });

  it('two templates → QT1/QT2 with correct option prefixes', () => {
    const q = makeQuestionnaire({
      responseTemplates: {
        templates: [
          makeTemplate('tpl1', [makeOption('o1'), makeOption('o2')]),
          makeTemplate('tpl2', [makeOption('o3')]),
        ],
      },
    });
    const { questionnaire } = generateCodes(q, { overwrite: true });
    const tpls = questionnaire.responseTemplates!.templates;
    expect(tpls[0].code).toBe('QT1');
    expect(tpls[0].options.map((o) => o.code)).toEqual(['QT1-O1', 'QT1-O2']);
    expect(tpls[1].code).toBe('QT2');
    expect(tpls[1].options[0].code).toBe('QT2-O1');
  });

  it('overwrites existing codes', () => {
    const q = makeQuestionnaire({
      sections: [makeSection('s1', [makeQuestion('q1')], undefined, 'OLD_SECTION')],
    });
    q.sections[0].questions[0] = { ...q.sections[0].questions[0], code: 'OLD_Q' };
    const { questionnaire, count, skipped } = generateCodes(q, { overwrite: true });
    expect(questionnaire.sections[0].code).toBe('S1');
    expect(questionnaire.sections[0].questions[0].code).toBe('Q1');
    expect(count).toBe(2);
    expect(skipped).toBe(0);
  });

  it('subsection → counters continue globally: S1/S2, Q1/Q2', () => {
    const sub = makeSection('sub1', [makeQuestion('q2')]);
    const q = makeQuestionnaire({
      sections: [makeSection('s1', [makeQuestion('q1')], [sub])],
    });
    const { questionnaire } = generateCodes(q, { overwrite: true });
    const s1 = questionnaire.sections[0];
    expect(s1.code).toBe('S1');
    expect(s1.questions[0].code).toBe('Q1');
    const sub1 = s1.subSections![0];
    expect(sub1.code).toBe('S2');
    expect(sub1.questions[0].code).toBe('Q2');
  });

  it('function is immutable — original is not mutated', () => {
    const original = makeQuestionnaire({
      sections: [makeSection('s1', [makeQuestion('q1')])],
    });
    const origSectionCode = original.sections[0].code;
    const origQuestionCode = original.sections[0].questions[0].code;
    generateCodes(original, { overwrite: true });
    expect(original.sections[0].code).toBe(origSectionCode);
    expect(original.sections[0].questions[0].code).toBe(origQuestionCode);
  });

  it('count matches total codes written', () => {
    const q = makeQuestionnaire({
      sections: [
        makeSection('s1', [makeQuestion('q1'), makeQuestion('q2')]),
        makeSection('s2', [makeQuestion('q3')]),
      ],
    });
    const { count } = generateCodes(q, { overwrite: true });
    expect(count).toBe(5); // 2 sections + 3 questions
  });
});

// ── Tests: fill-only mode (default / overwrite: false) ────────────────────────

describe('generateCodes — fill-only (default)', () => {
  it('empty questionnaire unchanged, count=0, skipped=0', () => {
    const q = makeQuestionnaire();
    const { count, skipped } = generateCodes(q);
    expect(count).toBe(0);
    expect(skipped).toBe(0);
  });

  it('fills empty codes, does NOT overwrite existing ones', () => {
    const q = makeQuestionnaire({
      sections: [
        makeSection('s1', [makeQuestion('q1', { code: 'MYCODE' }), makeQuestion('q2')], undefined, 'MYSECT'),
      ],
    });
    const { questionnaire, count, skipped } = generateCodes(q);
    expect(questionnaire.sections[0].code).toBe('MYSECT');   // kept
    expect(questionnaire.sections[0].questions[0].code).toBe('MYCODE'); // kept
    expect(questionnaire.sections[0].questions[1].code).toBe('Q1');     // filled
    expect(skipped).toBe(2); // MYSECT + MYCODE
    expect(count).toBe(1);   // Q1
  });

  it('skips counter values already occupied by existing codes', () => {
    // Q1 and Q2 already exist → next generated code should be Q3
    const q = makeQuestionnaire({
      sections: [
        makeSection('s1', [
          makeQuestion('a', { code: 'Q1' }),
          makeQuestion('b', { code: 'Q2' }),
          makeQuestion('c'),            // empty — should get Q3
        ]),
      ],
    });
    const { questionnaire } = generateCodes(q);
    expect(questionnaire.sections[0].questions[2].code).toBe('Q3');
  });

  it('skips S1 if already taken, assigns S2', () => {
    const q = makeQuestionnaire({
      sections: [
        makeSection('s1', [], undefined, 'S1'), // occupied
        makeSection('s2', []),                  // empty → should get S2
      ],
    });
    const { questionnaire } = generateCodes(q);
    expect(questionnaire.sections[0].code).toBe('S1'); // kept
    expect(questionnaire.sections[1].code).toBe('S2'); // filled, S2 not taken
  });

  it('skips S1 and S2 if both taken, assigns S3', () => {
    const q = makeQuestionnaire({
      sections: [
        makeSection('s1', [], undefined, 'S1'),
        makeSection('s2', [], undefined, 'S2'),
        makeSection('s3', []),
      ],
    });
    const { questionnaire } = generateCodes(q);
    expect(questionnaire.sections[2].code).toBe('S3');
  });

  it('fills empty template code but keeps options with existing codes', () => {
    const q = makeQuestionnaire({
      responseTemplates: {
        templates: [
          makeTemplate('t1', [
            makeOption('o1', 'QT1-O1'), // existing
            makeOption('o2'),           // empty
          ]),
        ],
      },
    });
    const { questionnaire } = generateCodes(q);
    const tpl = questionnaire.responseTemplates!.templates[0];
    expect(tpl.code).toBe('QT1');
    expect(tpl.options[0].code).toBe('QT1-O1'); // kept
    expect(tpl.options[1].code).toBe('QT1-O2'); // filled
  });

  it('result.count counts only written, result.skipped counts kept', () => {
    const q = makeQuestionnaire({
      sections: [
        makeSection('s1', [
          makeQuestion('q1', { code: 'EXISTING' }),
          makeQuestion('q2'),
        ], undefined, 'S_EXISTING'),
      ],
    });
    const { count, skipped } = generateCodes(q);
    expect(count).toBe(1);   // only the empty question gets a new code
    expect(skipped).toBe(2); // S_EXISTING + EXISTING both kept
  });

  it('is immutable — original not mutated', () => {
    const original = makeQuestionnaire({
      sections: [makeSection('s1', [makeQuestion('q1')])],
    });
    const origSectionCode = original.sections[0].code;
    generateCodes(original);
    expect(original.sections[0].code).toBe(origSectionCode);
  });

  it('all codes already set → count=0, skipped=all', () => {
    const q = makeQuestionnaire({
      sections: [
        makeSection('s1', [makeQuestion('q1', { code: 'Q1' })], undefined, 'S1'),
      ],
    });
    const { count, skipped } = generateCodes(q);
    expect(count).toBe(0);
    expect(skipped).toBe(2);
  });
});
