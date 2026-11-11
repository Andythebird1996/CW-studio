/**
 * Unit tests covering recent changes:
 *  1. translate-api Array.isArray guard
 *  2. reverseValue field on TextOption type
 *  3. validate-questionnaire with/without description
 *  4. TextElement type narrowing via q.type === 'text'
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { autoTranslate } from './translate-api';
import { validateQuestionnaire } from './validate-questionnaire';
import type {
  Questionnaire,
  Section,
  Question,
  TextOption,
  TextElement,
} from '../types/questionnaire';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSection(overrides: Partial<Section> = {}): Section {
  return {
    id: 'sec1',
    code: 'SEC1',
    type: 'NORMAL',
    titles: { NO: 'Seksjon', EN: '', SV: '', DA: '', FI: '', DE: '', FR: '', PL: '' },
    questions: [],
    ...overrides,
  };
}

function makeQuestionnaire(overrides: Partial<Questionnaire> = {}): Questionnaire {
  return {
    code: 'TEST',
    version: '1.0',
    name: { NO: 'Test', EN: '', SV: '', DA: '', FI: '', DE: '', FR: '', PL: '' },
    type: 'QUESTIONNAIRE',
    defaultLanguage: 'NO',
    supportedLanguages: ['NO'],
    sections: [makeSection()],
    ...overrides,
  };
}

// ─── 1. translate-api: Array.isArray guard ────────────────────────────────────

describe('autoTranslate — Array.isArray guard', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockFetch(status: number, body: unknown) {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(text),
    });
  }

  it('returns translations array on a valid response', async () => {
    mockFetch(200, { translations: ['Hei', 'Verden'] });
    const result = await autoTranslate(['Hello', 'World'], 'en', 'no');
    expect(result).toEqual(['Hei', 'Verden']);
  });

  it('throws when translations field is null (not an array)', async () => {
    mockFetch(200, { translations: null });
    await expect(autoTranslate(['Hello'], 'en', 'no')).rejects.toThrow(
      /Uventet svar fra oversettelsestjeneste/,
    );
  });

  it('throws when translations field is a string instead of array', async () => {
    mockFetch(200, { translations: 'bare en streng' });
    await expect(autoTranslate(['Hello'], 'en', 'no')).rejects.toThrow(
      /Uventet svar fra oversettelsestjeneste/,
    );
  });

  it('throws when translations field is an object (not an array)', async () => {
    mockFetch(200, { translations: { 0: 'Hei' } });
    await expect(autoTranslate(['Hello'], 'en', 'no')).rejects.toThrow(
      /Uventet svar fra oversettelsestjeneste/,
    );
  });

  it('throws when translations field is missing from response', async () => {
    mockFetch(200, { result: ['Hei'] });
    await expect(autoTranslate(['Hello'], 'en', 'no')).rejects.toThrow(
      /Uventet svar fra oversettelsestjeneste/,
    );
  });

  it('throws when response body is not valid JSON', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('dette er ikke json{{'),
    });
    await expect(autoTranslate(['Hello'], 'en', 'no')).rejects.toThrow(
      /Ugyldig svar fra server/,
    );
  });

  it('throws HTTP error message when server returns non-2xx with JSON error field', async () => {
    mockFetch(500, { error: 'Internal server error' });
    await expect(autoTranslate(['Hello'], 'en', 'no')).rejects.toThrow(
      'Internal server error',
    );
  });

  it('throws generic HTTP status when server returns non-2xx without error field', async () => {
    mockFetch(503, {});
    await expect(autoTranslate(['Hello'], 'en', 'no')).rejects.toThrow('HTTP 503');
  });
});

// ─── 2. reverseValue on TextOption ───────────────────────────────────────────
//
// The serializer/parser do not currently round-trip reverseValue through XML
// (it is not emitted as an XML attribute on <option>). These tests verify that:
//   a) The TypeScript type accepts reverseValue on TextOption without error.
//   b) A TextOption with reverseValue: true retains the value at the TS level.
//   c) An option without reverseValue has the field as undefined (not false).

describe('TextOption — reverseValue field', () => {
  it('accepts reverseValue: true and preserves the value', () => {
    const opt: TextOption = {
      code: 'OPT1',
      score: 1,
      reverseValue: true,
      texts: { NO: 'Aldri', EN: 'Never', SV: '', DA: '', FI: '', DE: '', FR: '', PL: '' },
    };

    expect(opt.reverseValue).toBe(true);
  });

  it('accepts reverseValue: false', () => {
    const opt: TextOption = {
      code: 'OPT2',
      score: 0,
      reverseValue: false,
      texts: { NO: 'Alltid', EN: 'Always', SV: '', DA: '', FI: '', DE: '', FR: '', PL: '' },
    };

    expect(opt.reverseValue).toBe(false);
  });

  it('has reverseValue as undefined when not set', () => {
    const opt: TextOption = {
      code: 'OPT3',
      score: 2,
      texts: { NO: 'Noen ganger', EN: 'Sometimes', SV: '', DA: '', FI: '', DE: '', FR: '', PL: '' },
    };

    expect(opt.reverseValue).toBeUndefined();
  });

  it('distinguishes reversed and non-reversed options in a list', () => {
    const options: TextOption[] = [
      { code: 'A', score: 0, reverseValue: true, texts: { NO: 'Aldri', EN: '', SV: '', DA: '', FI: '', DE: '', FR: '', PL: '' } },
      { code: 'B', score: 1, texts: { NO: 'Alltid', EN: '', SV: '', DA: '', FI: '', DE: '', FR: '', PL: '' } },
    ];

    const reversed = options.filter((o) => o.reverseValue === true);
    const normal = options.filter((o) => !o.reverseValue);

    expect(reversed).toHaveLength(1);
    expect(reversed[0].code).toBe('A');
    expect(normal).toHaveLength(1);
    expect(normal[0].code).toBe('B');
  });
});

// ─── 3. validateQuestionnaire — description field ─────────────────────────────
//
// The Questionnaire type has an optional `description` field. The validator
// does not enforce its presence (validation is purely informational and focuses
// on codes and texts). These tests confirm that questionnaires with and without
// descriptions are processed without unexpected errors or false issues.

describe('validateQuestionnaire — description field', () => {
  it('returns no issues for a valid questionnaire without description', () => {
    const q = makeQuestionnaire();
    const issues = validateQuestionnaire(q);
    expect(issues).toHaveLength(0);
  });

  it('returns no issues for a valid questionnaire with a description', () => {
    const q = makeQuestionnaire({
      description: { NO: 'Beskrivelse av kartleggingen', EN: 'Description of the assessment', SV: '', DA: '', FI: '', DE: '', FR: '', PL: '' },
    });
    const issues = validateQuestionnaire(q);
    expect(issues).toHaveLength(0);
  });

  it('returns no issues when description is an empty record', () => {
    const q = makeQuestionnaire({
      description: { NO: '', EN: '', SV: '', DA: '', FI: '', DE: '', FR: '', PL: '' },
    });
    const issues = validateQuestionnaire(q);
    expect(issues).toHaveLength(0);
  });

  it('still catches missing section code regardless of description presence', () => {
    const q = makeQuestionnaire({
      description: { NO: 'Har beskrivelse', EN: '', SV: '', DA: '', FI: '', DE: '', FR: '', PL: '' },
      sections: [makeSection({ code: '' })],
    });
    const issues = validateQuestionnaire(q);
    const errors = issues.filter((i) => i.severity === 'error');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toMatch(/missing a code/i);
  });

  it('still catches missing question code regardless of description presence', () => {
    const q = makeQuestionnaire({
      description: { NO: 'Beskrivelse', EN: '', SV: '', DA: '', FI: '', DE: '', FR: '', PL: '' },
      sections: [
        makeSection({
          questions: [
            {
              id: 'q1',
              code: '',
              required: false,
              texts: { NO: 'Spørsmål', EN: '', SV: '', DA: '', FI: '', DE: '', FR: '', PL: '' },
              type: 'radiobutton',
            },
          ],
        }),
      ],
    });
    const issues = validateQuestionnaire(q);
    const errors = issues.filter((i) => i.severity === 'error');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toMatch(/missing a code/i);
  });
});

// ─── 4. TextElement type narrowing — q.type === 'text' ───────────────────────

describe('Question type narrowing — TextElement', () => {
  it('identifies a text element via type guard q.type === "text"', () => {
    const q: Question = {
      id: 'el1',
      code: 'INTRO',
      required: false,
      texts: { NO: 'Introduksjonstekst', EN: '', SV: '', DA: '', FI: '', DE: '', FR: '', PL: '' },
      type: 'text',
      isQuestion: false,
    };

    expect(q.type === 'text').toBe(true);

    // TypeScript narrows after the guard — verify TextElement-specific field
    if (q.type === 'text') {
      const textEl: TextElement = q;
      expect(textEl.isQuestion).toBe(false);
    }
  });

  it('does not match non-text questions with the text type guard', () => {
    const questions: Question[] = [
      {
        id: 'r1',
        code: 'Q1',
        required: false,
        texts: { NO: 'Radio', EN: '', SV: '', DA: '', FI: '', DE: '', FR: '', PL: '' },
        type: 'radiobutton',
      },
      {
        id: 'c1',
        code: 'Q2',
        required: false,
        texts: { NO: 'Checkbox', EN: '', SV: '', DA: '', FI: '', DE: '', FR: '', PL: '' },
        type: 'checkbox',
        multiple: true,
      },
      {
        id: 'el1',
        code: 'EL1',
        required: false,
        texts: { NO: 'Tekst', EN: '', SV: '', DA: '', FI: '', DE: '', FR: '', PL: '' },
        type: 'text',
        isQuestion: false,
      },
    ];

    const textElements = questions.filter((q) => q.type === 'text');
    const nonTextQuestions = questions.filter((q) => q.type !== 'text');

    expect(textElements).toHaveLength(1);
    expect(textElements[0].code).toBe('EL1');
    expect(nonTextQuestions).toHaveLength(2);
  });

  it('contentStyle is accessible after type narrowing', () => {
    const q: Question = {
      id: 'el2',
      code: 'BOLD1',
      required: false,
      texts: { NO: 'Fet tekst', EN: '', SV: '', DA: '', FI: '', DE: '', FR: '', PL: '' },
      type: 'text',
      isQuestion: false,
      contentStyle: 'bold',
    };

    if (q.type === 'text') {
      expect(q.contentStyle).toBe('bold');
    } else {
      // Should not reach here
      expect(true).toBe(false);
    }
  });
});
