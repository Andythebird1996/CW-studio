// Endetekster, vedlegg, lyd, dokumentlenker, telling/nestede beregninger/normer og nytt filnavn på medier (syntetisk).
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { parseQuestionnaire, parseCalculationFile, applyTranslationFile, manifestFileId, parseManifestFile } from './xml-parser';
import { serializeQuestionnaire, serializeCalculation, serializeTranslation } from './xml-serializer';
import { buildPackageZip, questionnaireFileName, renameQuestionnaireRefs } from './package-builder';
import { importPackageFiles, type PackageFileInput } from './package-import';
import { findMediaReferences, mediaRenameError, renameMediaFile, type MediaPackageState } from './media-rename';
import { simulateCalculation, type SimAnswer, type SimContext } from './rap-interpreter';
import type { Calculation, LanguageType, MediaFile, Question, Questionnaire, SliderQuestion } from '../types/questionnaire';

const L = (no: string, en?: string) => ({ NO: no, ...(en !== undefined && { EN: en }) }) as Record<LanguageType, string>;
const media = (fileName: string, mimeType: string): MediaFile => ({
  fileName, extension: fileName.split('.').pop() ?? '', mimeType, dataUrl: `data:${mimeType};base64,AAAA`, sizeKb: 1,
});

function base(questions: Question[], extra: Partial<Questionnaire> = {}): Questionnaire {
  return {
    code: 'EL', name: L('Elementer', '[EN] Elements'), version: '1', release: '0', type: 'QUESTIONNAIRE',
    defaultLanguage: 'NO', supportedLanguages: ['NO', 'EN'],
    sections: [{ id: 's1', code: 'S1', type: 'NORMAL', titles: L('S1'), questions }],
    ...extra,
  } as Questionnaire;
}

const slider: SliderQuestion = {
  id: 'sl1', code: 'SL1', type: 'slider', min: 0, max: 10, step: 1, required: true, texts: L('Smerte', '[EN] Pain'),
  valueLabels: [
    { code: 'SL1-VL1', value: 0, texts: L('Ingen', '[EN] None') },
    { code: 'SL1-VL2', value: 10, texts: L('Verst', '[EN] Worst') },
  ],
} as SliderQuestion;

async function zipToFiles(base64: string): Promise<PackageFileInput[]> {
  const zip = await JSZip.loadAsync(base64, { base64: true });
  const out: PackageFileInput[] = [];
  for (const [k, f] of Object.entries(zip.files)) {
    if (f.dir) continue;
    const fileName = k.split('/').pop() ?? k;
    const extension = fileName.includes('.') ? fileName.split('.').pop() ?? '' : '';
    const isMedia = k.startsWith('media/');
    out.push({ fileName, extension, content: await f.async(isMedia ? 'base64' : 'string'), encoding: isMedia ? 'base64' : 'text' });
  }
  return out;
}

describe('endetekster på skyveknapp (TextValueLabel)', () => {
  it('skrives i svarmalen og leses tilbake', () => {
    const xml = serializeQuestionnaire(base([slider]));
    expect(xml).toContain('<valueLabel xsi:type="questionnaire:TextValueLabel" code="SL1-VL1" value="0" label="Ingen"/>');
    expect(xml).toContain('<valueLabel xsi:type="questionnaire:TextValueLabel" code="SL1-VL2" value="10" label="Verst"/>');
    const back = parseQuestionnaire(xml).sections[0].questions[0] as SliderQuestion;
    expect(back.valueLabels?.map((v) => [v.code, v.value, v.texts?.NO])).toEqual([['SL1-VL1', 0, 'Ingen'], ['SL1-VL2', 10, 'Verst']]);
  });

  it('oversettes med entity="TextValueLabel" property="label"', () => {
    const q = base([slider]);
    const tr = serializeTranslation(q, 'EN', 'EL');
    expect(tr).toContain('code="SL1-VL1" entity="TextValueLabel" property="label" originalText="Ingen" translatedText="[EN] None"');
    const back = applyTranslationFile(parseQuestionnaire(serializeQuestionnaire(q)), tr);
    const s = back.sections[0].questions[0] as SliderQuestion;
    expect(s.valueLabels?.map((v) => v.texts?.EN)).toEqual(['[EN] None', '[EN] Worst']);
  });

  it('skyveknapper med ulike endetekster deler ikke svarmal', () => {
    const other = { ...slider, id: 'sl2', code: 'SL2', valueLabels: [{ code: 'SL2-VL1', value: 0, texts: L('Aldri') }] } as SliderQuestion;
    const xml = serializeQuestionnaire(base([slider, other]));
    expect(xml.match(/<responseTemplate /g)?.length).toBe(2);
  });
});

