/**
 * Tests for import logic extracted from ImportTextDialog and ImportNormDialog.
 * Pure functions only — no React rendering, no Radix UI.
 */

import { describe, it, expect } from 'vitest';
import type { Section, RadiobuttonQuestion, LanguageType } from '../../types/questionnaire';

// ─── Re-implementations of dialog logic as pure functions ─────────────────────

type SeparatorType = 'newline' | 'double-newline' | 'custom';

function resolveSeparator(type: SeparatorType, custom: string): string {
  if (type === 'newline') return '\n';
  if (type === 'double-newline') return '\n\n';
  return custom || '\n';
}

function importTextToSection(
  text: string,
  separator: SeparatorType,
  customSeparator: string,
  templateCode?: string,
  mandatory?: boolean,
  readonly?: boolean,
  reversedScore?: boolean,
  defaultLanguage: LanguageType = 'NO',
): Section | null {
  const sep = resolveSeparator(separator, customSeparator);
  const lines = text
    .split(sep)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return null;

  const required = mandatory ?? false;
  const ro = readonly ?? false;
  const rev = reversedScore ?? false;

  const questions: RadiobuttonQuestion[] = lines.map((line) => {
    const q: RadiobuttonQuestion = {
      id: crypto.randomUUID(),
      code: '',
      type: 'radiobutton',
      texts: { [defaultLanguage]: line } as Record<LanguageType, string>,
      required,
      readonly: ro,
      reversedScore: rev,
      options: [],
    };
    if (templateCode) q.responseTemplateCode = templateCode;
    return q;
  });

  const newSection: Section = {
    id: crypto.randomUUID(),
    code: '',
    type: 'NORMAL',
    titles: { [defaultLanguage]: '' } as Record<LanguageType, string>,
    questions,
  };

  return newSection;
}

// ─── NormDataRow type (matches inline type from ImportNormDialog) ──────────────

type NormDataRow = { score: number; normValue: number; age?: number; gender?: string };
type NormType = 'NORM' | 'PERCENTILE' | 'ZSCORE';
type SepType = 'tab' | 'semicolon';

interface ParseResult {
  rows: NormDataRow[];
  errors: string[];
}

function parseNormRows(
  raw: string,
  separator: SepType,
  hasHeader: boolean,
  normType: NormType,
): ParseResult {
  const sepChar = separator === 'tab' ? '\t' : ';';
  const errors: string[] = [];
  const rows: NormDataRow[] = [];

  const lines = raw
    .split('\n')
    .map((l) => l.trimEnd())
    .filter(Boolean);

  const startIdx = hasHeader && lines.length > 0 ? 1 : 0;

  for (let i = startIdx; i < lines.length; i++) {
    const lineNum = i + 1;
    const cols = lines[i].split(sepChar);

    if (normType === 'ZSCORE') {
      if (cols.length < 2) {
        errors.push(
          `Linje ${lineNum}: Feil antall kolonner (forventet minst 2, fikk ${cols.length})`,
        );
        continue;
      }
      const score = parseFloat(cols[0].trim());
      const normValue = parseFloat(cols[1].trim());
      if (isNaN(score)) {
        errors.push(`Linje ${lineNum}: Ugyldig score-verdi "${cols[0].trim()}"`);
        continue;
      }
      if (isNaN(normValue)) {
        errors.push(`Linje ${lineNum}: Ugyldig normverdi "${cols[1].trim()}"`);
        continue;
      }
      rows.push({ score, normValue });
    } else {
      // NORM / PERCENTILE — LOOKUP: min, maks, verdi[, etikett]
      if (cols.length < 3 || cols.length > 4) {
        errors.push(
          `Linje ${lineNum}: Feil antall kolonner (forventet 3-4, fikk ${cols.length})`,
        );
        continue;
      }
      const min = parseFloat(cols[0].trim());
      const maks = cols[1].trim() !== '' ? parseFloat(cols[1].trim()) : NaN;
      const verdi = parseFloat(cols[2].trim());

      if (isNaN(min)) {
        errors.push(`Linje ${lineNum}: Ugyldig min-verdi "${cols[0].trim()}"`);
        continue;
      }
      if (cols[1].trim() !== '' && isNaN(maks)) {
        errors.push(`Linje ${lineNum}: Ugyldig maks-verdi "${cols[1].trim()}"`);
        continue;
      }
      if (cols[2].trim() === '') {
        errors.push(`Linje ${lineNum}: Tom verdi (kolonne 3)`);
        continue;
      }
      if (isNaN(verdi)) {
        errors.push(`Linje ${lineNum}: Ugyldig verdi "${cols[2].trim()}"`);
        continue;
      }
      rows.push({ score: min, normValue: verdi });
    }
  }

  return { rows, errors };
}

