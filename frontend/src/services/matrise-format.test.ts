// Syntetiske tester for matriseformatet: delte svarmaler, GridLayout/GridData og rekkefølge i seksjoner.
import { describe, it, expect } from 'vitest';
import { parseQuestionnaire } from './xml-parser';
import { serializeQuestionnaire } from './xml-serializer';
import { diffXml } from './xml-semantic-diff';
import type { Question, Section, TextOption } from '../types/questionnaire';
import { matrixProblems } from './matrix';
import { validateQuestionnaire } from './validate-questionnaire';

const NS = 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:questionnaire="http://questionnaire/1.0"';
const quiz = (templates: string, body: string) => `<?xml version="1.0" encoding="UTF-8"?>
<questionnaire:Questionnaire ${NS} code="MX" name="Matrise" version="1" language="norwegian">
  <responseTemplates>${templates}</responseTemplates>
  <section code="S1">${body}</section>
</questionnaire:Questionnaire>`;
const TXT = `<responseTemplate questions="F1 F2 F3" code="TXT" name="Fritekst"><widget xsi:type="questionnaire:StringInput" size="line"/></responseTemplate>`;
const RB = `<responseTemplate questions="R1 R2" code="QT1" name="Ofte"><widget xsi:type="questionnaire:Radiobutton"/>
  <option xsi:type="questionnaire:TextOption" code="QT1_0" value="0" label="Aldri"/>
  <option xsi:type="questionnaire:TextOption" code="QT1_1" value="1" label="Ofte"/></responseTemplate>`;
const field = (code: string, tpl = 'TXT', inner = '') =>
  `<contains xsi:type="questionnaire:Question" code="${code}" question="${code}" mandatory="false" template="${tpl}">${inner}</contains>`;

const roundTrip = (xml: string) => serializeQuestionnaire(parseQuestionnaire(xml));
const templateTag = (xml: string, code: string) => new RegExp(`<responseTemplate [^>]*code="${code}"[^>]*>`).exec(xml)?.[0] ?? '';

