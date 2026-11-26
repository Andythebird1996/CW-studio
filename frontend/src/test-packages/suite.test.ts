import { describe, it, expect, beforeAll } from 'vitest';
import { lintRap, engineEchoPerLine } from '../services/rap-interpreter';
import { parseQuestionnaire } from '../services/xml-parser';
import { buildSuite, simulateSet, unzipText, loadPackageFiles, TEST_AREAS, type BuiltTestPackage } from './suite';

let suite: BuiltTestPackage[] = [];
const files = new Map<string, Record<string, string>>();

beforeAll(async () => {
  suite = await buildSuite({ date: '20261125', release: '0' });
  for (const p of suite) files.set(p.def.code, await unzipText(p.built.base64));
});

describe('testpakke-generator', () => {
  it('bygger én pakke per område med riktige koder', () => {
    expect(suite.map((p) => p.def.area)).toEqual(TEST_AREAS);
    expect(suite.map((p) => p.def.code)).toEqual(TEST_AREAS.map((a) => `andreastest-${a}-20261125`));
    for (const p of suite) expect(p.built.fileName).toBe(`${p.def.code}_v1.0.zip`);
  });

  it('pakkene har ingen kjente installasjonsfeil (ramme, headere, media, rapportsyntaks)', () => {
    for (const p of suite) {
      expect(p.built.calcsMissingQuestionnaireRef, p.def.code).toEqual([]);
      expect(p.built.rapsMissingHeaders, p.def.code).toEqual([]);
      expect(p.built.rapsMissingFrame, p.def.code).toEqual([]);
      expect(p.built.unsupportedMedia, p.def.code).toEqual([]);
      expect(p.built.rapLint, p.def.code).toEqual({});
    }
  });

  it('all XML i pakkene er gyldig', () => {
    for (const [code, f] of files) {
      for (const [k, content] of Object.entries(f)) {
        if (k.endsWith('.rap')) continue;
        const doc = new DOMParser().parseFromString(content, 'application/xml');
        expect(doc.getElementsByTagName('parsererror').length, `${code}: ${k}`).toBe(0);
      }
    }
  });

  it('kartleggingen leses tilbake med alle spørsmål', () => {
    for (const p of suite) {
      const q = loadPackageFiles(files.get(p.def.code) ?? {});
      const codes = (s: typeof q.sections): string[] => s.flatMap((x) => [...x.questions.map((qq) => qq.code), ...codes(x.subSections ?? [])]);
      expect(codes(q.sections), p.def.code).toEqual(codes(p.def.questionnaire.sections));
    }
  });

  it('forventede verdier stemmer med Studios simulator for hvert svarsett', () => {
    for (const p of suite) {
      const f = files.get(p.def.code) ?? {};
      for (const set of p.def.answerSets) {
        const sim = simulateSet(f, set);
        const where = `${p.def.code}/${set.name}`;
        for (const [k, v] of Object.entries(set.calculations)) expect(sim.calculations[k], `${where} ${k}`).toBeCloseTo(v, 6);
        expect(Object.keys(sim.calculations).sort(), where).toEqual(Object.keys(set.calculations).sort());
        expect(sim.flags, where).toEqual(set.flags);
        for (const lang of ['NO', 'EN'] as const) {
          for (const line of set.report[lang] ?? []) expect(sim.report[lang], `${where} ${lang}`).toContain(line);
          for (const line of set.reportAbsent?.[lang] ?? []) expect(sim.report[lang], `${where} ${lang}`).not.toContain(line);
        }
      }
    }
  });

  it('expected.json har samme svarsett og verdier som definisjonen', () => {
    for (const p of suite) {
      expect(p.expected.svarsett.map((s) => s.navn)).toEqual(p.def.answerSets.map((s) => s.name));
      expect(p.expected.zip).toBe(p.built.fileName);
      for (const s of p.expected.svarsett) expect(Object.keys(s.svar).length).toBeGreaterThan(0);
    }
  });
});