// ─── A. Import tekst-logikk ───────────────────────────────────────────────────

describe('importTextToSection', () => {
  it('tre linjer separert med newline → seksjon med 3 spørsmål, tekster korrekte', () => {
    const section = importTextToSection('Spørsmål 1\nSpørsmål 2\nSpørsmål 3', 'newline', '');
    expect(section).not.toBeNull();
    expect(section!.questions).toHaveLength(3);
    const texts = section!.questions.map((q) => (q as RadiobuttonQuestion).texts['NO']);
    expect(texts).toEqual(['Spørsmål 1', 'Spørsmål 2', 'Spørsmål 3']);
  });

  it('dobbelt linjeskift som separator → 2 spørsmål fra "A\\n\\nB"', () => {
    const section = importTextToSection('A\n\nB', 'double-newline', '');
    expect(section).not.toBeNull();
    expect(section!.questions).toHaveLength(2);
    expect((section!.questions[0] as RadiobuttonQuestion).texts['NO']).toBe('A');
    expect((section!.questions[1] as RadiobuttonQuestion).texts['NO']).toBe('B');
  });

  it('egendefinert separator (|) → splitter på |', () => {
    const section = importTextToSection('Alpha|Beta|Gamma', 'custom', '|');
    expect(section).not.toBeNull();
    expect(section!.questions).toHaveLength(3);
    expect((section!.questions[1] as RadiobuttonQuestion).texts['NO']).toBe('Beta');
  });

  it('tom linje filtreres bort — "A\\n\\nB\\n\\nC" med enkel \\n → 5 tokens, kun 3 ikke-tomme', () => {
    // With newline separator: split on \n gives ['A', '', 'B', '', 'C'] → 5 tokens, filter(Boolean) → 3
    const section = importTextToSection('A\n\nB\n\nC', 'newline', '');
    expect(section).not.toBeNull();
    expect(section!.questions).toHaveLength(3);
  });

  it('tekst trimmest — ledende og etterfølgende mellomrom fjernes', () => {
    const section = importTextToSection('  Spørsmål  \n  Andre  ', 'newline', '');
    expect(section).not.toBeNull();
    expect((section!.questions[0] as RadiobuttonQuestion).texts['NO']).toBe('Spørsmål');
    expect((section!.questions[1] as RadiobuttonQuestion).texts['NO']).toBe('Andre');
  });

  it('kun én linje → seksjon med ett spørsmål', () => {
    const section = importTextToSection('Enkeltspørsmål', 'newline', '');
    expect(section).not.toBeNull();
    expect(section!.questions).toHaveLength(1);
  });

  it('kun tomme linjer → null (ingen seksjon)', () => {
    const section = importTextToSection('   \n   \n   ', 'newline', '');
    expect(section).toBeNull();
  });

  it('mandatory: true → alle spørsmål har required: true', () => {
    const section = importTextToSection('Q1\nQ2', 'newline', '', undefined, true);
    expect(section).not.toBeNull();
    section!.questions.forEach((q) => {
      expect((q as RadiobuttonQuestion).required).toBe(true);
    });
  });

  it('mandatory: false → alle spørsmål har required: false', () => {
    const section = importTextToSection('Q1\nQ2', 'newline', '', undefined, false);
    expect(section).not.toBeNull();
    section!.questions.forEach((q) => {
      expect((q as RadiobuttonQuestion).required).toBe(false);
    });
  });

  it('readonly: true → readonly: true på alle spørsmål', () => {
    const section = importTextToSection('Q1\nQ2', 'newline', '', undefined, false, true);
    expect(section).not.toBeNull();
    section!.questions.forEach((q) => {
      expect((q as RadiobuttonQuestion).readonly).toBe(true);
    });
  });

  it('reversedScore: true → reversedScore: true på alle spørsmål', () => {
    const section = importTextToSection('Q1\nQ2', 'newline', '', undefined, false, false, true);
    expect(section).not.toBeNull();
    section!.questions.forEach((q) => {
      expect((q as RadiobuttonQuestion).reversedScore).toBe(true);
    });
  });

  it('templateCode satt → alle spørsmål har responseTemplateCode satt', () => {
    const section = importTextToSection('Q1\nQ2', 'newline', '', 'LIKERT5');
    expect(section).not.toBeNull();
    section!.questions.forEach((q) => {
      expect((q as RadiobuttonQuestion).responseTemplateCode).toBe('LIKERT5');
    });
  });

  it('templateCode ikke satt → responseTemplateCode er undefined', () => {
    const section = importTextToSection('Q1\nQ2', 'newline', '', '');
    expect(section).not.toBeNull();
    section!.questions.forEach((q) => {
      expect((q as RadiobuttonQuestion).responseTemplateCode).toBeUndefined();
    });
  });

  it('returnert seksjon har type: NORMAL', () => {
    const section = importTextToSection('Q1', 'newline', '');
    expect(section).not.toBeNull();
    expect(section!.type).toBe('NORMAL');
  });

  it('returnerte spørsmål har unike IDer (ikke tomme strenger)', () => {
    const section = importTextToSection('Q1\nQ2\nQ3', 'newline', '');
    expect(section).not.toBeNull();
    const ids = section!.questions.map((q) => q.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(3);
    ids.forEach((id) => expect(id).not.toBe(''));
  });

  it('tekst lagres på defaultLanguage-parameteren', () => {
    const section = importTextToSection('Question EN', 'newline', '', undefined, false, false, false, 'EN');
    expect(section).not.toBeNull();
    const q = section!.questions[0] as RadiobuttonQuestion;
    expect(q.texts['EN']).toBe('Question EN');
    expect(q.texts['NO']).toBeUndefined();
  });
});

// ─── B. Import norm-logikk ────────────────────────────────────────────────────

describe('parseNormRows — LOOKUP-type (NORM)', () => {
  it('gyldig rad "0\\t10\\t5" (tab) → én rad, min=0, max ignorert, normValue=5', () => {
    const { rows, errors } = parseNormRows('0\t10\t5', 'tab', false, 'NORM');
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe(0);
    expect(rows[0].normValue).toBe(5);
  });

  it('gyldig rad med etikett "0\\t10\\t5\\tLav" → normValue=5, ingen feil', () => {
    const { rows, errors } = parseNormRows('0\t10\t5\tLav', 'tab', false, 'NORM');
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].normValue).toBe(5);
  });

  it('semikolon-separator "0;10;5" → fungerer', () => {
    const { rows, errors } = parseNormRows('0;10;5', 'semicolon', false, 'NORM');
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe(0);
    expect(rows[0].normValue).toBe(5);
  });

  it('tom maks "0\\t\\t5" → akseptert (maks er valgfritt for LOOKUP)', () => {
    const { rows, errors } = parseNormRows('0\t\t5', 'tab', false, 'NORM');
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe(0);
    expect(rows[0].normValue).toBe(5);
  });

  it('header-rad hoppes over når hasHeader=true', () => {
    const { rows, errors } = parseNormRows('min\tmaks\tverdi\n0\t10\t5', 'tab', true, 'NORM');
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe(0);
  });

  it('tomme linjer ignoreres', () => {
    const { rows, errors } = parseNormRows('0\t10\t5\n\n1\t20\t10\n', 'tab', false, 'NORM');
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(2);
  });

  it('ugyldig min (ikke-tall) → error-melding, raden hoppes over', () => {
    const { rows, errors } = parseNormRows('abc\t10\t5', 'tab', false, 'NORM');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/Ugyldig min-verdi/);
    expect(rows).toHaveLength(0);
  });

  it('ugyldig verdi (ikke-tall) → error-melding', () => {
    const { rows, errors } = parseNormRows('0\t10\txyz', 'tab', false, 'NORM');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/Ugyldig verdi/);
    expect(rows).toHaveLength(0);
  });

  it('feil antall kolonner (kun 2) → error-melding', () => {
    const { rows, errors } = parseNormRows('0\t10', 'tab', false, 'NORM');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/Feil antall kolonner/);
    expect(rows).toHaveLength(0);
  });

  it('for mange kolonner (5+) → error-melding', () => {
    const { rows, errors } = parseNormRows('0\t10\t5\tLav\tEkstra', 'tab', false, 'NORM');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/Feil antall kolonner/);
    expect(rows).toHaveLength(0);
  });

  it('blanding av gyldige og ugyldige rader → gyldige returneres, errors for ugyldige', () => {
    const input = '0\t10\t5\nabc\t10\t5\n1\t20\t10';
    const { rows, errors } = parseNormRows(input, 'tab', false, 'NORM');
    expect(rows).toHaveLength(2);
    expect(errors).toHaveLength(1);
    expect(rows[0].score).toBe(0);
    expect(rows[1].score).toBe(1);
  });
});