describe('vedlegg, lyd og dimensjonsnavn', () => {
  it('Attachment med filtype og grenser overlever eksport og import', () => {
    const att = { id: 'v1', code: 'V1', type: 'attachment', fileType: 'DOCUMENT', maxFiles: 5, maxFileSize: 2000, required: false, texts: L('Last opp') } as Question;
    const xml = serializeQuestionnaire(base([att]));
    expect(xml).toContain('<contains xsi:type="questionnaire:Attachment" code="V1" text="Last opp" maxFiles="5" maxFileSize="2000" fileType="DOCUMENT"/>');
    const back = parseQuestionnaire(xml).sections[0].questions[0];
    expect(back).toMatchObject({ type: 'attachment', fileType: 'DOCUMENT', maxFiles: 5, maxFileSize: 2000 });
    expect(serializeTranslation(base([att]), 'EN', 'EL')).not.toContain('code="V1"');
  });

  it('lyd fra URL og fra fil', () => {
    const av = (code: string, mediaFile: string) => ({ id: code, code, type: 'audioVideo', mediaFile, required: false, texts: L('') }) as Question;
    const xml = serializeQuestionnaire(base([av('A1', 'lyd.mp3'), av('A2', 'https://www.youtube.com/watch?v=x')]));
    expect(xml).toContain('audioVideoFile="lyd.mp3"');
    expect(xml).toContain('audioVideoFile="https://www.youtube.com/watch?v=x"');
  });

  it('tomt dimensjonsnavn og manglende navn beholdes', () => {
    const q = base([slider], { dimensions: [
      { code: 'D1', name: '', questionCodes: ['SL1'] },
      { code: 'D2', name: '', _noName: true, questionCodes: ['SL1'] },
    ] });
    const xml = serializeQuestionnaire(q);
    expect(xml).toContain('<dimension code="D1" name="" question="SL1"/>');
    expect(xml).toContain('<dimension code="D2" question="SL1"/>');
    const back = parseQuestionnaire(xml).dimensions;
    expect(back?.map((d) => [d.code, d.name, !!d._noName])).toEqual([['D1', '', false], ['D2', '', true]]);
  });
});

describe('telling, nestede beregninger og normer', () => {
  const qs = ['C1', 'C2', 'C3'].map((code) => ({
    id: code, code, type: 'radiobutton', required: false, texts: L(code),
    options: [0, 1, 2, 3].map((i) => ({ code: `${code}_${i}`, score: i, texts: L(`${i}`) })),
  }) as Question);
  const q = base(qs);
  const calcs: Calculation[] = [
    { code: 'RAW', name: 'RAW', type: 'SUM', innerCalculations: qs.map((x) => ({ questionCode: x.code })) },
    { code: 'N', name: 'N', type: 'COUNT', innerCalculations: qs.map((x) => ({ questionCode: x.code })) },
    { code: 'NEST', name: 'NEST', type: 'SUM', innerCalculations: [{ calculationCode: 'RAW', multiplier: 2 }, { calculationCode: 'N' }, { constantValue: 1 }] },
    { code: 'T', name: 'T', type: 'SUM', normCode: 'NT', innerCalculations: [{ calculationCode: 'RAW' }] },
  ];

  it('skrives i samme mønstre som ekte pakker', () => {
    const [, n, nest, t] = calcs.map((c) => serializeCalculation(c, 'EL'));
    expect(n).toContain('name="answered"');
    expect(n).toContain('<elements xsi:type="questionnaire:BooleanBasicType" value="true"/>');
    expect(nest).toContain('<elements xsi:type="questionnaire:CalculationType" name="RAW"/>');
    expect(nest).toContain('<elements xsi:type="questionnaire:NumberBasicType" value="1"/>');
    expect(t).toContain('<calculationExpression xsi:type="questionnaire:Function" name="normLookup">');
    expect(t).toContain('<elements xsi:type="questionnaire:NormType" name="NT"/>');
    expect(t).not.toContain('norm="');
  });

  it('leses tilbake med type, ledd og norm', () => {
    for (const c of calcs) {
      const back = parseCalculationFile(serializeCalculation(c, 'EL'), q);
      expect(back?.type, c.code).toBe(c.type);
      expect(back?.normCode, c.code).toBe(c.normCode);
      expect(back?.innerCalculations.map((ic) => [ic.questionCode, ic.calculationCode, ic.constantValue, ic.multiplier ?? 1]), c.code)
        .toEqual(c.innerCalculations.map((ic) => [ic.questionCode, ic.calculationCode, ic.constantValue, ic.multiplier ?? 1]));
    }
  });

  it('simulatoren regner nestet, telling og norm', () => {
    const withCalcs: Questionnaire = { ...q, calculations: { calculations: calcs, norms: [
      { code: 'NT', name: 'NT', type: 'NORM', data: [{ score: 0, normValue: 30 }, { score: 3, normValue: 40 }, { score: 6, normValue: 50 }] },
    ] } };
    const answers = new Map<string, SimAnswer>([['C1', { score: 3, text: '3' }], ['C3', { score: 1, text: '1' }]]);
    const ctx: SimContext = { questionnaire: withCalcs, answers, patient: { name: 'Test', dob: '1990-01-01', gender: 2 } };
    expect(simulateCalculation('RAW', ctx)).toBe(4);
    expect(simulateCalculation('N', ctx)).toBe(2);
    expect(simulateCalculation('NEST', ctx)).toBe(11);
    expect(simulateCalculation('T', ctx)).toBe(40);
  });

  it('eldre norm-attributt leses fortsatt', () => {
    const old = serializeCalculation(calcs[0], 'EL').replace('name="RAW">', 'name="RAW" norm="../norms/GAMMEL.norm">');
    expect(parseCalculationFile(old, q)?.normCode).toBe('GAMMEL');
  });
});