describe('matriseformat (syntetisk)', () => {
  it('delt StringInput-mal beholdes som én mal med navn og spørsmålsliste', () => {
    const xml = quiz(TXT, ['F1', 'F2', 'F3'].map((c) => field(c)).join(''));
    const out = roundTrip(xml);
    expect(out.match(/<responseTemplate /g)?.length).toBe(1);
    expect(templateTag(out, 'TXT')).toContain('questions="F1 F2 F3"');
    expect(templateTag(out, 'TXT')).toContain('name="Fritekst"');
    expect((out.match(/template="TXT"/g) ?? []).length).toBe(3);
    expect(diffXml(xml, out).filter((d) => d.path.includes('responseTemplate'))).toEqual([]);
  });

  it('spørsmål som får andre innstillinger i editoren, får egen mal uten å endre de andre', () => {
    const q = parseQuestionnaire(quiz(TXT, ['F1', 'F2', 'F3'].map((c) => field(c)).join('')));
    q.sections[0].questions = q.sections[0].questions.map((x) =>
      (x.code === 'F2' && x.type === 'stringInput' ? { ...x, size: 'XLARGE' } : x));
    const out = serializeQuestionnaire(q);
    expect(templateTag(out, 'TXT')).toContain('questions="F1 F3"');
    expect(templateTag(out, 'F2')).toContain('questions="F2"');
    expect(out).toMatch(/code="F2"[^>]*template="F2"/);
    expect(out).toContain('size="story"');
  });

  it('delt Radiobutton-mal beholder navn og koder', () => {
    const xml = quiz(RB, field('R1', 'QT1') + field('R2', 'QT1'));
    const out = roundTrip(xml);
    expect(templateTag(out, 'QT1')).toContain('name="Ofte"');
    expect(out.match(/<responseTemplate /g)?.length).toBe(1);
    expect(diffXml(xml, out).filter((d) => d.path.includes('responseTemplate') || d.attr === 'template')).toEqual([]);
  });

  it('GridLayout og GridData beholdes på seksjon, spørsmål, tekst og underseksjon', () => {
    const gd = (n: number) => `<layoutData xsi:type="questionnaire:GridData" horizontalSpan="${n}"/>`;
    const body = field('F1', 'TXT', gd(4))
      + `<contains xsi:type="questionnaire:Text" code="T1" content="Hei" contentStyle="normal" align="left">${gd(2)}</contains>`
      + `<contains xsi:type="questionnaire:Section" code="S2" requiresNewPage="false">${gd(8)}${field('F2')}<layout xsi:type="questionnaire:GridLayout"/></contains>`
      + '<layout xsi:type="questionnaire:GridLayout"/>';
    const xml = quiz(TXT.replace('F1 F2 F3', 'F1 F2'), body);
    const q = parseQuestionnaire(xml);
    expect(q.sections[0].layout).toEqual({ type: 'questionnaire:GridLayout' });
    expect(q.sections[0].questions[0].layoutData).toEqual({ type: 'questionnaire:GridData', attrs: { horizontalSpan: '4' } });
    const out = serializeQuestionnaire(q);
    expect(diffXml(xml, out).filter((d) => d.path.includes('layout'))).toEqual([]);
    expect(out.match(/<layout xsi:type="questionnaire:GridLayout"\/>/g)?.length).toBe(2);
  });

  it('spørsmål og underseksjoner beholder rekkefølgen fra fila', () => {
    const sub = (code: string, q: string) => `<contains xsi:type="questionnaire:Section" code="${code}" matrix="true">${field(q)}</contains>`;
    const xml = quiz(TXT, field('F1') + sub('S2', 'F2') + field('F3') + sub('S3', 'F4'));
    const out = roundTrip(xml);
    const order = [...out.matchAll(/<contains xsi:type="questionnaire:(?:Question|Section)" code="([^"]+)"/g)].map((m) => m[1]);
    expect(order).toEqual(['F1', 'S2', 'F2', 'F3', 'S3', 'F4']);
    expect(diffXml(xml, out).filter((d) => d.kind === 'order')).toEqual([]);
  });

  it('flytting i editoren vinner over rekkefølgen fra fila', () => {
    const sub = `<contains xsi:type="questionnaire:Section" code="S2">${field('F2')}</contains>`;
    const q = parseQuestionnaire(quiz(TXT, field('F1') + sub + field('F3')));
    const sec: Section = q.sections[0];
    const [f1, f3] = sec.questions;
    const moved: Question[] = [f3, f1];
    const out = serializeQuestionnaire({ ...q, sections: [{ ...sec, questions: moved }] });
    const order = [...out.matchAll(/<contains xsi:type="questionnaire:(?:Question|Section)" code="([^"]+)"/g)].map((m) => m[1]);
    expect(order).toEqual(['F3', 'S2', 'F2', 'F1']);
  });

  it('diffXml melder endret rekkefølge på contains, men ikke på spørsmålslister', () => {
    const a = quiz(TXT, field('F1') + field('F2'));
    const b = quiz(TXT.replace('F1 F2 F3', 'F3 F2 F1'), field('F2') + field('F1'));
    const d = diffXml(a, b);
    expect(d.filter((x) => x.kind === 'order')).toHaveLength(1);
    expect(d.filter((x) => x.attr === 'questions')).toEqual([]);
  });

  it('seksjon med bare description får ingen ny synlig overskrift ved eksport', () => {
    const xml = quiz(TXT, field('F1')).replace('<section code="S1">', '<section code="S1" description="Bare beskrivelse">');
    const q = parseQuestionnaire(xml);
    expect(q.sections[0].titles.NO).toBe('Bare beskrivelse');
    const out = serializeQuestionnaire(q);
    expect(out).not.toContain('S1_TITLE');
    expect(out).toContain('description="Bare beskrivelse"');
    // Seksjoner laget i Studio får fortsatt overskriftselementet
    const fresh = serializeQuestionnaire({ ...q, sections: [{ ...q.sections[0], titleFromDescription: undefined }] });
    expect(fresh).toContain('code="S1_TITLE"');
  });

  it('i en matrise deler spørsmål med like innstillinger én mal automatisk', () => {
    const q = parseQuestionnaire(quiz('', ''));
    const base = { required: false, texts: { NO: 'x' } as Question['texts'] };
    const opts: TextOption[] = [
      { code: 'A0', score: 0, texts: { NO: 'Nei' } as TextOption['texts'] },
      { code: 'A1', score: 1, texts: { NO: 'Ja' } as TextOption['texts'] },
    ];
    const questions: Question[] = [
      { ...base, id: 'f1', code: 'F1', type: 'stringInput', size: 'MEDIUM' },
      { ...base, id: 'f2', code: 'F2', type: 'stringInput', size: 'MEDIUM' },
      { ...base, id: 'r1', code: 'R1', type: 'radiobutton', options: [...opts] },
      { ...base, id: 'r2', code: 'R2', type: 'radiobutton', options: [...opts] },
    ];
    const sec = { ...q.sections[0], matrix: true, questions };
    const out = serializeQuestionnaire({ ...q, sections: [sec] });
    expect(out.match(/<responseTemplate /g)?.length).toBe(2);
    expect(templateTag(out, 'F1')).toContain('questions="F1 F2"');
    expect(templateTag(out, 'R1')).toContain('questions="R1 R2"');
    expect(out).toMatch(/code="R2"[^>]*template="R1"/);
    // Utenfor matrise får hvert spørsmål sin egen mal som før
    const plain = serializeQuestionnaire({ ...q, sections: [{ ...sec, matrix: undefined }] });
    expect(plain.match(/<responseTemplate /g)?.length).toBe(4);
  });

  it('validering: ulike maler er feil, tekst som ikke står først er advarsel', () => {
    const body = '<contains xsi:type="questionnaire:Text" code="T0" content="Intro" contentStyle="normal"/>'
      + field('R1', 'QT1') + field('F1') + '<contains xsi:type="questionnaire:Text" code="T2" content="Midt" contentStyle="normal"/>';
    const q = parseQuestionnaire(quiz(RB + TXT, body).replace('<section code="S1">', '<section code="S1" matrix="true">'));
    const kinds = matrixProblems(q.sections[0], q.defaultLanguage).map((p) => p.kind).sort();
    expect(kinds).toEqual(['MIXED_TEMPLATES', 'TEXT_NOT_FIRST']);
    const issues = validateQuestionnaire(q, 'NO').filter((i) => i.message.includes('matrise'));
    expect(issues.map((i) => i.severity).sort()).toEqual(['error', 'warning']);
    expect(issues.find((i) => i.severity === 'error')?.message).toContain('R1, F1');
  });

  it('validering: gyldig matrise gir ingen matrisemeldinger, og tittel teller som første tekst', () => {
    const body = '<contains xsi:type="questionnaire:Text" code="T0" content="Intro" contentStyle="normal"/>' + field('R1', 'QT1') + field('R2', 'QT1');
    const q = parseQuestionnaire(quiz(RB, body).replace('<section code="S1">', '<section code="S1" matrix="true">'));
    expect(matrixProblems(q.sections[0], q.defaultLanguage)).toEqual([]);
    const titled = { ...q.sections[0], titles: { NO: 'Overskrift' } as Section['titles'] };
    expect(matrixProblems(titled, q.defaultLanguage).map((p) => p.kind)).toEqual(['TEXT_NOT_FIRST']);
    expect(matrixProblems({ ...titled, questions: [] }, q.defaultLanguage).map((p) => p.kind)).toEqual(['EMPTY']);
  });
});
