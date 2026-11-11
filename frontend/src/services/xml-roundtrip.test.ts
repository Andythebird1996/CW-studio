/**
 * Vitest tests for xml-parser.ts and xml-serializer.ts
 *
 * Tests parse → serialize → parse round-trips for the Checkware Studio
 * EMF XML questionnaire format.
 */

import { describe, it, expect } from 'vitest';
import { parseQuestionnaire } from './xml-parser';
import { serializeQuestionnaire } from './xml-serializer';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const NS = 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:questionnaire="http://questionnaire/1.0"';

/** Wrap raw section + responseTemplates XML in a minimal questionnaire root */
function makeQuestionnaire(inner: string, attrs = ''): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<questionnaire:Questionnaire ${NS} code="TEST" name="Test Questionnaire" version="1" language="norwegian" ${attrs}>
${inner}
  <responseTemplates/>
  <dimensions/>
  <application id="Studio" version="1" fileVersion="1"/>
</questionnaire:Questionnaire>`;
}

// ─── Test 1: Minimal gyldig XML — én seksjon, ett radio-spørsmål ─────────────

describe('Parser: minimal radio questionnaire', () => {
  const xml = makeQuestionnaire(`
  <section code="S1" title="Seksjon 1">
    <contains xsi:type="questionnaire:Question" code="Q1" question="Hva er 2+2?" mandatory="true" template="T_RADIO" align="left"/>
  </section>
  <responseTemplates>
    <responseTemplate questions="Q1" code="T_RADIO">
      <widget xsi:type="questionnaire:Radiobutton"/>
      <option xsi:type="questionnaire:TextOption" code="OPT1" value="1" label="Tre"/>
      <option xsi:type="questionnaire:TextOption" code="OPT2" value="2" label="Fire"/>
    </responseTemplate>
  </responseTemplates>
  <dimensions/>`);

  it('parses code, version og defaultLanguage', () => {
    const q = parseQuestionnaire(xml);
    expect(q.code).toBe('TEST');
    expect(q.version).toBe('1');
    expect(q.defaultLanguage).toBe('NO');
  });

  it('parses sections', () => {
    const q = parseQuestionnaire(xml);
    expect(q.sections).toHaveLength(1);
    expect(q.sections[0].code).toBe('S1');
    expect(q.sections[0].titles['NO']).toBe('Seksjon 1');
  });

  it('parses radio question', () => {
    const q = parseQuestionnaire(xml);
    const question = q.sections[0].questions[0];
    expect(question.code).toBe('Q1');
    expect(question.type).toBe('radiobutton');
    expect(question.required).toBe(true);
    expect(question.texts['NO']).toBe('Hva er 2+2?');
  });

  it('parses options from response template', () => {
    const q = parseQuestionnaire(xml);
    const question = q.sections[0].questions[0] as any;
    expect(question.options).toHaveLength(2);
    expect(question.options[0].code).toBe('OPT1');
    expect(question.options[0].score).toBe(1);
    expect(question.options[0].texts['NO']).toBe('Tre');
    expect(question.options[1].code).toBe('OPT2');
    expect(question.options[1].score).toBe(2);
  });
});

// ─── Test 2: Ulike spørsmålstyper ────────────────────────────────────────────

describe('Parser: ulike spørsmålstyper', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<questionnaire:Questionnaire ${NS} code="TYPES" name="Types Test" version="2" language="english">
  <section code="SEC1" title="All Types">
    <contains xsi:type="questionnaire:Question" code="CB1" question="Pick all" mandatory="false" template="T_CB" align="left"/>
    <contains xsi:type="questionnaire:Question" code="SL1" question="Rate pain" mandatory="false" template="T_SL" align="left"/>
    <contains xsi:type="questionnaire:Question" code="STR1" question="Your name" mandatory="false" template="T_STR" align="left"/>
    <contains xsi:type="questionnaire:Question" code="DT1" question="Date of birth" mandatory="false" template="T_DATE" align="left"/>
    <contains xsi:type="questionnaire:Question" code="NUM1" question="Your age" mandatory="false" template="T_NUM" align="left"/>
    <contains xsi:type="questionnaire:Text" code="TXT1" content="This is informational text" contentStyle="normal" align="left"/>
  </section>
  <responseTemplates>
    <responseTemplate questions="CB1" code="T_CB">
      <widget xsi:type="questionnaire:Checkbox"/>
      <option xsi:type="questionnaire:TextOption" code="A" value="1" label="Option A"/>
      <option xsi:type="questionnaire:TextOption" code="B" value="2" label="Option B"/>
    </responseTemplate>
    <responseTemplate questions="SL1" code="T_SL">
      <widget xsi:type="questionnaire:Slider" min="0" max="10" step="1" labelMin="No pain" labelMax="Worst pain"/>
    </responseTemplate>
    <responseTemplate questions="STR1" code="T_STR">
      <widget xsi:type="questionnaire:StringInput" size="MEDIUM"/>
    </responseTemplate>
    <responseTemplate questions="DT1" code="T_DATE">
      <widget xsi:type="questionnaire:DateInput"/>
    </responseTemplate>
    <responseTemplate questions="NUM1" code="T_NUM">
      <widget xsi:type="questionnaire:NumericInput" min="0" max="120" decimals="0" unit="years"/>
    </responseTemplate>
  </responseTemplates>
  <dimensions/>
  <application id="Studio" version="1" fileVersion="1"/>
</questionnaire:Questionnaire>`;

  it('parses checkbox question', () => {
    const q = parseQuestionnaire(xml);
    const cb = q.sections[0].questions[0] as any;
    expect(cb.code).toBe('CB1');
    expect(cb.type).toBe('checkbox');
    expect(cb.options).toHaveLength(2);
  });

  it('parses slider question with min/max/step and labels', () => {
    const q = parseQuestionnaire(xml);
    const sl = q.sections[0].questions[1] as any;
    expect(sl.code).toBe('SL1');
    expect(sl.type).toBe('slider');
    expect(sl.min).toBe(0);
    expect(sl.max).toBe(10);
    expect(sl.step).toBe(1);
    expect(sl.minLabel?.['EN']).toBe('No pain');
    expect(sl.maxLabel?.['EN']).toBe('Worst pain');
  });

  it('parses stringInput question with size', () => {
    const q = parseQuestionnaire(xml);
    const str = q.sections[0].questions[2] as any;
    expect(str.code).toBe('STR1');
    expect(str.type).toBe('stringInput');
    expect(str.size).toBe('MEDIUM');
  });

  it('parses dateInput question', () => {
    const q = parseQuestionnaire(xml);
    const dt = q.sections[0].questions[3] as any;
    expect(dt.code).toBe('DT1');
    expect(dt.type).toBe('dateInput');
  });

  it('parses numericInput question with min/max/decimals/unit', () => {
    const q = parseQuestionnaire(xml);
    const num = q.sections[0].questions[4] as any;
    expect(num.code).toBe('NUM1');
    expect(num.type).toBe('numericInput');
    expect(num.min).toBe(0);
    expect(num.max).toBe(120);
    expect(num.decimals).toBe(0);
    expect(num.unit).toBe('years');
  });

  it('parses text element', () => {
    const q = parseQuestionnaire(xml);
    const txt = q.sections[0].questions[5] as any;
    expect(txt.code).toBe('TXT1');
    expect(txt.type).toBe('text');
    expect(txt.isQuestion).toBe(false);
    expect(txt.texts['EN']).toBe('This is informational text');
  });

  it('parses language as EN', () => {
    const q = parseQuestionnaire(xml);
    expect(q.defaultLanguage).toBe('EN');
  });
});