describe('dokumentlenker og filnavn i manifestet', () => {
  it('reference bruker manifest-id med * for mellomrom og leses tilbake til filnavn', async () => {
    expect(manifestFileId('Min veileder.pdf')).toBe('Min*veileder.pdf');
    const q = base([slider]);
    const built = await buildPackageZip(q, {}, [media('Min veileder.pdf', 'application/pdf')], { code: 'EL', isPublic: false, documentLinks: ['Min veileder.pdf'] });
    const files = await zipToFiles(built.base64);
    const manifest = files.find((f) => f.extension === 'manifest')?.content ?? '';
    expect(manifest).toMatch(/fileName="EL\.questionnaire"[^>]*reference="Min\*veileder\.pdf"/);
    expect(manifest).toContain('id="Min*veileder.pdf"');
    expect(parseManifestFile(manifest)?.documentLinks).toEqual(['Min veileder.pdf']);
    expect(importPackageFiles(files).packageMetadata?.documentLinks).toEqual(['Min veileder.pdf']);
  });

  it('kartleggingen beholder filnavnet sitt til koden endres', () => {
    const pm = { code: 'EL', isPublic: false, sourceFileNames: { questionnaire: { fileName: 'Gammelt navn.questionnaire', code: 'EL' } } };
    expect(questionnaireFileName(base([]), pm)).toBe('Gammelt navn.questionnaire');
    expect(questionnaireFileName({ ...base([]), code: 'NY' }, pm)).toBe('NY.questionnaire');
    const calc = '<questionnaire href="../quiz/Gammelt navn.questionnaire#EL"/><question href="../quiz/Gammelt navn.questionnaire#Q1"/>';
    expect(renameQuestionnaireRefs(calc, 'Gammelt navn.questionnaire', 'NY.questionnaire'))
      .toBe('<questionnaire href="../quiz/NY.questionnaire#EL"/><question href="../quiz/NY.questionnaire#Q1"/>');
  });
});

