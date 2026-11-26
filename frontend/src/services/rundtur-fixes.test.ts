// Syntetiske regresjonstester for formatfeil funnet i rundtur-sjekken mot ekte pakker (import → eksport).
import { describe, it, expect } from 'vitest';
import { parseQuestionnaire, parseCalculationFile, parseNormFile } from './xml-parser';
import { serializeQuestionnaire, serializeCalculation, serializeNorm, esc } from './xml-serializer';
import { diffXml } from './xml-semantic-diff';
import { buildPackageZip } from './package-builder';
import { importPackageFiles, type PackageFileInput } from './package-import';
import { isCompoundXml } from './expression-raw';
import JSZip from 'jszip';

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

describe('pakkeversjon, flere kartlegginger og sammensatte uttrykk (syntetisk)', () => {
  const MANIFEST = `<?xml version="1.0" encoding="UTF-8"?>
<questionnaire:Manifest xmlns:questionnaire="http://questionnaire/1.0" code="PAKKE" description="" public="false" requiredSkills="" version="3" release="7" name="Pakkenavn">
  <content><folder name="quiz"/></content>
</questionnaire:Manifest>`;
  const file = (fileName: string, content: string): PackageFileInput =>
    ({ fileName, extension: fileName.split('.').pop() ?? '', content, encoding: 'text' });
  const unzip = async (base64: string) => {
    const zip = await JSZip.loadAsync(base64, { base64: true });
    const out: Record<string, string> = {};
    for (const [k, f] of Object.entries(zip.files)) if (!f.dir) out[k] = await f.async('string');
    return out;
  };

  it('manifestets navn, versjon og utgivelse beholdes selv om kartleggingen har andre', async () => {
    const imp = importPackageFiles([file('RT.questionnaire', quiz('', Q1)), file('assessmentPackage.manifest', MANIFEST)]);
    expect(imp.packageMetadata).toMatchObject({ code: 'PAKKE', name: 'Pakkenavn', version: '3', release: '7' });
    const built = await buildPackageZip(imp.questionnaire, imp.rapFiles, imp.mediaFiles, imp.packageMetadata);
    expect(built.fileName).toBe('PAKKE_v3.7.zip');
    const manifest = (await unzip(built.base64))['metadata/assessmentPackage.manifest'];
    expect(manifest).toContain('version="3" release="7" name="Pakkenavn"');
    // Kartleggingen beholder sin egen versjon
    expect((await unzip(built.base64))['quiz/RT.questionnaire']).toContain('version="1"');
  });

  it('andre kartlegginger i pakken skrives tilbake uendret og står i manifestet', async () => {
    const other = quiz('', Q1).replace('code="RT"', 'code="RT-ROD"');
    const imp = importPackageFiles([file('RT.questionnaire', quiz('', Q1)), file('Rod med mellomrom.questionnaire', other), file('a.manifest', MANIFEST)]);
    expect(imp.questionnaire.code).toBe('RT');
    expect(imp.packageMetadata?.extraQuestionnaires?.map((e) => e.fileName)).toEqual(['Rod med mellomrom.questionnaire']);
    const files = await unzip((await buildPackageZip(imp.questionnaire, imp.rapFiles, imp.mediaFiles, imp.packageMetadata)).base64);
    expect(files['quiz/Rod med mellomrom.questionnaire']).toBe(other);
    expect(files['metadata/assessmentPackage.manifest']).toContain('fileName="Rod med mellomrom.questionnaire" path="quiz" extension="questionnaire" code="RT-ROD"');
  });

  const COMPOUND = `<show><elements xsi:type="questionnaire:Operator" type="or">
    <elements xsi:type="questionnaire:Operator" type="and">
      <elements xsi:type="questionnaire:SimpleStatement" type="equal">
        <elements xsi:type="questionnaire:Function" name="questionResponseValue"><parameter name="question" type="Question"><elements xsi:type="questionnaire:QuestionType" question="Q1"/></parameter></elements>
        <elements xsi:type="questionnaire:OptionType" option="Q1_1"/></elements>
      <elements xsi:type="questionnaire:SimpleStatement" type="greaterThan">
        <elements xsi:type="questionnaire:Function" name="sumDimension"><parameter name="dimension" type="Dimension"><elements xsi:type="questionnaire:DimensionType" dimension="D1"/></parameter></elements>
        <elements xsi:type="questionnaire:IntegerBasicType" value="2"/></elements>
    </elements>
    <elements xsi:type="questionnaire:SimpleStatement" type="equal">
      <elements xsi:type="questionnaire:Function" name="answered"><parameter name="question" type="Question"><elements xsi:type="questionnaire:QuestionType" question="Q1"/></parameter></elements>
      <elements xsi:type="questionnaire:BooleanBasicType" value="false"/></elements>
  </elements></show>`;

  it('sammensatte vis-uttrykk (nestet operator, sumDimension) beholdes uendret', () => {
    const xml = quiz('', `${Q1}<contains xsi:type="questionnaire:Question" code="Q2" question="Oppfølging" mandatory="false" template="Q1">${COMPOUND}</contains>`);
    const q2 = parseQuestionnaire(xml).sections[0].questions[1];
    const expr = q2.showExpressions?.[0];
    expect(expr?.logic).toBe('OR');
    // Editoren ser betingelsene også inne i den nestede operatoren
    expect(expr?.statements.map((st) => st.questionCode)).toContain('Q1');
    expect(expr?._raw && isCompoundXml(expr._raw.xml)).toBe(true);
    const out = serializeQuestionnaire(parseQuestionnaire(xml));
    expect(diffXml(xml, out).filter((d) => d.path.includes('show'))).toEqual([]);
    expect(out).toContain('name="sumDimension"');
  });

  it('et uttrykk som endres i Studio skrives fra modellen', () => {
    const q = parseQuestionnaire(quiz('', `${Q1}<contains xsi:type="questionnaire:Question" code="Q2" question="x" mandatory="false" template="Q1">${COMPOUND}</contains>`));
    const sec = q.sections[0];
    const q2 = sec.questions[1];
    const edited = { ...q2, showExpressions: [{ ...q2.showExpressions![0], statements: [{ questionCode: 'Q1', operator: 'EQ' as const, value: 'Q1_0' }] }] };
    const out = serializeQuestionnaire({ ...q, sections: [{ ...sec, questions: [sec.questions[0], edited] }] });
    expect(out).not.toContain('sumDimension');
    expect(out).toContain('option="Q1_0"');
  });

  it('textExpression, defaultOption, defaultResponseValue og vis-betingelse på alternativ beholdes', () => {
    const textExpr = '<textExpression><elements xsi:type="questionnaire:Function" name="if"><parameter name="condition" type="Expression"><elements xsi:type="questionnaire:BooleanBasicType" value="true"/></parameter></elements></textExpression>';
    const optShow = '<show><elements xsi:type="questionnaire:SimpleStatement" type="equal"><elements xsi:type="questionnaire:Function" name="answered"><parameter name="question" type="Question"><elements xsi:type="questionnaire:QuestionType" question="Q1"/></parameter></elements><elements xsi:type="questionnaire:BooleanBasicType" value="true"/></elements></show>';
    const xml = quiz('', `<contains xsi:type="questionnaire:Question" code="Q1" question="Spørsmål" mandatory="true" template="Q1" defaultOption="Q1_1" defaultResponseValue="1">${textExpr}</contains>`
      + `<contains xsi:type="questionnaire:Text" code="T1" content="Tekst" contentStyle="normal" align="left">${textExpr}</contains>`)
      .replace('label="Ja" score="1"/>', `label="Ja" score="1">${optShow}</option>`);
    const out = serializeQuestionnaire(parseQuestionnaire(xml));
    // (Fixturens score-/kode-attributter på malene er ikke det som testes her)
    const lost = diffXml(xml, out).filter((d) => d.kind === 'lost' && (d.path.includes('contains') || d.path.includes('/show')));
    expect(lost).toEqual([]);
    expect(out).toContain('defaultOption="Q1_1"');
    expect(out.match(/<textExpression>/g)).toHaveLength(2);
  });

  it('tom description og tom backgroundImage på seksjonen beholdes', () => {
    const xml = quiz(' description="" backgroundImage=""', Q1);
    const out = serializeQuestionnaire(parseQuestionnaire(xml));
    expect(out).toContain('description=""');
    expect(out).toContain('backgroundImage=""');
    expect(out).not.toContain('S1_TITLE');
  });
});