// ─── Test 3: Serialiserer produserer gyldig XML ───────────────────────────────

describe('Serializer: produserer gyldig XML', () => {
  it('produserer XML med riktig rot-element og namespaces', () => {
    const xml = makeQuestionnaire(`
  <section code="S1" title="My Section">
    <contains xsi:type="questionnaire:Question" code="Q1" question="Spørsmål?" mandatory="false" template="T1" align="left"/>
  </section>
  <responseTemplates>
    <responseTemplate questions="Q1" code="T1">
      <widget xsi:type="questionnaire:Radiobutton"/>
      <option xsi:type="questionnaire:TextOption" code="YES" value="1" label="Ja"/>
      <option xsi:type="questionnaire:TextOption" code="NO" value="0" label="Nei"/>
    </responseTemplate>
  </responseTemplates>
  <dimensions/>`);

    const q = parseQuestionnaire(xml);
    const out = serializeQuestionnaire(q);

    expect(out).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(out).toContain('questionnaire:Questionnaire');
    expect(out).toContain('xmlns:xsi=');
    expect(out).toContain('xmlns:questionnaire=');
  });

  it('serialiserer code og version', () => {
    const q = parseQuestionnaire(makeQuestionnaire('<section code="S1" title="T"><contains xsi:type="questionnaire:Text" code="TX" content="x" contentStyle="normal" align="left"/></section><dimensions/>'));
    const out = serializeQuestionnaire(q);
    expect(out).toContain('code="TEST"');
    expect(out).toContain('version="1"');
  });

  it('serialiserer questionnaire type SCALE', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<questionnaire:Scale ${NS} code="SC1" name="My Scale" version="3" language="norwegian">
  <section code="S1" title="S">
    <contains xsi:type="questionnaire:Text" code="T1" content="Info" contentStyle="normal" align="left"/>
  </section>
  <responseTemplates/>
  <dimensions/>
  <application id="Studio" version="1" fileVersion="1"/>
</questionnaire:Scale>`;
    const q = parseQuestionnaire(xml);
    expect(q.type).toBe('SCALE');
    const out = serializeQuestionnaire(q);
    expect(out).toContain('questionnaire:Scale');
  });
});

// ─── Test 4: Full round-trip ─────────────────────────────────────────────────

describe('Round-trip: parse → serialize → parse', () => {
  const originalXml = `<?xml version="1.0" encoding="UTF-8"?>
<questionnaire:Questionnaire ${NS} code="PHQ9" name="PHQ-9" version="5" language="norwegian">
  <section code="MAIN" title="Depresjonsskala">
    <contains xsi:type="questionnaire:Question" code="PHQ1" question="Lite interesse" mandatory="true" template="T_FREQ" align="left"/>
    <contains xsi:type="questionnaire:Question" code="PHQ2" question="Nedtrykt" mandatory="true" template="T_FREQ" align="left"/>
  </section>
  <responseTemplates>
    <responseTemplate questions="PHQ1 PHQ2" code="T_FREQ">
      <widget xsi:type="questionnaire:Radiobutton"/>
      <option xsi:type="questionnaire:TextOption" code="F0" value="0" label="Ikke i det hele tatt"/>
      <option xsi:type="questionnaire:TextOption" code="F1" value="1" label="Noen dager"/>
      <option xsi:type="questionnaire:TextOption" code="F2" value="2" label="Mer enn halvparten"/>
      <option xsi:type="questionnaire:TextOption" code="F3" value="3" label="Nesten hver dag"/>
    </responseTemplate>
  </responseTemplates>
  <dimensions/>
  <application id="Studio" version="1" fileVersion="1"/>
</questionnaire:Questionnaire>`;

  it('bevarer questionnaire-metadata etter round-trip', () => {
    const q1 = parseQuestionnaire(originalXml);
    const serialized = serializeQuestionnaire(q1);
    const q2 = parseQuestionnaire(serialized);

    expect(q2.code).toBe(q1.code);
    expect(q2.version).toBe(q1.version);
    expect(q2.defaultLanguage).toBe(q1.defaultLanguage);
    expect(q2.type).toBe(q1.type);
  });

  it('bevarer seksjoner og titler etter round-trip', () => {
    const q1 = parseQuestionnaire(originalXml);
    const serialized = serializeQuestionnaire(q1);
    const q2 = parseQuestionnaire(serialized);

    expect(q2.sections).toHaveLength(q1.sections.length);
    expect(q2.sections[0].code).toBe('MAIN');
    expect(q2.sections[0].titles['NO']).toBe('Depresjonsskala');
  });

  it('bevarer spørsmål og types etter round-trip', () => {
    const q1 = parseQuestionnaire(originalXml);
    const serialized = serializeQuestionnaire(q1);
    const q2 = parseQuestionnaire(serialized);

    const qs1 = q1.sections[0].questions;
    const qs2 = q2.sections[0].questions;

    expect(qs2).toHaveLength(qs1.length);
    for (let i = 0; i < qs1.length; i++) {
      expect(qs2[i].code).toBe(qs1[i].code);
      expect(qs2[i].type).toBe(qs1[i].type);
      expect(qs2[i].texts['NO']).toBe(qs1[i].texts['NO']);
      expect(qs2[i].required).toBe(qs1[i].required);
    }
  });

  it('bevarer svaralternativer etter round-trip', () => {
    const q1 = parseQuestionnaire(originalXml);
    const serialized = serializeQuestionnaire(q1);
    const q2 = parseQuestionnaire(serialized);

    const opts1 = (q1.sections[0].questions[0] as any).options;
    const opts2 = (q2.sections[0].questions[0] as any).options;

    expect(opts2).toHaveLength(opts1.length);
    for (let i = 0; i < opts1.length; i++) {
      expect(opts2[i].code).toBe(opts1[i].code);
      expect(opts2[i].score).toBe(opts1[i].score);
      expect(opts2[i].texts['NO']).toBe(opts1[i].texts['NO']);
    }
  });
});

// ─── Test 5: Manglende valgfrie felt ─────────────────────────────────────────

describe('Parser: manglende valgfrie felt', () => {
  it('håndterer questionnaire uten calculations, flags, dimensions', () => {
    const xml = makeQuestionnaire(`
  <section code="S1" title="">
    <contains xsi:type="questionnaire:Text" code="TXT" content="Hei" contentStyle="normal" align="left"/>
  </section>
  <dimensions/>`);

    const q = parseQuestionnaire(xml);
    expect(q.sections).toHaveLength(1);
    expect(q.dimensions).toBeUndefined();
    // No error thrown
  });

  it('håndterer spørsmål uten options (ingen mal)', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<questionnaire:Questionnaire ${NS} code="BARE" name="Bare" version="1" language="norwegian">
  <section code="S1" title="">
    <contains xsi:type="questionnaire:Question" code="Q_BARE" question="Spørsmål?" mandatory="false" template="T_MISSING" align="left"/>
  </section>
  <responseTemplates/>
  <dimensions/>
  <application id="Studio" version="1" fileVersion="1"/>
</questionnaire:Questionnaire>`;

    const q = parseQuestionnaire(xml);
    const question = q.sections[0].questions[0] as any;
    expect(question.code).toBe('Q_BARE');
    // Should have empty options since template T_MISSING doesn't exist
    expect(question.options ?? []).toHaveLength(0);
  });

  it('håndterer questionnaire uten responseTemplates element', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<questionnaire:Questionnaire ${NS} code="NOTEMPL" name="No Templates" version="1" language="norwegian">
  <section code="S1" title="S">
    <contains xsi:type="questionnaire:Text" code="T1" content="text" contentStyle="normal" align="left"/>
  </section>
  <dimensions/>
  <application id="Studio" version="1" fileVersion="1"/>
</questionnaire:Questionnaire>`;

    expect(() => parseQuestionnaire(xml)).not.toThrow();
    const q = parseQuestionnaire(xml);
    expect(q.responseTemplates?.templates).toHaveLength(0);
  });
});

// ─── Test 6: Nestede subSections ─────────────────────────────────────────────

describe('Parser: nestede subSections', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<questionnaire:Questionnaire ${NS} code="NESTED" name="Nested" version="1" language="norwegian">
  <section code="ROOT" title="Rot-seksjon">
    <contains xsi:type="questionnaire:Question" code="Q_ROOT" question="Rot-spørsmål" mandatory="false" template="T1" align="left"/>
    <contains xsi:type="questionnaire:Section" code="SUB1" title="Sub-seksjon 1">
      <contains xsi:type="questionnaire:Question" code="Q_SUB" question="Sub-spørsmål" mandatory="true" template="T1" align="left"/>
      <contains xsi:type="questionnaire:Section" code="SUB2" title="Sub-sub-seksjon">
        <contains xsi:type="questionnaire:Text" code="DEEP_TXT" content="Dyp tekst" contentStyle="normal" align="left"/>
      </contains>
    </contains>
  </section>
  <responseTemplates>
    <responseTemplate questions="Q_ROOT Q_SUB" code="T1">
      <widget xsi:type="questionnaire:Radiobutton"/>
      <option xsi:type="questionnaire:TextOption" code="OPT_JA" value="1" label="Ja"/>
      <option xsi:type="questionnaire:TextOption" code="OPT_NEI" value="0" label="Nei"/>
    </responseTemplate>
  </responseTemplates>
  <dimensions/>
  <application id="Studio" version="1" fileVersion="1"/>
</questionnaire:Questionnaire>`;

  it('parses root section med én direkte question og én subSection', () => {
    const q = parseQuestionnaire(xml);
    const root = q.sections[0];
    expect(root.code).toBe('ROOT');
    expect(root.questions).toHaveLength(1);
    expect(root.subSections).toHaveLength(1);
  });

  it('parses subSection med question og nested subSection', () => {
    const q = parseQuestionnaire(xml);
    const sub1 = q.sections[0].subSections![0];
    expect(sub1.code).toBe('SUB1');
    expect(sub1.questions).toHaveLength(1);
    expect(sub1.questions[0].code).toBe('Q_SUB');
    expect(sub1.questions[0].required).toBe(true);
    expect(sub1.subSections).toHaveLength(1);
  });

  it('parses doubly-nested sub-sub-section', () => {
    const q = parseQuestionnaire(xml);
    const sub2 = q.sections[0].subSections![0].subSections![0];
    expect(sub2.code).toBe('SUB2');
    expect(sub2.questions).toHaveLength(1);
    expect(sub2.questions[0].code).toBe('DEEP_TXT');
    expect(sub2.questions[0].type).toBe('text');
  });

  it('round-trip bevarer subSection-hierarkiet', () => {
    const q1 = parseQuestionnaire(xml);
    const out = serializeQuestionnaire(q1);
    const q2 = parseQuestionnaire(out);

    expect(q2.sections[0].subSections).toHaveLength(1);
    expect(q2.sections[0].subSections![0].code).toBe('SUB1');
    expect(q2.sections[0].subSections![0].subSections![0].code).toBe('SUB2');
  });
});