describe('parseNormRows — PERCENTILE-type', () => {
  it('fungerer på samme måte som NORM (LOOKUP-format)', () => {
    const { rows, errors } = parseNormRows('0\t10\t25', 'tab', false, 'PERCENTILE');
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe(0);
    expect(rows[0].normValue).toBe(25);
  });
});

describe('parseNormRows — ZSCORE-type', () => {
  it('gyldig rad "50\\t0.5" → score=50, normValue=0.5', () => {
    const { rows, errors } = parseNormRows('50\t0.5', 'tab', false, 'ZSCORE');
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe(50);
    expect(rows[0].normValue).toBe(0.5);
  });

  it('desimaltall fungerer', () => {
    const { rows, errors } = parseNormRows('12.5\t-1.96', 'tab', false, 'ZSCORE');
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe(12.5);
    expect(rows[0].normValue).toBe(-1.96);
  });

  it('ugyldig score (ikke-tall) → error', () => {
    const { rows, errors } = parseNormRows('abc\t0.5', 'tab', false, 'ZSCORE');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/Ugyldig score-verdi/);
    expect(rows).toHaveLength(0);
  });

  it('ugyldig normValue (ikke-tall) → error', () => {
    const { rows, errors } = parseNormRows('50\txyz', 'tab', false, 'ZSCORE');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/Ugyldig normverdi/);
    expect(rows).toHaveLength(0);
  });

  it('feil antall kolonner (kun 1) → error', () => {
    const { rows, errors } = parseNormRows('50', 'tab', false, 'ZSCORE');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/Feil antall kolonner/);
    expect(rows).toHaveLength(0);
  });

  it('header hoppes over for ZSCORE når hasHeader=true', () => {
    const { rows, errors } = parseNormRows('score\tnormValue\n50\t0.5', 'tab', true, 'ZSCORE');
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe(50);
  });

  it('tomme linjer ignoreres for ZSCORE', () => {
    const { rows, errors } = parseNormRows('50\t0.5\n\n51\t0.6\n', 'tab', false, 'ZSCORE');
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(2);
  });
});
