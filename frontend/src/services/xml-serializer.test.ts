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
import { parseFlagFile, parseQuestionnaire, parseCalculationFile } from './xml-parser';
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
    expect(xml).toContain('minValue="0.0"');
    expect(xml).toContain('maxValue="100.0"');
    expect(xml).toContain('step="5.0"');
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

  it('skriver requiresNewPage="false" eksplisitt som ekte pakker når false/udefinert', () => {
    const q = makeQuestionnaire({
      sections: [makeSection({ requiresNewPage: false }), makeSection({ id: 's2', code: 'SEC2' })],
    });
    const xml = serializeQuestionnaire(q);
    expect(xml.match(/requiresNewPage="false"/g)?.length).toBe(2);
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

describe('serializeCalculation — kartleggingsreferanse', () => {
  it('skriver <questionnaire href> og <application> som ekte pakker', () => {
    const xml = serializeCalculation({ code: 'TOTAL', name: 'Total', type: 'SUM', innerCalculations: [{ questionCode: 'Q1' }] }, 'MIN_Q');
    expect(xml).toContain('<questionnaire href="../quiz/MIN_Q.questionnaire#MIN_Q"/>');
    expect(xml).toContain('<application id="Studio" version="1" fileVersion="1"/>');
  });

  it('skriver referansen også når _rawExpression brukes', () => {
    const xml = serializeCalculation({ code: 'T', name: 'T', type: 'SUM', innerCalculations: [], _rawExpression: '<calculationExpression/>' }, 'Q2');
    expect(xml).toContain('<questionnaire href="../quiz/Q2.questionnaire#Q2"/>');
  });
});

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

// ─── Store-format: flagg, oversettelser og seksjonsbilde ─────────────────────

describe('serializeFlag — samme form som ekte store-pakker', () => {
  const flag: Flag = {
    code: 'HOY_TOTAL', name: 'Høy total', type: 'WARNING',
    conditions: [{ calculationCode: 'TOTAL', operator: 'GTE', threshold: 7 }], logic: 'AND',
  };

  it('har kartleggingen som barnenode med #kode og application, ikke questionnaire-attributt', () => {
    const xml = serializeFlag(flag, 'TEST_Q');
    expect(xml).toContain('<questionnaire href="../quiz/TEST_Q.questionnaire#TEST_Q"/>');
    expect(xml).toContain('<application id="Studio" version="1" fileVersion="1"/>');
    expect(xml).not.toMatch(/<questionnaire:Flag[^>]*\squestionnaire=/);
  });

  it('skriver sammenligningen som Operator med CalculationType name og NumberBasicType', () => {
    const xml = serializeFlag(flag, 'TEST_Q');
    expect(xml).toContain('<flagExpression xsi:type="questionnaire:Operator" type="greaterOrEqual">');
    expect(xml).toContain('<elements xsi:type="questionnaire:CalculationType" name="TOTAL"/>');
    expect(xml).toContain('<elements xsi:type="questionnaire:NumberBasicType" value="7"/>');
    expect(xml).not.toContain('SimpleStatement');
  });

  it('rundtur gjennom parseFlagFile beholder betingelser og logikk', () => {
    const multi: Flag = { ...flag, conditions: [
      { calculationCode: 'TOTAL', operator: 'GTE', threshold: 7 },
      { calculationCode: 'SUB_A', operator: 'LT', threshold: 2.5 },
    ], logic: 'OR' };
    const back = parseFlagFile(serializeFlag(multi, 'TEST_Q'), makeQuestionnaire());
    expect(back?.conditions).toEqual(multi.conditions);
    expect(back?.logic).toBe('OR');
  });

  it('leser eldre SimpleStatement-flagg med calculation href', () => {
    const old = `<?xml version="1.0" encoding="UTF-8"?>
<questionnaire:Flag xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:questionnaire="http://questionnaire/1.0" code="F" name="F">
  <flagExpression xsi:type="questionnaire:SimpleStatement" type="greater">
    <elements xsi:type="questionnaire:CalculationType"><calculation href="../calculations/TOTAL.calculation"/></elements>
    <elements xsi:type="questionnaire:NumberBasicType" value="3"/>
  </flagExpression>
</questionnaire:Flag>`;
    expect(parseFlagFile(old, makeQuestionnaire())?.conditions).toEqual([{ calculationCode: 'TOTAL', operator: 'GT', threshold: 3 }]);
  });
});

describe('serializeTranslation — application', () => {
  it('har application-element som ekte oversettelsesfiler', () => {
    const q = makeQuestionnaire({ name: { NO: 'Navn', EN: 'Name', SV: '', DA: '', FI: '', DE: '', FR: '', PL: '' }, supportedLanguages: ['NO', 'EN'] });
    expect(serializeTranslation(q, 'EN', 'TEST_Q')).toContain('<application id="Studio" version="1" fileVersion="1"/>');
  });
});

describe('serializeSection — backgroundImage', () => {
  it('skriver seksjonsbilde og leser det tilbake', () => {
    const q = makeQuestionnaire({ sections: [makeSection({ backgroundImage: 'bilde.png' })] });
    const xml = serializeQuestionnaire(q);
    expect(xml).toContain('backgroundImage="bilde.png" backgroundRepeat="noRepeat" backgroundPosition="right"');
    expect(parseQuestionnaire(xml).sections[0].backgroundImage).toBe('bilde.png');
  });
});

describe('serializeCalculation — MEAN rundtur', () => {
  it('MEAN over flere spørsmål leses tilbake som MEAN med samme spørsmål', () => {
    const calc: Calculation = { code: 'M', name: 'Snitt', type: 'MEAN', innerCalculations: [{ questionCode: 'Q1' }, { questionCode: 'Q2' }, { questionCode: 'Q3' }] };
    const back = parseCalculationFile(serializeCalculation(calc, 'TEST_Q'), makeQuestionnaire());
    expect(back?.type).toBe('MEAN');
    expect(back?.innerCalculations.map((ic) => ic.questionCode)).toEqual(['Q1', 'Q2', 'Q3']);
  });

  it('MEAN over ett spørsmål leses tilbake som MEAN', () => {
    const calc: Calculation = { code: 'M1', name: 'Snitt', type: 'MEAN', innerCalculations: [{ questionCode: 'Q1' }] };
    expect(parseCalculationFile(serializeCalculation(calc, 'TEST_Q'), makeQuestionnaire())?.type).toBe('MEAN');
  });

  it('deling på annet tall enn antall spørsmål forblir CUSTOM', () => {
    const xml = serializeCalculation({ code: 'D', name: 'D', type: 'MEAN', innerCalculations: [{ questionCode: 'Q1' }, { questionCode: 'Q2' }] }, 'TEST_Q').replace('value="2"', 'value="5"');
    expect(parseCalculationFile(xml, makeQuestionnaire())?.type).toBe('CUSTOM');
  });
});

describe('serializeTranslation — svaralternativer på spørsmålet', () => {
  it('oversetter alternativer som ligger direkte på spørsmålet', () => {
    const q = makeQuestionnaire({ supportedLanguages: ['NO', 'EN'], sections: [makeSection({ questions: [{
      id: 'q1', code: 'Q1', type: 'radiobutton', required: true,
      texts: { NO: 'Spørsmål', EN: 'Question', SV: '', DA: '', FI: '', DE: '', FR: '', PL: '' },
      options: [{ code: 'Q1_0', score: 0, texts: { NO: 'Nei', EN: 'No', SV: '', DA: '', FI: '', DE: '', FR: '', PL: '' } }],
    }] })] });
    expect(serializeTranslation(q, 'EN', 'TEST_Q')).toContain('<translation code="Q1_0" entity="TextOption" property="label" originalText="Nei" translatedText="No"/>');
  });
});

// ─── Svarmaler i ekte Checkware-format (questionnaire.ecore + store-pakker) ─────

describe('svarmaler — samme attributter som ekte store-pakker', () => {
  const t = (NO: string) => ({ NO, EN: '', SV: '', DA: '', FI: '', DE: '', FR: '', PL: '' });
  function build(questions: Section['questions']): string {
    return serializeQuestionnaire(makeQuestionnaire({ sections: [makeSection({ questions })] }));
  }
  const widget = (xml: string, type: string) => xml.match(new RegExp(`<widget xsi:type="questionnaire:${type}"[^>]*/>`))?.[0] ?? '';

  it('StringInput: size line/multiline/story, aldri MEDIUM', () => {
    const xml = build([
      { id: 'a', code: 'T1', type: 'stringInput', required: false, texts: t('a'), size: 'MEDIUM' },
      { id: 'b', code: 'T2', type: 'stringInput', required: false, texts: t('b'), size: 'SMALL', multiline: true },
      { id: 'c', code: 'T3', type: 'stringInput', required: false, texts: t('c'), size: 'XLARGE' },
    ]);
    expect(xml).toContain('<widget xsi:type="questionnaire:StringInput" size="line"/>');
    expect(xml).toContain('<widget xsi:type="questionnaire:StringInput" size="multiline"/>');
    expect(xml).toContain('<widget xsi:type="questionnaire:StringInput" size="story"/>');
    expect(xml).not.toContain('MEDIUM');
    const qs = parseQuestionnaire(xml).sections[0].questions;
    expect(qs.map((q) => (q.type === 'stringInput' ? q.size : ''))).toEqual(['MEDIUM', 'LARGE', 'XLARGE']);
  });

  it('NumericSlider: full attributtliste og rekkefølge som ekte pakker', () => {
    const xml = build([{ id: 's', code: 'SL1', type: 'slider', required: false, texts: t('s'), min: 0, max: 10, valueLabels: [{ code: 'SL1-VL1', value: 0, texts: t('Lav') }] }]);
    expect(widget(xml, 'NumericSlider')).toBe(
      '<widget xsi:type="questionnaire:NumericSlider" minValue="0.0" maxValue="10.0" step="1.0" labelStep="1.0" showEndLabels="true" showScaleLabels="true" valuePosition="after" labelPosition="after" direction="horizontal" displayValue="false" showTicks="false" showDigitalPoints="false" showClear="true" hairline="false"/>',
    );
    expect(xml).not.toContain('labelMin');
    expect(xml).toContain('<valueLabel xsi:type="questionnaire:TextValueLabel" code="SL1-VL1" value="0" label="Lav"/>');
    const q = parseQuestionnaire(xml).sections[0].questions[0];
    expect(q.type === 'slider' && [q.min, q.max, q.step, q.showClear]).toEqual([0, 10, 1, true]);
  });

  it('NumericInput: minValue/maxValue/step som flyttall; desimaler ↔ step', () => {
    const xml = build([{ id: 'n', code: 'N1', type: 'numericInput', required: false, texts: t('n'), min: 0, max: 100, decimals: 1 }]);
    expect(widget(xml, 'NumericInput')).toBe('<widget xsi:type="questionnaire:NumericInput" minValue="0.0" maxValue="100.0" step="0.1"/>');
    const q = parseQuestionnaire(xml).sections[0].questions[0];
    expect(q.type === 'numericInput' && [q.min, q.max, q.decimals]).toEqual([0, 100, 1]);
  });

  it('DateInput: addTime/addDate', () => {
    const xml = build([{ id: 'd', code: 'D1', type: 'dateInput', required: false, texts: t('d') }]);
    expect(widget(xml, 'DateInput')).toBe('<widget xsi:type="questionnaire:DateInput" addTime="false" addDate="true"/>');
  });

  it('Question: voluntary/readonly/reversedScore alltid med, readonly med liten o', () => {
    const xml = build([{ id: 'q', code: 'Q1', type: 'combobox', required: true, texts: t('q'), readonly: true, options: [{ code: 'Q1_1', score: 1, texts: t('x') }] }]);
    expect(xml).toMatch(/template="Q1" voluntary="false" readonly="true" reversedScore="false"/);
    expect(xml).not.toContain('readOnly');
    expect(parseQuestionnaire(xml).sections[0].questions[0].readonly).toBe(true);
  });

  it('Seksjonsoverskrift skrives som description (Section har ikke title i modellen)', () => {
    const xml = build([]);
    expect(xml).toMatch(/<section code="SEC1" requiresNewPage="false" description="Seksjon 1">/);
    expect(parseQuestionnaire(xml).sections[0].titles.NO).toBe('Seksjon 1');
  });

  it('leser eldre Studio-format (min/max/labelMin, size=MEDIUM) fortsatt inn', () => {
    const old = build([]).replace(
      '<responseTemplates/>',
      '<responseTemplates><responseTemplate questions="X1" code="X1"><widget xsi:type="questionnaire:NumericSlider" min="2" max="8" labelMin="Lav"/></responseTemplate></responseTemplates>',
    ).replace('</section>', '<contains xsi:type="questionnaire:Question" code="X1" question="x" mandatory="false" template="X1"/></section>');
    const q = parseQuestionnaire(old).sections[0].questions[0];
    // labelMin blir verdietiketten ved min
    expect(q.type === 'slider' && [q.min, q.max, q.valueLabels?.[0]?.value, q.valueLabels?.[0]?.texts?.NO]).toEqual([2, 8, 2, 'Lav']);
  });
});

// ─── Bilde, lyd, datogrenser og vektet sum (modellen + ekte pakker) ────────────

describe('elementer og beregninger som i questionnaire.ecore', () => {
  const t = (NO: string) => ({ NO, EN: '', SV: '', DA: '', FI: '', DE: '', FR: '', PL: '' });
  const build = (questions: Section['questions'], calcs: Calculation[] = []) =>
    serializeQuestionnaire(makeQuestionnaire({ sections: [makeSection({ questions })], calculations: { calculations: calcs, norms: [] } }));

  it('bilde skrives som ImageElement@imageFile og lyd som AudioVideo@audioVideoFile', () => {
    const xml = build([
      { id: 'i', code: 'IM1', type: 'image', required: false, texts: t(''), imageSrc: 'a.png' },
      { id: 'a', code: 'AV1', type: 'audioVideo', required: false, texts: t(''), mediaFile: 'lyd.mp3' },
    ]);
    expect(xml).toContain('<contains xsi:type="questionnaire:ImageElement" code="IM1" imageFile="a.png"/>');
    expect(xml).toContain('<contains xsi:type="questionnaire:AudioVideo" code="AV1" audioVideoFile="lyd.mp3"/>');
    expect(xml).not.toContain('ImageWidget');
    const qs = parseQuestionnaire(xml).sections[0].questions;
    expect(qs[0].type === 'image' && qs[0].imageSrc).toBe('a.png');
    expect(qs[1].type === 'audioVideo' && qs[1].mediaFile).toBe('lyd.mp3');
  });

  it('leser eldre widgets:ImageWidget imageSrc fortsatt inn', () => {
    const xml = build([]).replace('</section>', '<contains xsi:type="widgets:ImageWidget" code="IMG" imageSrc="gammel.png"/></section>');
    const q = parseQuestionnaire(xml).sections[0].questions[0];
    expect(q.type === 'image' && q.imageSrc).toBe('gammel.png');
  });

  it('vis/skjul på tekstelement eksporteres som barn', () => {
    const xml = build([{ id: 'x', code: 'TX1', type: 'text', isQuestion: false, required: false, texts: t('Hei'),
      showExpressions: [{ logic: 'AND', statements: [{ questionCode: 'F1', operator: 'EQ', value: 'F1_1' }] }] }]);
    expect(xml).toMatch(/<contains xsi:type="questionnaire:Text" code="TX1"[^>]*><show[^]*<\/contains>/);
    expect(parseQuestionnaire(xml).sections[0].questions[0].showExpressions?.[0].statements[0]).toMatchObject({ questionCode: 'F1', value: 'F1_1' });
  });

  it('DateInput: årsgrenser skrives bare når de er satt, og leses tilbake', () => {
    const xml = build([
      { id: 'd', code: 'D1', type: 'dateInput', required: false, texts: t('d'), minAbsoluteYear: 1900, maxRelativeYear: 0 },
      { id: 'e', code: 'D2', type: 'dateInput', required: false, texts: t('e') },
    ]);
    expect(xml).toContain('<widget xsi:type="questionnaire:DateInput" minAbsoluteYear="1900" maxRelativeYear="0" addTime="false" addDate="true"/>');
    expect(xml).toContain('<widget xsi:type="questionnaire:DateInput" addTime="false" addDate="true"/>');
    const q = parseQuestionnaire(xml).sections[0].questions[0];
    expect(q.type === 'dateInput' && [q.minAbsoluteYear, q.maxRelativeYear, q.maxAbsoluteYear]).toEqual([1900, 0, undefined]);
  });

  it('vektet sum (multiplier) leses tilbake som SUM med samme vekt', () => {
    const q = makeQuestionnaire({ sections: [makeSection({ questions: [
      { id: 'a', code: 'A', type: 'radiobutton', required: true, texts: t('a'), options: [] },
      { id: 'b', code: 'B', type: 'radiobutton', required: true, texts: t('b'), options: [] },
    ] })] });
    const calc: Calculation = { code: 'V', name: 'V', type: 'SUM', innerCalculations: [{ questionCode: 'A', multiplier: 2 }, { questionCode: 'B' }] };
    const back = parseCalculationFile(serializeCalculation(calc, q.code), q);
    expect(back?.type).toBe('SUM');
    expect(back?.innerCalculations.map((ic) => [ic.questionCode, ic.multiplier])).toEqual([['A', 2], ['B', 1]]);
  });
});