// ─── Test 7: hideExpressions og showExpressions ───────────────────────────────

describe('Parser: hideExpressions og showExpressions', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<questionnaire:Questionnaire ${NS} code="EXPR" name="Expressions" version="1" language="norwegian">
  <section code="SEC" title="Expressions test">
    <show>
      <elements xsi:type="questionnaire:SimpleStatement" type="equal">
        <elements xsi:type="questionnaire:Function" name="questionResponseValue">
          <parameter name="question" type="Question">
            <elements xsi:type="questionnaire:QuestionType" question="Q_TRIGGER"/>
          </parameter>
        </elements>
        <elements xsi:type="questionnaire:OptionType" option="OPT_YES" question="Q_TRIGGER"/>
      </elements>
    </show>
    <contains xsi:type="questionnaire:Question" code="Q_TRIGGER" question="Trigger?" mandatory="false" template="T1" align="left"/>
    <contains xsi:type="questionnaire:Question" code="Q_HIDDEN" question="Hidden spørsmål" mandatory="false" template="T1" align="left">
      <hide>
        <elements xsi:type="questionnaire:SimpleStatement" type="equal">
          <elements xsi:type="questionnaire:Function" name="questionResponseValue">
            <parameter name="question" type="Question">
              <elements xsi:type="questionnaire:QuestionType" question="Q_TRIGGER"/>
            </parameter>
          </elements>
          <elements xsi:type="questionnaire:OptionType" option="OPT_YES" question="Q_TRIGGER"/>
        </elements>
      </hide>
    </contains>
    <contains xsi:type="questionnaire:Question" code="Q_SHOWN" question="Shown spørsmål" mandatory="false" template="T1" align="left">
      <show>
        <elements xsi:type="questionnaire:SimpleStatement" type="notEqual">
          <elements xsi:type="questionnaire:Function" name="questionResponseValue">
            <parameter name="question" type="Question">
              <elements xsi:type="questionnaire:QuestionType" question="Q_TRIGGER"/>
            </parameter>
          </elements>
          <elements xsi:type="questionnaire:OptionType" option="OPT_NO" question="Q_TRIGGER"/>
        </elements>
      </show>
    </contains>
  </section>
  <responseTemplates>
    <responseTemplate questions="Q_TRIGGER Q_HIDDEN Q_SHOWN" code="T1">
      <widget xsi:type="questionnaire:Radiobutton"/>
      <option xsi:type="questionnaire:TextOption" code="OPT_YES" value="1" label="Ja"/>
      <option xsi:type="questionnaire:TextOption" code="OPT_NO" value="0" label="Nei"/>
    </responseTemplate>
  </responseTemplates>
  <dimensions/>
  <application id="Studio" version="1" fileVersion="1"/>
</questionnaire:Questionnaire>`;

  it('parses showExpression på seksjons-nivå', () => {
    const q = parseQuestionnaire(xml);
    const sec = q.sections[0];
    expect(sec.showExpressions).toBeDefined();
    expect(sec.showExpressions).toHaveLength(1);
    const expr = sec.showExpressions![0];
    expect(expr.statements).toHaveLength(1);
    expect(expr.statements[0].questionCode).toBe('Q_TRIGGER');
    expect(expr.statements[0].operator).toBe('EQ');
    expect(expr.statements[0].value).toBe('OPT_YES');
  });

  it('parses hideExpression på spørsmål', () => {
    const q = parseQuestionnaire(xml);
    const hiddenQ = q.sections[0].questions.find((qq) => qq.code === 'Q_HIDDEN');
    expect(hiddenQ).toBeDefined();
    expect(hiddenQ!.hideExpressions).toBeDefined();
    expect(hiddenQ!.hideExpressions).toHaveLength(1);
    const expr = hiddenQ!.hideExpressions![0];
    expect(expr.statements[0].questionCode).toBe('Q_TRIGGER');
    expect(expr.statements[0].operator).toBe('EQ');
    expect(expr.statements[0].value).toBe('OPT_YES');
  });

  it('parses showExpression med notEqual operator på spørsmål', () => {
    const q = parseQuestionnaire(xml);
    const shownQ = q.sections[0].questions.find((qq) => qq.code === 'Q_SHOWN');
    expect(shownQ).toBeDefined();
    expect(shownQ!.showExpressions).toBeDefined();
    expect(shownQ!.showExpressions).toHaveLength(1);
    const expr = shownQ!.showExpressions![0];
    expect(expr.statements[0].operator).toBe('NEQ');
    expect(expr.statements[0].value).toBe('OPT_NO');
  });

  it('round-trip bevarer hide/show expressions', () => {
    const q1 = parseQuestionnaire(xml);
    const out = serializeQuestionnaire(q1);
    const q2 = parseQuestionnaire(out);

    const hiddenQ1 = q1.sections[0].questions.find((qq) => qq.code === 'Q_HIDDEN');
    const hiddenQ2 = q2.sections[0].questions.find((qq) => qq.code === 'Q_HIDDEN');

    expect(hiddenQ2!.hideExpressions).toBeDefined();
    expect(hiddenQ2!.hideExpressions![0].statements[0].questionCode)
      .toBe(hiddenQ1!.hideExpressions![0].statements[0].questionCode);
    expect(hiddenQ2!.hideExpressions![0].statements[0].operator)
      .toBe(hiddenQ1!.hideExpressions![0].statements[0].operator);
  });

  it('section uten show/hide har ikke showExpressions', () => {
    const simpleXml = makeQuestionnaire(`
  <section code="S1" title="Simple">
    <contains xsi:type="questionnaire:Text" code="T1" content="x" contentStyle="normal" align="left"/>
  </section>
  <dimensions/>`);
    const q = parseQuestionnaire(simpleXml);
    expect(q.sections[0].showExpressions).toBeUndefined();
    expect(q.sections[0].hideExpressions).toBeUndefined();
  });
});