describe('testpakkene i ekte Checkware-format', () => {
  const quiz = (area: string) => {
    const f = files.get(`andreastest-${area}-20261125`) ?? {};
    return f[Object.keys(f).find((k) => k.endsWith('.questionnaire')) ?? ''] ?? '';
  };

  it('spørsmålstyper: line/multiline/story, slider, tall, dato med og uten årsgrenser', () => {
    const x = quiz('sporsmal');
    for (const s of ['size="line"', 'size="multiline"', 'size="story"']) expect(x).toContain(s);
    expect(x).toContain('minValue="0.0" maxValue="10.0" step="0.1"');
    expect(x).toContain('minValue="0.0" maxValue="100.0" step="5.0" labelStep="25.0"');
    expect(x).toContain('<widget xsi:type="questionnaire:DateInput" minAbsoluteYear="1900" maxAbsoluteYear="2100" addTime="false" addDate="true"/>');
    expect(x).toContain('<widget xsi:type="questionnaire:DateInput" addTime="true" addDate="true"/>');
    expect(x).toMatch(/code="RO1"[^>]*readonly="true"/);
    expect(x).toMatch(/code="V1"[^>]*voluntary="true"/);
    expect(x).toMatch(/code="RS1"[^>]*reversedScore="true"/);
    expect(x).toContain('<widget xsi:type="questionnaire:Checkbox" limit="2"/>');
    expect(x).toContain('<widget xsi:type="questionnaire:Radiobutton" numberOfColumns="2"/>');
  });

  it('media: ImageElement/AudioVideo og seksjonsbilder', () => {
    const x = quiz('media');
    expect(x).toContain('<contains xsi:type="questionnaire:ImageElement" code="IM1" imageFile="andreastest-bilde.png"/>');
    expect(x).toContain('<contains xsi:type="questionnaire:ImageElement" code="IM2" imageFile="andreastest-bilde.jpg"/>');
    expect(x).toContain('<contains xsi:type="questionnaire:AudioVideo" code="AV1" audioVideoFile="andreastest-lyd.mp3"/>');
    expect(x).toContain('backgroundImage="andreastest-seksjon.png"');
    const p = suite.find((s) => s.def.area === 'media');
    expect(p?.built.files.filter((f) => f.path === 'media').map((f) => f.fileName).sort()).toEqual(
      ['andreastest-bilde.jpg', 'andreastest-bilde.png', 'andreastest-dokument.pdf', 'andreastest-lyd.mp3', 'andreastest-seksjon.png'],
    );
  });

  it('flyt: ny side, vis/skjul på spørsmål, tekst og seksjon', () => {
    const x = quiz('flyt');
    expect(x.match(/requiresNewPage="true"/g)?.length).toBe(2);
    expect(x).toMatch(/<contains xsi:type="questionnaire:Text" code="TX1"[^>]*><show/);
    expect(x).toMatch(/<section code="S3"[^>]*>\s*<show/);
    expect(x).toMatch(/code="F3"[^>]*>[^]*?<hide/);
  });

  it('rapport: to grafer på norsk, én på engelsk i simulatoren', () => {
    const p = suite.find((x) => x.def.area === 'rapport');
    const sim = simulateSet(files.get(p?.def.code ?? '') ?? {}, p?.def.answerSets[0] ?? { name: '', description: '', answers: {}, calculations: {}, flags: {}, report: {} });
    expect(sim.report.NO?.match(/<svg/g)?.length).toBe(2);
    expect(sim.report.EN?.match(/<svg/g)?.length).toBe(1);
  });

  it('oversettelse: alle tekster har engelsk oversettelse', () => {
    const f = files.get('andreastest-oversettelse-20261125') ?? {};
    const tr = f[Object.keys(f).find((k) => k.endsWith('_EN.translation')) ?? ''] ?? '';
    for (const c of ['entity="Questionnaire" property="name"', 'code="S1" entity="Section"', 'code="S1_TITLE" entity="Text" property="content"', 'code="TX1" entity="Text" property="content"',
      'code="R1" entity="Question"', 'code="C1_2" entity="TextOption"', 'code="K1_1" entity="TextOption"', 'code="N1" entity="Question"']) {
      expect(tr).toContain(c);
    }
    expect(tr.match(/translatedText="(?!\[EN\])/g) ?? []).toEqual([]);
  });

  it('seksjonsoverskrifter eksporteres som Text-element først i seksjonen og leses tilbake som tittel', () => {
    for (const p of suite) {
      const f = files.get(p.def.code) ?? {};
      const xml = f[Object.keys(f).find((k) => k.endsWith('.questionnaire')) ?? ''] ?? '';
      for (const sec of p.def.questionnaire.sections) {
        const re = new RegExp(`<section code="${sec.code}"[^>]*>\\s*(?:<(?:show|hide)\\b[\\s\\S]*?</(?:show|hide)>\\s*)*<contains xsi:type="questionnaire:Text" code="${sec.code}_TITLE" content="([^"]*)" contentStyle="heading2"`);
        expect(xml.match(re)?.[1], `${p.def.code}/${sec.code}`).toBe(sec.titles.NO);
      }
      const back = loadPackageFiles(f);
      expect(back.sections.map((s) => s.titles.NO), p.def.code).toEqual(p.def.questionnaire.sections.map((s) => s.titles.NO));
    }
    const tr = loadPackageFiles(files.get('andreastest-oversettelse-20261125') ?? {});
    expect(tr.sections.map((s) => s.titles.EN)).toEqual(['[EN] English section 1', '[EN] English section 2']);
  });

  it('import fjerner bare overskrift-elementet med seksjonens egen kode', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><questionnaire:Questionnaire xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:questionnaire="http://www.checkware.no/questionnaire" code="X" name="X">
<section code="S1"><contains xsi:type="questionnaire:Text" code="T1" content="Ekte overskrift" contentStyle="heading1"/></section></questionnaire:Questionnaire>`;
    const q = parseQuestionnaire(xml);
    expect(q.sections[0].questions.map((x) => x.code)).toEqual(['T1']);
  });

  it('ECHO: lint varsler flere per linje, og simulatoren gjør som rapportmotoren', () => {
    const rap = '[$A = eval("1")]\n<p>[ECHO($A,1)] [ECHO($B,0)]</p>\n<p>[ECHO($B,0)]</p>';
    expect(lintRap(rap).filter((i) => i.code === 'MULTI_ECHO').map((i) => i.line)).toEqual([2]);
    expect(engineEchoPerLine(rap).split('\n')[1]).toBe('<p>[ECHO($A,1)] [ECHO($A,1)]</p>');
    expect(engineEchoPerLine(rap).split('\n')[2]).toBe('<p>[ECHO($B,0)]</p>');
  });
});
