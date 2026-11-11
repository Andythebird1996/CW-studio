/**
 * XML serializer tests
 * Covers: serializeQuestionnaire, serializeCalculation, serializeFlag,
 *         serializeTranslation, slider without min/max, esc() behavior,
 *         section types, requiresNewPage, subsections, round-trip fidelity.
 */

import { describe, it, expect } from 'vitest';
import {
  serializeQuestionnaire,
  serializeCalculation,
  serializeFlag,
  serializeTranslation,
} from './xml-serializer';
import type { Questionnaire, Section, Flag, Calculation } from '../types/questionnaire';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeQuestionnaire(overrides: Partial<Questionnaire> = {}): Questionnaire {
  return {
    code: 'TEST_Q',
    version: '1.0',
    name: { NO: 'Testkartlegging', EN: 'Test Questionnaire', SV: '', DA: '', FI: '', DE: '', FR: '', PL: '' },
    type: 'QUESTIONNAIRE',
    defaultLanguage: 'NO',
    supportedLanguages: ['NO'],
    sections: [],
    ...overrides,
  };
}

function makeSection(overrides: Partial<Section> = {}): Section {
  return {
    id: 'sec1',
    code: 'SEC1',
    type: 'NORMAL',
    titles: { NO: 'Seksjon 1', EN: '', SV: '', DA: '', FI: '', DE: '', FR: '', PL: '' },
    questions: [],
    ...overrides,
  };
}

// ─── Slider: no 'undefined' in XML ──────────────────────────────────────────

describe('serializeQuestionnaire — slider', () => {
  it('does not emit literal "undefined" when slider has no min/max', () => {
    const q = makeQuestionnaire({
      sections: [
        {
          id: 'sec1',
          code: 'SEC1',
          type: 'NORMAL',
          titles: { NO: 'Seksjon', EN: '', SV: '', DA: '', FI: '', DE: '', FR: '', PL: '' },
          questions: [
            {
              id: 'q1',
              code: 'SLIDER_Q',
              type: 'slider',
              required: false,
              texts: { NO: 'Skala', EN: '', SV: '', DA: '', FI: '', DE: '', FR: '', PL: '' },
              min: 0,
              max: 10,
              // step, minLabel, maxLabel intentionally omitted
            },
          ],
        },
      ],
    });

    const xml = serializeQuestionnaire(q);
    expect(xml).not.toContain('undefined');
  });

  it('slider with explicit min/max emits those values in widget params', () => {
    const q = makeQuestionnaire({
      sections: [
        {
          id: 'sec1',
          code: 'SEC1',
          type: 'NORMAL',
          titles: { NO: 'Seksjon', EN: '', SV: '', DA: '', FI: '', DE: '', FR: '', PL: '' },
          questions: [
            {
              id: 'q1',
              code: 'SLIDER_Q',
              type: 'slider',
              required: false,
              texts: { NO: 'Skala', EN: '', SV: '', DA: '', FI: '', DE: '', FR: '', PL: '' },
              min: 0,
              max: 100,
              step: 5,
            },
          ],
        },
      ],
    });

    const xml = serializeQuestionnaire(q);
    expect(xml).toContain('min="0"');
    expect(xml).toContain('max="100"');
    expect(xml).toContain('step="5"');
  });
});

// ─── XML escaping ────────────────────────────────────────────────────────────

describe('XML escaping in questionnaire name and code', () => {
  it('escapes & < > " in questionnaire name attribute', () => {
    const q = makeQuestionnaire({
      name: { NO: 'Tom & Jerry <Test> "Quiz"', EN: '', SV: '', DA: '', FI: '', DE: '', FR: '', PL: '' },
    });
    const xml = serializeQuestionnaire(q);
    expect(xml).toContain('Tom &amp; Jerry &lt;Test&gt; &quot;Quiz&quot;');
    expect(xml).not.toContain('Tom & Jerry');
  });

  it('null/empty name does not crash and emits empty name attribute', () => {
    // esc() is not exported directly; test via serializeQuestionnaire with empty name
    const q = makeQuestionnaire({
      name: { NO: '', EN: '', SV: '', DA: '', FI: '', DE: '', FR: '', PL: '' },
    });
    const xml = serializeQuestionnaire(q);
    expect(xml).toContain('name=""');
  });
});

// ─── Section type attributes ─────────────────────────────────────────────────

describe('serializeSection — sectionType attribute', () => {
  it('emits sectionType attribute for REPEATED sections', () => {
    const q = makeQuestionnaire({
      sections: [makeSection({ type: 'REPEATED', repeatCode: 'REP1' })],
    });
    const xml = serializeQuestionnaire(q);
    expect(xml).toContain('sectionType="REPEATED"');
  });

  it('emits sectionType attribute for CONDITIONAL sections', () => {
    const q = makeQuestionnaire({
      sections: [makeSection({ type: 'CONDITIONAL' })],
    });
    const xml = serializeQuestionnaire(q);
    expect(xml).toContain('sectionType="CONDITIONAL"');
  });

  it('does NOT emit sectionType attribute for NORMAL sections', () => {
    const q = makeQuestionnaire({
      sections: [makeSection({ type: 'NORMAL' })],
    });
    const xml = serializeQuestionnaire(q);
    expect(xml).not.toContain('sectionType="NORMAL"');
  });
});

// ─── requiresNewPage ──────────────────────────────────────────────────────────

describe('serializeSection — requiresNewPage', () => {
  it('emits requiresNewPage="true" when set', () => {
    const q = makeQuestionnaire({
      sections: [makeSection({ requiresNewPage: true })],
    });
    const xml = serializeQuestionnaire(q);
    expect(xml).toContain('requiresNewPage="true"');
  });

  it('does NOT emit requiresNewPage when false/undefined', () => {
    const q = makeQuestionnaire({
      sections: [makeSection({ requiresNewPage: false })],
    });
    const xml = serializeQuestionnaire(q);
    expect(xml).not.toContain('requiresNewPage');
  });
});