describe('nytt navn på mediefil oppdaterer alle referanser', () => {
  const state = (): MediaPackageState => ({
    questionnaire: base([]),
    rapFiles: { r: '<img src="bilde.png"><img src="media/bilde.png?x=1"><img src="annet-bilde.png"><p>bilde.png i tekst</p>' },
    mediaFiles: [media('bilde.png', 'image/png'), media('lyd.mp3', 'audio/mpeg'), media('veileder.pdf', 'application/pdf'), media('opptatt.png', 'image/png')],
    packageMetadata: { code: 'EL', isPublic: false, documentLinks: ['veileder.pdf'], sourceFileNames: { order: ['EL.questionnaire', 'bilde.png'] } },
  });

  const full = (): MediaPackageState => {
    const s = state();
    return {
      ...s,
      questionnaire: {
        ...s.questionnaire,
        sections: [
          { id: 's1', code: 'S1', type: 'NORMAL', titles: L('S1'), backgroundImage: 'bilde.png', questions: stateQuestions() },
        ],
      },
    };
  };
  function stateQuestions(): Question[] {
    return [
      { id: 'i1', code: 'I1', type: 'image', imageSrc: 'bilde.png', required: false, texts: L('') } as Question,
      { id: 'a1', code: 'A1', type: 'audioVideo', mediaFile: 'lyd.mp3', required: false, texts: L('') } as Question,
      { id: 'r1', code: 'R1', type: 'radiobutton', required: true, texts: L('Velg'), options: [
        { code: 'R1_0', score: 0, imageFile: 'bilde.png', texts: L('A') }, { code: 'R1_1', score: 1, texts: L('B') }] } as Question,
      { ...slider, valueLabels: [{ code: 'SL1-VL1', value: 0, imageFile: 'bilde.png' }] } as SliderQuestion,
      { id: 't1', code: 'T1', type: 'text', isQuestion: false, required: false, texts: L('<img src="bilde.png"> og bilde.png.gammel', '<img src="bilde.png">') } as Question,
    ];
  }

  it('finner alle stedene fila brukes', () => {
    const kinds = findMediaReferences(full(), 'bilde.png').map((r) => r.kind).sort();
    expect(kinds).toEqual(expect.arrayContaining(['background', 'image', 'option', 'valueLabel', 'text', 'report']));
    expect(findMediaReferences(full(), 'veileder.pdf').map((r) => r.kind)).toEqual(['documentLink']);
    expect(findMediaReferences(full(), 'ubrukt.png')).toEqual([]);
  });

  it('avviser ugyldige navn', () => {
    const s = full();
    expect(mediaRenameError(s, 'bilde.png', '  ')).toBe('empty');
    expect(mediaRenameError(s, 'bilde.png', 'opptatt.png')).toBe('exists');
    expect(mediaRenameError(s, 'bilde.png', 'bilde.jpg')).toBe('extension');
    expect(mediaRenameError(s, 'bilde.png', 'mappe/bilde.png')).toBe('invalid');
    expect(mediaRenameError(s, 'bilde.png', 'nytt bilde.png')).toBeNull();
    expect(renameMediaFile(s, 'bilde.png', 'opptatt.png')).toBe(s);
  });

  it('bilde: element, seksjon, alternativ, verdietikett, tekst, rapport, rekkefølge og mediefil', () => {
    const r = renameMediaFile(full(), 'bilde.png', 'nytt bilde.png');
    const sec = r.questionnaire.sections[0];
    const [i1, , r1, sl, t1] = sec.questions;
    expect(sec.backgroundImage).toBe('nytt bilde.png');
    expect(i1).toMatchObject({ imageSrc: 'nytt bilde.png' });
    expect('options' in r1 && r1.options?.[0].imageFile).toBe('nytt bilde.png');
    expect((sl as SliderQuestion).valueLabels?.[0].imageFile).toBe('nytt bilde.png');
    expect(t1.texts).toEqual({ NO: '<img src="nytt bilde.png"> og bilde.png.gammel', EN: '<img src="nytt bilde.png">' });
    expect(r.rapFiles?.r).toBe('<img src="nytt bilde.png"><img src="media/nytt bilde.png?x=1"><img src="annet-bilde.png"><p>bilde.png i tekst</p>');
    expect(r.mediaFiles?.map((m) => m.fileName)).toEqual(['nytt bilde.png', 'lyd.mp3', 'veileder.pdf', 'opptatt.png']);
    expect(r.packageMetadata?.sourceFileNames?.order).toEqual(['EL.questionnaire', 'nytt bilde.png']);
    expect(findMediaReferences(r, 'bilde.png')).toEqual([]);
  });

  it('lyd og dokumentlenke', () => {
    const a = renameMediaFile(full(), 'lyd.mp3', 'tone.mp3');
    expect(a.questionnaire.sections[0].questions[1]).toMatchObject({ mediaFile: 'tone.mp3' });
    const d = renameMediaFile(full(), 'veileder.pdf', 'Brukerveiledning.pdf');
    expect(d.packageMetadata?.documentLinks).toEqual(['Brukerveiledning.pdf']);
  });

  it('nytt navn følger med gjennom eksport og import', async () => {
    const r = renameMediaFile(full(), 'veileder.pdf', 'Ny veileder.pdf');
    const built = await buildPackageZip(r.questionnaire, r.rapFiles, r.mediaFiles, r.packageMetadata);
    const files = await zipToFiles(built.base64);
    expect(files.some((f) => f.fileName === 'Ny veileder.pdf')).toBe(true);
    const imp = importPackageFiles(files);
    expect(imp.packageMetadata?.documentLinks).toEqual(['Ny veileder.pdf']);
  });
});
