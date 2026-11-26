// Syntetiske regresjonstester for formatfeil funnet i rundtur-sjekken mot ekte pakker (import → eksport).
import { describe, it, expect } from 'vitest';
import { parseQuestionnaire, parseCalculationFile, parseNormFile } from './xml-parser';
import { serializeQuestionnaire, serializeCalculation, serializeNorm, esc } from './xml-serializer';
import { diffXml } from './xml-semantic-diff';

const NS = 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:questionnaire="http://questionnaire/1.0"';
const quiz = (sectionAttrs: string, body: string, rootAttrs = '') => `<?xml version="1.0" encoding="UTF-8"?>
<questionnaire:Questionnaire ${NS} code="RT" name="Rundtur" version="1" language="norwegian"${rootAttrs}>
  <responseTemplates code="RT-TPL">
    <responseTemplate code="Q1"><widget xsi:type="questionnaire:Radiobutton"/>
      <option xsi:type="questionnaire:TextOption" code="Q1_0" label="Nei" score="0"/>
      <option xsi:type="questionnaire:TextOption" code="Q1_1" label="Ja" score="1"/>
    </responseTemplate>
  </responseTemplates>
  <section code="S1"${sectionAttrs}>${body}</section>
</questionnaire:Questionnaire>`;
const Q1 = '<contains xsi:type="questionnaire:Question" code="Q1" question="Spørsmål" mandatory="true" template="Q1"/>';

describe('rundtur-rettelser (syntetisk)', () => {
  it('linjeskift i tekst overlever eksport', () => {
    expect(esc('a\nb\tc')).toBe('a&#10;b&#9;c');
    const xml = quiz('', `${Q1}<contains xsi:type="questionnaire:Text" code="T1" content="Linje 1&#xA;Linje 2" contentStyle="normal"/>`);
    const back = parseQuestionnaire(serializeQuestionnaire(parseQuestionnaire(xml)));
    const t1 = back.sections[0].questions.find((q) => q.code === 'T1');
    expect(t1?.texts.NO).toBe('Linje 1\nLinje 2');
  });

  it('seksjonsattributter (matrise, nummerering, sideskift, TOC) beholdes', () => {
    const attrs = ' matrix="true" noPageBreaks="true" autonumbering="true" numberingType="numeric" resetNumbering="false" startOn="3" returnToTOC="false" backgroundRepeat="noRepeat" backgroundPosition="right"';
    const out = serializeQuestionnaire(parseQuestionnaire(quiz(attrs, Q1)));
    for (const a of attrs.trim().split(' ')) expect(out).toContain(a);
    const sec = parseQuestionnaire(out).sections[0];
    expect(sec.matrix).toBe(true);
    expect(sec.startOn).toBe(3);
  });

  it('visualizeProgress legges ikke til når den mangler, og beholdes når den finnes', () => {
    expect(serializeQuestionnaire(parseQuestionnaire(quiz('', Q1)))).not.toContain('visualizeProgress');
    expect(serializeQuestionnaire(parseQuestionnaire(quiz('', Q1, ' visualizeProgress="None"')))).toContain('visualizeProgress="None"');
  });

  it('vis-betingelse answered(Q1) == true beholder funksjon og boolsk verdi', () => {
    const show = `<show><elements xsi:type="questionnaire:SimpleStatement" type="equal">
      <elements xsi:type="questionnaire:Function" name="answered"><parameter name="question" type="Question">
      <elements xsi:type="questionnaire:QuestionType" question="Q1"/></parameter></elements>
      <elements xsi:type="questionnaire:BooleanBasicType" value="true"/></elements></show>`;
    const xml = quiz('', `${Q1}<contains xsi:type="questionnaire:Question" code="Q2" question="Oppfølging" mandatory="false" template="Q1">${show}</contains>`);
    const q2 = parseQuestionnaire(xml).sections[0].questions[1];
    expect(q2.showExpressions?.[0].statements[0]).toMatchObject({ questionCode: 'Q1', fn: 'answered', boolValue: true });
    const out = serializeQuestionnaire(parseQuestionnaire(xml));
    expect(out).toContain('name="answered"');
    expect(out).toContain('<elements xsi:type="questionnaire:BooleanBasicType" value="true"/>');
    expect(out).not.toContain('OptionType');
  });

  it('copyright beholdes uendret ved eksport', () => {
    const xml = quiz('', Q1).replace('</section>', '</section>\n  <copyright owner="Eier" questionnaireText="Linje 1&#xA;Linje 2" reportText="R" listText="L"/>');
    const out = serializeQuestionnaire(parseQuestionnaire(xml));
    expect(diffXml(xml, out).filter((d) => d.path.includes('copyright'))).toEqual([]);
    expect(out.indexOf('<copyright')).toBeLessThan(out.indexOf('<responseTemplates'));
  });

  it('assignedByVariable på beregninger beholdes', () => {
    const q = parseQuestionnaire(quiz('', Q1));
    const calc = parseCalculationFile(`<?xml version="1.0" encoding="UTF-8"?>
<questionnaire:Calculation ${NS} code="SUM" name="Sum" assignedByVariable="false">
  <calculationExpression xsi:type="questionnaire:Function" name="questionResponseValue"><parameter name="question" type="Question">
  <elements xsi:type="questionnaire:QuestionType" question="Q1"/></parameter></calculationExpression>
</questionnaire:Calculation>`, q);
    expect(calc?.assignedByVariable).toBe(false);
    expect(serializeCalculation(calc!, 'RT')).toContain('assignedByVariable="false"');
  });

  it('importerte normer beholder lookupMax og intervalltype, og får ikke nye grenser', () => {
    const src = `<?xml version="1.0" encoding="UTF-8"?>
<questionnaire:Norm ${NS} code="N1" title="Norm">
  <normContent xsi:type="questionnaire:LookupTable">
    <lookup value="10" lookupMin="0.0" lookupMax="0.25" type="[)"/>
    <lookup value="20" lookupMin="0.25" lookupMax="0.75" type="[]"/>
    <lookup value="30" lookupMin="1.0"/>
  </normContent>
</questionnaire:Norm>`;
    const out = serializeNorm(parseNormFile(src)!);
    expect(diffXml(src, out).filter((d) => d.path.includes('lookup'))).toEqual([]);
  });

  it('nye normer laget i Studio får fortsatt utregnet lookupMax', () => {
    const out = serializeNorm({ code: 'N2', name: 'Ny', type: 'NORM', data: [{ score: 0, normValue: 1 }, { score: 2, normValue: 3 }] });
    expect(out).toContain('lookupMin="0" lookupMax="1.5"');
  });
});