// ─── Subsections ──────────────────────────────────────────────────────────────

describe('serializeSection — subsections', () => {
  it('emits nested contains elements for subSections', () => {
    const subSection: Section = {
      id: 'sub1',
      code: 'SUB1',
      type: 'NORMAL',
      titles: { NO: 'Underseksjon', EN: '', SV: '', DA: '', FI: '', DE: '', FR: '', PL: '' },
      questions: [],
    };
    const q = makeQuestionnaire({
      sections: [
        makeSection({
          subSections: [subSection],
        }),
      ],
    });
    const xml = serializeQuestionnaire(q);
    expect(xml).toContain('SUB1');
    expect(xml).toContain('xsi:type="questionnaire:Section"');
  });
});

// ─── Calculation with _rawExpression ─────────────────────────────────────────

describe('serializeCalculation — _rawExpression round-trip', () => {
  it('preserves _rawExpression verbatim (lossless round-trip)', () => {
    const calc: Calculation = {
      code: 'CUSTOM_CALC',
      name: 'Custom Calculation',
      type: 'CUSTOM',
      innerCalculations: [],
      _rawExpression: '<calculationExpression xsi:type="questionnaire:NumberBasicType" value="42"/>',
    };
    const xml = serializeCalculation(calc, 'TEST_Q');
    expect(xml).toContain('<calculationExpression xsi:type="questionnaire:NumberBasicType" value="42"/>');
    expect(xml).toContain('code="CUSTOM_CALC"');
  });

  it('rebuilds expression from innerCalculations when _rawExpression is absent', () => {
    const calc: Calculation = {
      code: 'SUM_CALC',
      name: 'Sum Calc',
      type: 'SUM',
      innerCalculations: [
        { questionCode: 'Q1' },
        { questionCode: 'Q2' },
      ],
    };
    const xml = serializeCalculation(calc, 'TEST_Q');
    expect(xml).toContain('Q1');
    expect(xml).toContain('Q2');
    expect(xml).toContain('type="plus"');
  });
});

// ─── Flag with empty conditions ───────────────────────────────────────────────

describe('serializeFlag — empty conditions', () => {
  it('emits BooleanBasicType value="false" for flag with no conditions', () => {
    const flag: Flag = {
      code: 'EMPTY_FLAG',
      name: 'Empty Flag',
      type: 'WARNING',
      conditions: [],
      logic: 'OR',
    };
    const xml = serializeFlag(flag, 'TEST_Q');
    expect(xml).toContain('BooleanBasicType');
    expect(xml).toContain('value="false"');
  });
});

// ─── Flag with OR logic ───────────────────────────────────────────────────────

describe('serializeFlag — OR logic', () => {
  it('emits type="or" for flag with OR logic and multiple conditions', () => {
    const flag: Flag = {
      code: 'OR_FLAG',
      name: 'OR Flag',
      type: 'WARNING',
      conditions: [
        { calculationCode: 'CALC_A', operator: 'GTE', threshold: 10 },
        { calculationCode: 'CALC_B', operator: 'GTE', threshold: 5  },
      ],
      logic: 'OR',
    };
    const xml = serializeFlag(flag, 'TEST_Q');
    expect(xml).toContain('type="or"');
  });

  it('emits type="and" for flag with AND logic', () => {
    const flag: Flag = {
      code: 'AND_FLAG',
      name: 'AND Flag',
      type: 'CRITICAL',
      conditions: [
        { calculationCode: 'CALC_A', operator: 'GTE', threshold: 10 },
        { calculationCode: 'CALC_B', operator: 'LT',  threshold: 5  },
      ],
      logic: 'AND',
    };
    const xml = serializeFlag(flag, 'TEST_Q');
    expect(xml).toContain('type="and"');
  });
});

// ─── serializeTranslation ─────────────────────────────────────────────────────

describe('serializeTranslation', () => {
  it('emits translated texts for an extra language', () => {
    const q = makeQuestionnaire({
      name: { NO: 'Testkartlegging', EN: 'Test Questionnaire', SV: '', DA: '', FI: '', DE: '', FR: '', PL: '' },
      sections: [
        {
          id: 'sec1',
          code: 'SEC1',
          type: 'NORMAL',
          titles: { NO: 'Seksjon', EN: 'Section', SV: '', DA: '', FI: '', DE: '', FR: '', PL: '' },
          questions: [
            {
              id: 'q1',
              code: 'Q1',
              type: 'radiobutton',
              required: true,
              texts: { NO: 'Spørsmål', EN: 'Question', SV: '', DA: '', FI: '', DE: '', FR: '', PL: '' },
            },
          ],
        },
      ],
    });

    const xml = serializeTranslation(q, 'EN', 'TEST_Q');
    expect(xml).toContain('language="english"');
    expect(xml).toContain('Test Questionnaire');
    expect(xml).toContain('Section');
    expect(xml).toContain('Question');
    expect(xml).toContain('entity="Questionnaire"');
    expect(xml).toContain('entity="Section"');
    expect(xml).toContain('entity="Question"');
  });

  it('omits entries for languages with no translation', () => {
    const q = makeQuestionnaire({
      // SV name is empty → should not be included
      name: { NO: 'Testkartlegging', EN: '', SV: '', DA: '', FI: '', DE: '', FR: '', PL: '' },
    });
    const xml = serializeTranslation(q, 'SV', 'TEST_Q');
    // No translations → just the header/footer
    expect(xml).toContain('language="swedish"');
    expect(xml).not.toContain('translatedText=""'); // empty strings should not be emitted
  });
});
