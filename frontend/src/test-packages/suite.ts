/**
 * Testpakke-generator: én syntetisk Checkware-pakke per funksjonsområde, bygget med Studios egen
 * pakkebygger (samme kodevei som eksport/publisering), og en fil med forventede verdier per pakke.
 *
 * Kun syntetisk innhold – ingen lisensierte skjemaer og ingen påloggingsdetaljer.
 * Bygg alle zip-filer med `bun run test-packages` (se build-cli.ts).
 */
import JSZip from 'jszip';
import { buildPackageZip, type BuiltPackage } from '../services/package-builder';
import { parseQuestionnaire, parseCalculationFile, parseFlagFile, applyTranslationFile } from '../services/xml-parser';
import { interpretRap, simulateCalculation, simulateFlag, type SimAnswer, type SimContext } from '../services/rap-interpreter';
import type {
  Calculation, Flag, LanguageType, MediaFile, Question, Questionnaire, Section, ShowExpression, TextOption,
} from '../types/questionnaire';
import { JPEG_BASE64, MP3_BASE64, makePdf, makePng, mediaFile, toBase64 } from './fixtures';

// ── Typer ────────────────────────────────────────────────────────────────────

export type TestArea = 'sporsmal' | 'beregning' | 'rapport' | 'media' | 'oversettelse' | 'flyt' | 'matrise';

/** Svar på ett spørsmål: alternativkode(r) for valgspørsmål, ellers rå verdi (tekst/tall/dato). */
export type TestAnswer = string | string[];

export interface AnswerSet {
  name: string;
  description: string;
  answers: Record<string, TestAnswer>;
  /** Forventede beregnede verdier (fra Checkware: rå tall, rapport viser 2 desimaler) */
  calculations: Record<string, number>;
  /** Forventet utfall per flagg (nettleserens/serverens flaggberegning) */
  flags: Record<string, boolean>;
  /** Linjer som skal finnes i rapporten, per språk */
  report: Partial<Record<'NO' | 'EN', string[]>>;
  /** Linjer som IKKE skal finnes i rapporten, per språk */
  reportAbsent?: Partial<Record<'NO' | 'EN', string[]>>;
  /** Hva som skal sjekkes i nettleseren for akkurat dette svarsettet */
  browser?: string[];
}

export interface TestPackageDef {
  area: TestArea;
  code: string;
  name: string;
  description: string;
  questionnaire: Questionnaire;
  /** Rapportkode → innhold (rapporter med `$language en` er engelske) */
  reports: Record<string, string>;
  media: MediaFile[];
  answerSets: AnswerSet[];
  /** Sjekker i nettleseren som gjelder hele pakken */
  browserChecks: string[];
  /** Kjente usikkerheter / ting Studio ikke kan teste */
  notes: string[];
}

export interface SuiteOptions {
  /** Datostempel i pakkekoden, f.eks. 20261125 */
  date: string;
  /** Release (pakkeversjon 1.<release>) */
  release: string;
}

// ── Hjelpere ─────────────────────────────────────────────────────────────────

const L = (no: string, en?: string) => ({ NO: no, ...(en !== undefined && { EN: en }) }) as Record<LanguageType, string>;

/** Alternativer <prefix>_0 … <prefix>_{n-1}; verdi = indeks, eller reversert (n-1-indeks). */
function opts(prefix: string, n: number, opt: { reversed?: boolean; en?: boolean } = {}): TextOption[] {
  return Array.from({ length: n }, (_, i) => ({
    code: `${prefix}_${i}`,
    score: opt.reversed ? n - 1 - i : i,
    texts: L(`Alternativ ${i}`, opt.en ? `[EN] Option ${i}` : undefined),
  }));
}

const showWhen = (questionCode: string, value: string): ShowExpression[] => [
  { logic: 'AND', statements: [{ questionCode, operator: 'EQ', value }] },
];

function frame(body: string): string {
  return `[CALL standard_rapport()]
[DIE]
[function standard_rapport()]
[group("Rapport",true)]
${body}
[group_end]
[function_end]`;
}

function rap(lang: 'NO' | 'EN', body: string): string {
  return `/* $questionnaire */\n/* $code */\n/* $name */\n${lang === 'EN' ? '/* $language en */\n' : ''}${frame(body)}`;
}

/** if-par som skriver JA/NEI (rapportmotoren har verken FLAG() eller [else]). */
const ifPair = (cond: string, negated: string, yes: string, no: string) =>
  `[if(${cond}) {"<p>${yes}</p>"}]\n[if(${negated}) {"<p>${no}</p>"}]`;

function sumCalc(code: string, name: string, questionCodes: string[], type: Calculation['type'] = 'SUM'): Calculation {
  return { code, name, type, innerCalculations: questionCodes.map((questionCode) => ({ questionCode })) };
}

function baseQuestionnaire(code: string, name: string, nameEn: string | undefined, sections: Section[]): Questionnaire {
  return {
    code,
    visualizeProgress: 'Percentage',
    version: '1',
    release: '0',
    name: L(name, nameEn),
    type: 'QUESTIONNAIRE',
    defaultLanguage: 'NO',
    supportedLanguages: nameEn !== undefined ? ['NO', 'EN'] : ['NO'],
    sections,
  } as Questionnaire;
}

const radio = (code: string, text: string, n: number, extra: Partial<Question> = {}, textEn?: string): Question =>
  ({ id: code.toLowerCase(), code, type: 'radiobutton', required: true, texts: L(text, textEn), options: opts(code, n, { en: textEn !== undefined }), ...extra }) as Question;

// ── 1. Spørsmålstyper ────────────────────────────────────────────────────────

function sporsmal(code: string): TestPackageDef {
  const q = baseQuestionnaire(code, `andreastest spørsmålstyper (syntetisk testpakke)`, undefined, [
    { id: 's1', code: 'S1', type: 'NORMAL', titles: L('Valgspørsmål'), questions: [
      radio('R1', 'Radioknapper (fire alternativer i to kolonner)', 4, { numberOfColumns: 2 } as Partial<Question>),
      { id: 'c1', code: 'C1', type: 'combobox', required: true, texts: L('Nedtrekksliste (tre alternativer)'), options: opts('C1', 3) },
      { id: 'k1', code: 'K1', type: 'checkbox', multiple: true, limit: 2, required: false, texts: L('Avkrysning, maks to valg'), options: opts('K1', 4) },
      radio('RO1', 'Skrivebeskyttet spørsmål (readonly)', 3, { readonly: true, required: false }),
      radio('V1', 'Frivillig spørsmål (voluntary)', 3, { voluntary: true, required: false }),
      radio('RS1', 'Spørsmål med reversedScore', 4, { reversedScore: true }),
    ] },
    { id: 's2', code: 'S2', type: 'NORMAL', requiresNewPage: true, titles: L('Fritekst og tall'), questions: [
      { id: 't1', code: 'T1', type: 'stringInput', size: 'MEDIUM', required: false, texts: L('Fritekst, én linje (line)') },
      { id: 't2', code: 'T2', type: 'stringInput', size: 'LARGE', required: false, texts: L('Fritekst, flere linjer (multiline)') },
      { id: 't3', code: 'T3', type: 'stringInput', size: 'XLARGE', required: false, texts: L('Fritekst, lang tekst (story)') },
      { id: 'n1', code: 'N1', type: 'numericInput', min: 0, max: 120, decimals: 0, required: false, texts: L('Heltall 0–120') },
      { id: 'n2', code: 'N2', type: 'numericInput', min: 0, max: 10, decimals: 1, required: false, texts: L('Desimaltall 0–10 (steg 0,1)') },
    ] },
    { id: 's3', code: 'S3', type: 'NORMAL', requiresNewPage: true, titles: L('Skyveknapp og dato'), questions: [
      { id: 'sl1', code: 'SL1', type: 'slider', min: 0, max: 10, step: 1, showTicks: true, displayValue: true, required: false, texts: L('Skyveknapp 0–10 med streker og verdi') },
      { id: 'sl2', code: 'SL2', type: 'slider', min: 0, max: 100, step: 5, labelStep: 25, required: false, texts: L('Skyveknapp 0–100, steg 5') },
      { id: 'd1', code: 'D1', type: 'dateInput', required: false, texts: L('Dato uten klokkeslett') },
      { id: 'd2', code: 'D2', type: 'dateInput', includeTime: true, required: false, texts: L('Dato med klokkeslett') },
      { id: 'd3', code: 'D3', type: 'dateInput', minAbsoluteYear: 1900, maxAbsoluteYear: 2100, required: false, texts: L('Dato med årsgrenser 1900–2100') },
    ] },
  ]);
  q.calculations = { calculations: [sumCalc('SUM_VALG', 'Radio + nedtrekk', ['R1', 'C1']), sumCalc('RS1_VERDI', 'Verdien til RS1', ['RS1'])], norms: [] };
  const body = `<h1>Spørsmålstyper</h1>
<p>SUM_VALG=[CALC(SUM_VALG)]</p>
<p>RS1_VERDI=[CALC(RS1_VERDI)]</p>`;
  return {
    area: 'sporsmal', code, name: q.name.NO, questionnaire: q,
    description: 'Alle spørsmålstypene Studio støtter, med readonly, voluntary og reversedScore.',
    reports: { [`${code}-rapport`]: rap('NO', body) },
    media: [],
    answerSets: [
      {
        name: 'sett1', description: 'R1=Alternativ 2, C1=Alternativ 1, RS1=Alternativ 1, alle felt fylt',
        answers: { R1: 'R1_2', C1: 'C1_1', K1: ['K1_0', 'K1_3'], V1: 'V1_1', RS1: 'RS1_1', T1: 'Linje <p> & || test', T2: 'Linje 1\nLinje 2', T3: 'Lang tekst', N1: '42', N2: '3.5', SL1: '7', SL2: '55', D1: '2026-11-25', D2: '2026-11-25 14:30', D3: '1990-05-17' },
        calculations: { SUM_VALG: 3, RS1_VERDI: 2 },
        flags: {},
        report: { NO: ['<p>SUM_VALG=3.00</p>', '<p>RS1_VERDI=2.00</p>'] },
        browser: ['K1: et tredje kryss skal ikke gå (limit 2)', 'Alle verdier lagres uendret (T1 med <p> & ||, T2 med linjeskift, N2=3.5, SL2=55, D2 med klokkeslett)'],
      },
      {
        name: 'sett2', description: 'R1=Alternativ 3, C1=Alternativ 2, RS1=Alternativ 3, valgfrie felt tomme',
        answers: { R1: 'R1_3', C1: 'C1_2', RS1: 'RS1_3' },
        calculations: { SUM_VALG: 5, RS1_VERDI: 0 },
        flags: {},
        report: { NO: ['<p>SUM_VALG=5.00</p>', '<p>RS1_VERDI=0.00</p>'] },
        browser: ['Skjemaet kan sendes inn med tomme valgfrie felt (T*, N*, SL*, D*, K1, V1)'],
      },
    ],
    browserChecks: [
      'Tre sider: S1, S2, S3 (requiresNewPage); seksjonsoverskriftene vises som overskrift (h2) øverst på hver side',
      'R1 i to kolonner; C1 er nedtrekksliste; K1 avkrysning',
      'RO1 er skrivebeskyttet (kan ikke velges); V1 er frivillig; RS1 kan besvares',
      'T1 ett linjefelt, T2 tekstområde, T3 stort tekstområde',
      'N1 godtar 0–120 heltall, N2 0–10 med én desimal',
      'SL1 har streker og viser verdien; SL2 går i steg på 5 med etiketter hver 25',
      'D1 bare dato, D2 dato og klokkeslett, D3 skal IKKE ha min/max="Invalid date" (årsgrenser 1900–2100); D1/D2 har det fortsatt (ingen grenser, som ekte pakker)',
    ],
    notes: [
      'RS1_VERDI: serveren snur reversedScore selv (skår = minste + største alternativskår − valgt skår). Alternativ 1 gir 2 og Alternativ 3 gir 0 på skalaen 0–3; simulatoren gjør nå det samme.',
      'Seksjonsoverskrifter eksporteres som et Text-element (kode <SEKSJON>_TITLE, contentStyle=heading2) først i hver seksjon, fordi serveren ikke lagrer Section@description.',
    ],
  };
}

// ── 2. Beregning og flagg ────────────────────────────────────────────────────

function beregning(code: string): TestPackageDef {
  const b = (n: number, reversed = false): Question => ({
    id: `b${n}`, code: `B${n}`, type: 'radiobutton', required: true,
    texts: L(`Spørsmål B${n}${reversed ? ' (reversert skåring 3–0)' : ''}`), options: opts(`B${n}`, 4, { reversed }),
  }) as Question;
  const q = baseQuestionnaire(code, 'andreastest beregning (syntetisk testpakke)', undefined, [
    { id: 's1', code: 'S1', type: 'NORMAL', titles: L('Beregninger'), questions: [b(1), b(2), b(3), b(4), b(5, true), b(6, true)] },
  ]);
  const all = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6'];
  q.calculations = { calculations: [
    sumCalc('TOTAL', 'Totalskår', all),
    sumCalc('DEL_A', 'Delsum A', ['B1', 'B2', 'B3']),
    sumCalc('DEL_B', 'Delsum B (med reverserte)', ['B4', 'B5', 'B6']),
    sumCalc('SNITT', 'Gjennomsnitt', all, 'MEAN'),
    { code: 'VEKTET', name: 'B1×2 + B2', type: 'SUM', innerCalculations: [{ questionCode: 'B1', multiplier: 2 }, { questionCode: 'B2' }] },
  ], norms: [] };
  q.flags = [
    { code: 'HOY_TOTAL', name: 'Total ≥ 12', type: 'WARNING', logic: 'AND', conditions: [{ calculationCode: 'TOTAL', operator: 'GTE', threshold: 12 }] },
    { code: 'KOMBI_OG', name: 'Del A ≥ 6 OG del B ≥ 6', type: 'CRITICAL', logic: 'AND', conditions: [
      { calculationCode: 'DEL_A', operator: 'GTE', threshold: 6 }, { calculationCode: 'DEL_B', operator: 'GTE', threshold: 6 }] },
    { code: 'KOMBI_ELLER', name: 'Del A ≥ 8 ELLER snitt ≥ 2,5', type: 'WARNING', logic: 'OR', conditions: [
      { calculationCode: 'DEL_A', operator: 'GTE', threshold: 8 }, { calculationCode: 'SNITT', operator: 'GTE', threshold: 2.5 }] },
    { code: 'LAV_SNITT', name: 'Snitt < 1', type: 'INFO', logic: 'AND', conditions: [{ calculationCode: 'SNITT', operator: 'LT', threshold: 1 }] },
  ] as Flag[];
  const body = `<h1>Beregninger</h1>
<p>TOTAL=[CALC(TOTAL)] DEL_A=[CALC(DEL_A)] DEL_B=[CALC(DEL_B)] SNITT=[CALC(SNITT)] VEKTET=[CALC(VEKTET)]</p>
${ifPair('CALC(TOTAL)>=12', 'CALC(TOTAL)<12', 'HOY_TOTAL=JA', 'HOY_TOTAL=NEI')}
${ifPair('CALC(DEL_A)>=6 && CALC(DEL_B)>=6', 'CALC(DEL_A)<6 || CALC(DEL_B)<6', 'KOMBI_OG=JA', 'KOMBI_OG=NEI')}
${ifPair('CALC(DEL_A)>=8 || CALC(SNITT)>=2.5', 'CALC(DEL_A)<8 && CALC(SNITT)<2.5', 'KOMBI_ELLER=JA', 'KOMBI_ELLER=NEI')}
${ifPair('CALC(SNITT)<1', 'CALC(SNITT)>=1', 'LAV_SNITT=JA', 'LAV_SNITT=NEI')}
[if(CALC(TOTAL)>=12) {"<p>NIVA=HOY</p>"}]
[if(CALC(TOTAL)>=6 && CALC(TOTAL)<12) {"<p>NIVA=MIDDELS</p>"}]
[if(CALC(TOTAL)<6) {"<p>NIVA=LAV</p>"}]`;
  const lines = (t: number, a: number, bb: number, s: string, v: number, f: Record<string, boolean>, niva: string) => [
    `<p>TOTAL=${t.toFixed(2)} DEL_A=${a.toFixed(2)} DEL_B=${bb.toFixed(2)} SNITT=${s} VEKTET=${v.toFixed(2)}</p>`,
    ...Object.entries(f).map(([k, on]) => `<p>${k}=${on ? 'JA' : 'NEI'}</p>`),
    `<p>NIVA=${niva}</p>`,
  ];
  const high = { HOY_TOTAL: true, KOMBI_OG: true, KOMBI_ELLER: true, LAV_SNITT: false };
  const mid = { HOY_TOTAL: false, KOMBI_OG: false, KOMBI_ELLER: false, LAV_SNITT: false };
  const low = { HOY_TOTAL: false, KOMBI_OG: false, KOMBI_ELLER: false, LAV_SNITT: true };
  return {
    area: 'beregning', code, name: q.name.NO, questionnaire: q,
    description: 'Sum, delsum, snitt, vektet sum, reversert skåring (alternativverdier 3–0), enkle og kombinerte flagg (OG/ELLER), tre nivåer.',
    reports: { [`${code}-rapport`]: rap('NO', body) },
    media: [],
    answerSets: [
      {
        name: 'hoy', description: 'B1=Alt 3, B2=Alt 3, B3=Alt 2, B4=Alt 2, B5=Alt 0 (verdi 3), B6=Alt 1 (verdi 2)',
        answers: { B1: 'B1_3', B2: 'B2_3', B3: 'B3_2', B4: 'B4_2', B5: 'B5_0', B6: 'B6_1' },
        calculations: { TOTAL: 15, DEL_A: 8, DEL_B: 7, SNITT: 2.5, VEKTET: 9 },
        flags: high,
        report: { NO: lines(15, 8, 7, '2.50', 9, high, 'HOY') },
        reportAbsent: { NO: ['NIVA=MIDDELS', 'NIVA=LAV'] },
      },
      {
        name: 'middels', description: 'B1=Alt 1, B2=Alt 2, B3=Alt 1, B4=Alt 1, B5=Alt 2 (verdi 1), B6=Alt 3 (verdi 0)',
        answers: { B1: 'B1_1', B2: 'B2_2', B3: 'B3_1', B4: 'B4_1', B5: 'B5_2', B6: 'B6_3' },
        calculations: { TOTAL: 6, DEL_A: 4, DEL_B: 2, SNITT: 1, VEKTET: 4 },
        flags: mid,
        report: { NO: lines(6, 4, 2, '1.00', 4, mid, 'MIDDELS') },
        reportAbsent: { NO: ['NIVA=HOY', 'NIVA=LAV'] },
        browser: ['Grenseverdier: TOTAL=6 gir MIDDELS, SNITT=1 gir IKKE LAV_SNITT (operator «mindre enn»)'],
      },
      {
        name: 'lav', description: 'B1=Alt 0, B2=Alt 0, B3=Alt 1, B4=Alt 0, B5=Alt 3 (verdi 0), B6=Alt 2 (verdi 1)',
        answers: { B1: 'B1_0', B2: 'B2_0', B3: 'B3_1', B4: 'B4_0', B5: 'B5_3', B6: 'B6_2' },
        calculations: { TOTAL: 2, DEL_A: 1, DEL_B: 1, SNITT: 2 / 6, VEKTET: 0 },
        flags: low,
        report: { NO: lines(2, 1, 1, '0.33', 0, low, 'LAV') },
        reportAbsent: { NO: ['NIVA=HOY', 'NIVA=MIDDELS'] },
      },
    ],
    browserChecks: [
      'Nettleserens beregning (TOTAL, DEL_A, DEL_B, SNITT, VEKTET) og flagg stemmer med tabellen for hvert svarsett',
      'B5 og B6 er reversert via alternativverdiene (Alternativ 0 = 3 … Alternativ 3 = 0)',
    ],
    notes: [],
  };
}

// ── 3. Rapport ───────────────────────────────────────────────────────────────

function rapport(code: string): TestPackageDef {
  const qs = [1, 2, 3, 4].map((n) => radio(`Q${n}`, `Spørsmål Q${n}`, 5, {}, `Question Q${n}`));
  const q = baseQuestionnaire(code, 'andreastest rapport (syntetisk testpakke)', 'andreastest report (synthetic test package)', [
    { id: 's1', code: 'S1', type: 'NORMAL', titles: L('Rapportsyntaks', 'Report syntax'), questions: qs },
  ]);
  q.calculations = { calculations: [
    sumCalc('SUM_A', 'Q1 + Q2', ['Q1', 'Q2']),
    sumCalc('SUM_B', 'Q3 + Q4', ['Q3', 'Q4']),
    sumCalc('TOTAL', 'Total', ['Q1', 'Q2', 'Q3', 'Q4']),
    sumCalc('SNITT', 'Snitt', ['Q1', 'Q2', 'Q3', 'Q4'], 'MEAN'),
  ], norms: [] };
  // graph_customize: navn, type, min, maks, overskrift, vis etiketter, etikettstr., fontstr., venstre y-akse,
  // T-skår, bredde, høyde, marger (topp, høyre, bunn, venstre), transpose (17.) – center_graph (18.) står på standard (true).
  const graphs = `[$g1= graph_init()]
[graph_customize($g1,1,0,16,"Delskarer",true,,,true,false,700,280,10,10,80,30,false)]
[$GA = eval("CALC(SUM_A)")]
[$GB = eval("CALC(SUM_B)")]
[$GT = eval("CALC(TOTAL)")]
[$ser1= series(($GA,$GB,$GT),("SUM_A","SUM_B","TOTAL"))]
[graph_plot($g1,2,$ser1,,,,true,true,true,false)]
[graph_render($g1)]
[$g2= graph_init()]
[graph_customize($g2,1,0,16,"To serier",true,,,true,false,700,280,10,10,80,30,false)]
[$HA = eval("CALC(SUM_A)")]
[$HB = eval("CALC(SUM_B)")]
[$IA = eval("CALC(TOTAL)")]
[$IB = eval("CALC(SNITT)")]
[$ser2= series(($HA,$HB),("A","B"))]
[$ser3= series(($IA,$IB),("TOTAL","SNITT"))]
[graph_plot($g2,2,$ser2,,,,true,true,true,false)]
[graph_plot($g2,2,$ser3,,,,true,true,true,false)]
[graph_render($g2)]`;
  const no = `<h1>Rapporttest</h1>
<p>SUM_A=[CALC(SUM_A)] SUM_B=[CALC(SUM_B)] TOTAL=[CALC(TOTAL)] SNITT=[CALC(SNITT)]</p>
[$TOT = eval("CALC(TOTAL)")]
[$SN = eval("CALC(SNITT)")]
<p>ECHO_TOTAL_1=[ECHO($TOT,1)]</p>
<p>ECHO_SNITT_1=[ECHO($SN,1)]</p>
<p>ECHO_SNITT_0=[ECHO($SN,0)]</p>
[if(CALC(TOTAL)>=8) {"<p>NIVA=HOY</p>"}]
[if(CALC(TOTAL)<8) {"<p>NIVA=LAV</p>"}]
${ifPair('CALC(SUM_A)>=6 && CALC(SUM_B)>=4', 'CALC(SUM_A)<6 || CALC(SUM_B)<4', 'BEGGE=JA', 'BEGGE=NEI')}
${ifPair('CALC(SUM_A)>=6 || CALC(SUM_B)>=6', 'CALC(SUM_A)<6 && CALC(SUM_B)<6', 'MINST_EN=JA', 'MINST_EN=NEI')}
<h2>Grafer</h2>
${graphs}`;
  const en = `<h1>Report test</h1>
<p>TOTAL=[CALC(TOTAL)] MEAN=[CALC(SNITT)]</p>
[$TOT = eval("CALC(TOTAL)")]
<p>ECHO_TOTAL_1=[ECHO($TOT,1)]</p>
[if(CALC(TOTAL)>=8) {"<p>LEVEL=HIGH</p>"}]
[if(CALC(TOTAL)<8) {"<p>LEVEL=LOW</p>"}]
${graphs.split('[$g2=')[0].trim()}`;
  return {
    area: 'rapport', code, name: q.name.NO, questionnaire: q,
    description: 'Rapportrammen, if-blokker med && og ||, eval + ECHO med avrunding, to grafer (én serie med tre søyler, to serier gruppert), norsk og engelsk rapport.',
    reports: { [`${code}-rapport`]: rap('NO', no), [`${code}-rapport-en`]: rap('EN', en) },
    media: [],
    answerSets: [
      {
        name: 'hoy', description: 'Q1=Alt 4, Q2=Alt 3, Q3=Alt 2, Q4=Alt 2',
        answers: { Q1: 'Q1_4', Q2: 'Q2_3', Q3: 'Q3_2', Q4: 'Q4_2' },
        calculations: { SUM_A: 7, SUM_B: 4, TOTAL: 11, SNITT: 2.75 },
        flags: {},
        report: {
          NO: ['<p>SUM_A=7.00 SUM_B=4.00 TOTAL=11.00 SNITT=2.75</p>', '<p>ECHO_TOTAL_1=11</p>', '<p>ECHO_SNITT_1=2.8</p>', '<p>ECHO_SNITT_0=3</p>', '<p>NIVA=HOY</p>', '<p>BEGGE=JA</p>', '<p>MINST_EN=JA</p>'],
          EN: ['<p>TOTAL=11.00 MEAN=2.75</p>', '<p>ECHO_TOTAL_1=11</p>', '<p>LEVEL=HIGH</p>'],
        },
        reportAbsent: { NO: ['NIVA=LAV', 'BEGGE=NEI', 'MINST_EN=NEI'], EN: ['LEVEL=LOW'] },
      },
      {
        name: 'lav', description: 'Q1=Alt 1, Q2=Alt 0, Q3=Alt 1, Q4=Alt 0',
        answers: { Q1: 'Q1_1', Q2: 'Q2_0', Q3: 'Q3_1', Q4: 'Q4_0' },
        calculations: { SUM_A: 1, SUM_B: 1, TOTAL: 2, SNITT: 0.5 },
        flags: {},
        report: {
          NO: ['<p>SUM_A=1.00 SUM_B=1.00 TOTAL=2.00 SNITT=0.50</p>', '<p>ECHO_TOTAL_1=2</p>', '<p>ECHO_SNITT_1=0.5</p>', '<p>ECHO_SNITT_0=1</p>', '<p>NIVA=LAV</p>', '<p>BEGGE=NEI</p>', '<p>MINST_EN=NEI</p>'],
          EN: ['<p>TOTAL=2.00 MEAN=0.50</p>', '<p>ECHO_TOTAL_1=2</p>', '<p>LEVEL=LOW</p>'],
        },
        reportAbsent: { NO: ['NIVA=HOY', 'BEGGE=JA', 'MINST_EN=JA'], EN: ['LEVEL=HIGH'] },
      },
    ],
    browserChecks: [
      'Norsk rapport: to grafer. Graf 1 «Delskarer»: tre søyler SUM_A, SUM_B, TOTAL. Graf 2 «To serier»: to grupperte serier (A/B og TOTAL/SNITT)',
      'Engelsk rapport: én graf med tre søyler',
      'x-etikettene er seriens etiketter (SUM_A …), ikke dato (17. argument transpose=false)',
    ],
    notes: [
      'ECHO bruker PHP round(): heltall vises uten desimal (11, ikke 11.0), 2.75 → 2.8, 0.5 → 1 med 0 desimaler.',
      'Søylen står litt til venstre for x-etiketten også i ekte rapporter: rapportmotoren gir alltid søylene fast bredde 10 px (tom bar_width i graph_plot), og jpgraph forskyver da søylene på tekstaksen. Det er motorens oppførsel, ikke noe Studio skriver feil.',
      'Graf 2 sammenligner verdier i ulik skala (TOTAL og SNITT) – bare for å teste to serier.',
    ],
  };
}

// ── 4. Media ─────────────────────────────────────────────────────────────────

function media(code: string): TestPackageDef {
  const SEC_PNG = 'andreastest-seksjon.png';
  const IMG_PNG = 'andreastest-bilde.png';
  const IMG_JPG = 'andreastest-bilde.jpg';
  const MP3 = 'andreastest-lyd.mp3';
  const PDF = 'andreastest-dokument.pdf';
  const q = baseQuestionnaire(code, 'andreastest media (syntetisk testpakke)', undefined, [
    { id: 's1', code: 'S1', type: 'NORMAL', titles: L('Bilder (seksjonsbilde PNG)'), backgroundImage: SEC_PNG, questions: [
      { id: 'im1', code: 'IM1', type: 'image', imageSrc: IMG_PNG, required: false, texts: L('') },
      { id: 'im2', code: 'IM2', type: 'image', imageSrc: IMG_JPG, required: false, texts: L('') },
      radio('M1', 'Ser du begge bildene over (PNG med ruter og JPEG med hvit firkant)?', 2),
    ] },
    { id: 's2', code: 'S2', type: 'NORMAL', requiresNewPage: true, titles: L('Lyd (seksjonsbilde JPEG)'), backgroundImage: IMG_JPG, questions: [
      { id: 'av1', code: 'AV1', type: 'audioVideo', mediaFile: MP3, required: false, texts: L('') },
      radio('M2', 'Kan du spille av lyden over (440 Hz-tone, 0,5 s)?', 2),
    ] },
  ]);
  q.calculations = { calculations: [sumCalc('SVAR', 'M1 + M2', ['M1', 'M2'])], norms: [] };
  const png = toBase64(makePng(48, 48, [37, 184, 236], [255, 255, 255]));
  const sec = toBase64(makePng(32, 32, [255, 165, 0], [255, 255, 255]));
  const pdf = toBase64(makePdf('andreastest syntetisk PDF'));
  return {
    area: 'media', code, name: q.name.NO, questionnaire: q,
    description: 'Bilde (PNG og JPEG) som bildeelement, lyd (MP3) som lyd/video-element, PDF i media-mappen, seksjonsbilde (PNG og JPEG).',
    reports: { [`${code}-rapport`]: rap('NO', '<h1>Media</h1>\n<p>SVAR=[CALC(SVAR)]</p>') },
    media: [
      mediaFile(SEC_PNG, 'image/png', sec),
      mediaFile(IMG_PNG, 'image/png', png),
      mediaFile(IMG_JPG, 'image/jpeg', JPEG_BASE64),
      mediaFile(MP3, 'audio/mpeg', MP3_BASE64),
      mediaFile(PDF, 'application/pdf', pdf),
    ],
    answerSets: [
      {
        name: 'ja', description: 'M1=Alternativ 1, M2=Alternativ 1',
        answers: { M1: 'M1_1', M2: 'M2_1' },
        calculations: { SVAR: 2 }, flags: {},
        report: { NO: ['<p>SVAR=2.00</p>'] },
      },
    ],
    browserChecks: [
      'S1: oransje/hvitt seksjonsbilde (PNG) til høyre; IM1 blått/hvitt rutemønster (PNG); IM2 blå med hvit firkant (JPEG)',
      'S2 på ny side: seksjonsbilde JPEG; AV1 er en lydspiller som spiller MP3-en',
      `Mediene leveres med riktig type: ${IMG_PNG}/${SEC_PNG} image/png, ${IMG_JPG} image/jpeg, ${MP3} audio/mpeg, ${PDF} application/pdf`,
    ],
    notes: [
      'Bilde skrives nå som questionnaire:ImageElement imageFile="…" og lyd som questionnaire:AudioVideo audioVideoFile="…" (som modellen og ekte pakker; før skrev Studio widgets:ImageWidget imageSrc).',
      'PDF-en ligger bare i media-mappen: Studio har ingen elementtype for å lenke til et dokument i skjemaet, så sjekk bare at mediet installeres og kan hentes.',
      'Alt-tekst på bilder finnes ikke i modellen og eksporteres ikke.',
    ],
  };
}

// ── 5. Oversettelse ──────────────────────────────────────────────────────────

function oversettelse(code: string): TestPackageDef {
  const q = baseQuestionnaire(code, 'andreastest oversettelse (syntetisk testpakke)', '[EN] andreastest translation (synthetic test package)', [
    { id: 's1', code: 'S1', type: 'NORMAL', titles: L('Norsk seksjon 1', '[EN] English section 1'), questions: [
      { id: 'tx1', code: 'TX1', type: 'text', isQuestion: false, required: false, texts: L('Norsk informasjonstekst', '[EN] English information text') },
      radio('R1', 'Norsk radiospørsmål', 3, {}, '[EN] English radio question'),
      { id: 'c1', code: 'C1', type: 'combobox', required: true, texts: L('Norsk nedtrekksliste', '[EN] English dropdown'), options: opts('C1', 3, { en: true }) },
      { id: 'k1', code: 'K1', type: 'checkbox', multiple: true, required: false, texts: L('Norsk avkrysning', '[EN] English checkboxes'), options: opts('K1', 2, { en: true }) },
    ] },
    { id: 's2', code: 'S2', type: 'NORMAL', requiresNewPage: true, titles: L('Norsk seksjon 2', '[EN] English section 2'), questions: [
      { id: 't1', code: 'T1', type: 'stringInput', size: 'MEDIUM', required: false, texts: L('Norsk fritekst', '[EN] English free text') },
      { id: 'n1', code: 'N1', type: 'numericInput', min: 0, max: 10, decimals: 0, required: false, texts: L('Norsk tall', '[EN] English number') },
    ] },
  ]);
  q.calculations = { calculations: [sumCalc('TOTAL', 'R1 + C1', ['R1', 'C1'])], norms: [] };
  return {
    area: 'oversettelse', code, name: q.name.NO, questionnaire: q,
    description: 'Norsk (nb) og engelsk (en): navn, seksjonsoverskrifter, infotekst, spørsmål og alle alternativer oversatt, egen rapport per språk.',
    reports: {
      [`${code}-rapport`]: rap('NO', '<h1>Norsk rapport</h1>\n<p>SPRAK=NORSK TOTAL=[CALC(TOTAL)]</p>'),
      [`${code}-rapport-en`]: rap('EN', '<h1>English report</h1>\n<p>LANGUAGE=ENGLISH TOTAL=[CALC(TOTAL)]</p>'),
    },
    media: [],
    answerSets: [
      {
        name: 'sett1', description: 'R1=Alternativ 2, C1=Alternativ 1 (begge språk)',
        answers: { R1: 'R1_2', C1: 'C1_1', K1: ['K1_1'], T1: 'tekst', N1: '5' },
        calculations: { TOTAL: 3 }, flags: {},
        report: { NO: ['<p>SPRAK=NORSK TOTAL=3.00</p>'], EN: ['<p>LANGUAGE=ENGLISH TOTAL=3.00</p>'] },
      },
    ],
    browserChecks: [
      'På norsk: ingen tekst begynner med [EN]',
      'På engelsk: skjemanavn, infotekst TX1, alle spørsmål og alle alternativer begynner med [EN]',
      'På norsk vises overskriftene «Norsk seksjon 1/2», på engelsk «[EN] English section 1/2» (Text-elementene S1_TITLE/S2_TITLE, oversatt som Text/content)',
      'Utfylt på norsk gir norsk rapport (SPRAK=NORSK), utfylt på engelsk gir engelsk rapport (LANGUAGE=ENGLISH)',
    ],
    notes: ['Seksjonsoverskriftene er nå Text-elementer (S1_TITLE, S2_TITLE) med oversettelse Text/content, fordi serveren ikke lagrer Section@description.'],
  };
}

// ── 6. Flyt ──────────────────────────────────────────────────────────────────

function flyt(code: string): TestPackageDef {
  const jaNei = (c: string): TextOption[] => [
    { code: `${c}_0`, score: 0, texts: L('Nei') },
    { code: `${c}_1`, score: 1, texts: L('Ja') },
  ];
  const q = baseQuestionnaire(code, 'andreastest flyt (syntetisk testpakke)', undefined, [
    { id: 's1', code: 'S1', type: 'NORMAL', titles: L('Side 1'), questions: [
      { id: 'f1', code: 'F1', type: 'radiobutton', required: true, texts: L('Obligatorisk: vise oppfølgingsspørsmål?'), options: jaNei('F1') },
      { id: 'f2', code: 'F2', type: 'stringInput', size: 'MEDIUM', required: false, texts: L('Vises bare når F1 = Ja'), showExpressions: showWhen('F1', 'F1_1') },
      { id: 'f3', code: 'F3', type: 'radiobutton', required: false, texts: L('Skjules når F1 = Ja'), options: opts('F3', 2),
        hideExpressions: [{ logic: 'AND', statements: [{ questionCode: 'F1', operator: 'EQ', value: 'F1_1' }] }] },
      { id: 'tx1', code: 'TX1', type: 'text', isQuestion: false, required: false, texts: L('Infotekst som bare vises når F1 = Ja'), showExpressions: showWhen('F1', 'F1_1') },
      { id: 'f4', code: 'F4', type: 'numericInput', min: 0, max: 10, decimals: 0, required: false, voluntary: true, texts: L('Frivillig tall (voluntary)') },
    ] },
    { id: 's2', code: 'S2', type: 'NORMAL', requiresNewPage: true, titles: L('Side 2'), questions: [
      { id: 'f5', code: 'F5', type: 'radiobutton', required: true, texts: L('Obligatorisk: vis side 3?'), options: jaNei('F5') },
      { id: 'f6', code: 'F6', type: 'stringInput', size: 'MEDIUM', required: false, texts: L('Valgfri fritekst') },
    ] },
    { id: 's3', code: 'S3', type: 'NORMAL', requiresNewPage: true, titles: L('Side 3 (bare når F5 = Ja)'), showExpressions: showWhen('F5', 'F5_1'), questions: [
      { id: 'f7', code: 'F7', type: 'radiobutton', required: true, texts: L('Obligatorisk på side 3'), options: opts('F7', 3) },
    ] },
  ]);
  q.calculations = { calculations: [sumCalc('F_SUM', 'F1 + F5', ['F1', 'F5'])], norms: [] };
  return {
    area: 'flyt', code, name: q.name.NO, questionnaire: q,
    description: 'Tre sider (requiresNewPage), vis/skjul på spørsmål, tekst og seksjon, obligatoriske, valgfrie og frivillige felt.',
    reports: { [`${code}-rapport`]: rap('NO', '<h1>Flyt</h1>\n<p>F_SUM=[CALC(F_SUM)]</p>\n[if(CALC(F_SUM)>=2) {"<p>VEI=JA_JA</p>"}]\n[if(CALC(F_SUM)<2) {"<p>VEI=IKKE_JA_JA</p>"}]') },
    media: [],
    answerSets: [
      {
        name: 'ja-ja', description: 'F1=Ja, F2 fylt, F5=Ja, F7=Alternativ 2',
        answers: { F1: 'F1_1', F2: 'oppfølging', F5: 'F5_1', F7: 'F7_2' },
        calculations: { F_SUM: 2 }, flags: {},
        report: { NO: ['<p>F_SUM=2.00</p>', '<p>VEI=JA_JA</p>'] },
        browser: ['Side 1: F2 og TX1 vises, F3 er skjult', 'Tre sider; side 3 vises og F7 må besvares'],
      },
      {
        name: 'nei-nei', description: 'F1=Nei, F3=Alternativ 0, F5=Nei',
        answers: { F1: 'F1_0', F3: 'F3_0', F5: 'F5_0' },
        calculations: { F_SUM: 0 }, flags: {},
        report: { NO: ['<p>F_SUM=0.00</p>', '<p>VEI=IKKE_JA_JA</p>'] },
        browser: ['Side 1: F2 og TX1 er skjult, F3 vises', 'Side 3 hoppes IKKE over (plattformbegrensning): den vises tom med «Forrige side» og «Ferdig»; F7 er skjult og skjemaet kan sendes uten F7'],
      },
    ],
    browserChecks: [
      'Uten svar på F1 (side 1) eller F5 (side 2) går det ikke videre (obligatorisk)',
      'F4 (voluntary) og F6 (valgfri) kan stå tomme; meld hvordan portalen viser voluntary',
      'Vis/skjul endres med en gang F1 endres',
    ],
    notes: [
      'Vis/skjul på tekstelementer (TX1) skrives som barn av Text-elementet.',
      'Plattformbegrensning: portalen deler inn i sider én gang ut fra requiresNewPage (pager.js) og ser ikke på synlighet, så en skjult seksjon på egen side blir en tom side. Ekte pakker gjør det samme (52 seksjoner med show + requiresNewPage). Eneste måte å avslutte tidlig er continueIf på seksjonen (stopper skjemaet), som ingen ekte pakker bruker.',
    ],
  };
}

// ── 7. Matrise ───────────────────────────────────────────────────────────────

function matrise(code: string): TestPackageDef {
  const often = ['Aldri', 'Sjelden', 'Ofte', 'Alltid'];
  const much = ['Ikke', 'Litt', 'Mye'];
  const tplOptions = (prefix: string, labels: string[]): TextOption[] =>
    labels.map((label, i) => ({ code: `${prefix}_${i}`, score: i, texts: L(label) }));
  const m1Options = tplOptions('M1', often);
  const m2Options = tplOptions('M2', much);
  const row = (c: string, text: string, tpl: string, options: TextOption[]): Question =>
    ({ id: c.toLowerCase(), code: c, type: 'radiobutton', required: true, texts: L(text), responseTemplateCode: tpl, options }) as Question;
  const m1 = ['M1A', 'M1B', 'M1C', 'M1D'];
  const m2 = ['M2A', 'M2B', 'M2C'];
  const q = baseQuestionnaire(code, 'andreastest matrise (syntetisk testpakke)', undefined, [
    {
      id: 's1', code: 'S1', type: 'NORMAL', titles: L('Matriser'), questions: [],
      subSections: [
        {
          // Matrise 1: bare radioknapper (4 alternativer). Tittelen er en beskrivelse, ingen overskrift.
          id: 'm1', code: 'M1', type: 'NORMAL', titles: L('Matrise 1'), titleFromDescription: true, matrix: true,
          questions: m1.map((c, i) => row(c, `Påstand ${i + 1} i matrise 1`, 'M1', m1Options)),
        },
        {
          // Matrise 2: tekst først, deretter spørsmålene (3 alternativer)
          id: 'm2', code: 'M2', type: 'NORMAL', titles: L('Matrise 2'), titleFromDescription: true, matrix: true,
          questions: [
            { id: 'm2_intro', code: 'M2_INTRO', type: 'text', required: false, texts: L('Tenk på den siste uken.') } as Question,
            ...m2.map((c, i) => row(c, `Påstand ${i + 1} i matrise 2`, 'M2', m2Options)),
          ],
        },
      ],
    },
  ]);
  q.responseTemplates = { templates: [
    { code: 'M1', name: 'Hvor ofte', options: m1Options, widgetType: 'Radiobutton' },
    { code: 'M2', name: 'Hvor mye', options: m2Options, widgetType: 'Radiobutton' },
  ] };
  q.calculations = { calculations: [
    sumCalc('M1_SUM', 'Sum matrise 1', m1),
    sumCalc('M2_SUM', 'Sum matrise 2', m2),
    sumCalc('TOTAL', 'Total', [...m1, ...m2]),
  ], norms: [] };
  q.flags = [
    { code: 'HOY_TOTAL', name: 'Total ≥ 12', type: 'WARNING', logic: 'AND', conditions: [{ calculationCode: 'TOTAL', operator: 'GTE', threshold: 12 }] },
  ] as Flag[];
  const body = `<h1>Matriser</h1>
<p>M1_SUM=[CALC(M1_SUM)] M2_SUM=[CALC(M2_SUM)] TOTAL=[CALC(TOTAL)]</p>
${ifPair('CALC(TOTAL)>=12', 'CALC(TOTAL)<12', 'HOY_TOTAL=JA', 'HOY_TOTAL=NEI')}`;
  const lines = (a: number, b: number, flag: boolean) => [
    `<p>M1_SUM=${a.toFixed(2)} M2_SUM=${b.toFixed(2)} TOTAL=${(a + b).toFixed(2)}</p>`,
    `<p>HOY_TOTAL=${flag ? 'JA' : 'NEI'}</p>`,
  ];
  const set = (name: string, m1Idx: number[], m2Idx: number[], browser?: string[]): AnswerSet => {
    const a = m1Idx.reduce((x, y) => x + y, 0);
    const b = m2Idx.reduce((x, y) => x + y, 0);
    const flag = a + b >= 12;
    return {
      name,
      description: [...m1.map((c, i) => `${c}=${often[m1Idx[i]]}`), ...m2.map((c, i) => `${c}=${much[m2Idx[i]]}`)].join(', '),
      answers: Object.fromEntries([...m1.map((c, i) => [c, `M1_${m1Idx[i]}`]), ...m2.map((c, i) => [c, `M2_${m2Idx[i]}`])]),
      calculations: { M1_SUM: a, M2_SUM: b, TOTAL: a + b },
      flags: { HOY_TOTAL: flag },
      report: { NO: lines(a, b, flag) },
      reportAbsent: { NO: [`HOY_TOTAL=${flag ? 'NEI' : 'JA'}`] },
      ...(browser && { browser }),
    };
  };
  return {
    area: 'matrise', code, name: q.name.NO, questionnaire: q,
    description: 'To matriser: radioknapper med 4 alternativer (felles svarmal M1), og en tekst først fulgt av spørsmål med 3 alternativer (felles svarmal M2). Summer per matrise, total og ett flagg.',
    reports: { [`${code}-rapport`]: rap('NO', body) },
    media: [],
    answerSets: [
      set('hoy', [3, 3, 2, 2], [2, 1, 2], ['Total 15 gir HOY_TOTAL=JA']),
      set('grense', [3, 2, 1, 1], [2, 2, 1], ['Total 12 (akkurat grensen) gir HOY_TOTAL=JA']),
      set('lav', [0, 1, 0, 0], [0, 0, 1]),
    ],
    browserChecks: [
      'Matrise 1 vises som én tabell: 4 rader (M1A–M1D) og 4 kolonner (Aldri, Sjelden, Ofte, Alltid), én radioknapp per celle',
      'Matrise 2: teksten «Tenk på den siste uken.» vises over tabellen, ikke som en rad; tabellen har 3 rader (M2A–M2C) og 3 kolonner (Ikke, Litt, Mye)',
      'Overskriftene «Matrise 1»/«Matrise 2» vises ikke (de er bare seksjonsbeskrivelser); bare «Matriser» vises som sideoverskrift',
      'Å velge en celle velger bare det alternativet i den raden; svarene lagres med alternativkodene M1_0–M1_3 og M2_0–M2_2',
    ],
    notes: [
      'Begge matrisene er nestede seksjoner med matrix="true", slik ekte pakker er bygget.',
      'Spørsmålene i hver matrise deler én svarmal (questions-attributtet lister alle radene).',
    ],
  };
}

// ── Suite ────────────────────────────────────────────────────────────────────

export const TEST_AREAS: TestArea[] = ['sporsmal', 'beregning', 'rapport', 'media', 'oversettelse', 'flyt', 'matrise'];

const BUILDERS: Record<TestArea, (code: string) => TestPackageDef> = { sporsmal, beregning, rapport, media, oversettelse, flyt, matrise };

export function testPackageCode(area: TestArea, date: string): string {
  return `andreastest-${area}-${date}`;
}

export function buildSuiteDefs(opt: SuiteOptions): TestPackageDef[] {
  return TEST_AREAS.map((area) => {
    const def = BUILDERS[area](testPackageCode(area, opt.date));
    def.questionnaire.release = opt.release;
    return def;
  });
}

export interface ExpectedFile {
  kode: string;
  navn: string;
  omrade: TestArea;
  versjon: string;
  zip: string;
  beskrivelse: string;
  svarsett: {
    navn: string;
    beskrivelse: string;
    svar: Record<string, { alternativ?: string | string[]; tekst?: string; verdi?: number | string }>;
    beregninger: Record<string, number>;
    flagg: Record<string, boolean>;
    rapport: Partial<Record<'NO' | 'EN', string[]>>;
    rapportIkke: Partial<Record<'NO' | 'EN', string[]>>;
    nettleser: string[];
  }[];
  nettleser: string[];
  merknader: string[];
}

function optionOf(q: Questionnaire, questionCode: string, optionCode: string): TextOption | undefined {
  for (const qq of flatQuestions(q.sections)) {
    if (qq.code === questionCode && 'options' in qq) return qq.options?.find((o) => o.code === optionCode);
  }
  return undefined;
}

function flatQuestions(sections: Section[]): Question[] {
  return sections.flatMap((s) => [...s.questions, ...flatQuestions(s.subSections ?? [])]);
}

export function expectedFile(def: TestPackageDef, built: BuiltPackage): ExpectedFile {
  const q = def.questionnaire;
  return {
    kode: def.code,
    navn: def.name,
    omrade: def.area,
    versjon: `${q.version}.${q.release}`,
    zip: built.fileName,
    beskrivelse: def.description,
    svarsett: def.answerSets.map((s) => ({
      navn: s.name,
      beskrivelse: s.description,
      svar: Object.fromEntries(Object.entries(s.answers).map(([code, a]) => {
        if (Array.isArray(a)) return [code, { alternativ: a, tekst: a.map((c) => optionOf(q, code, c)?.texts.NO ?? c).join(', ') }];
        const o = optionOf(q, code, a);
        return [code, o ? { alternativ: a, tekst: o.texts.NO, verdi: o.score ?? 0 } : { verdi: a }];
      })),
      beregninger: s.calculations,
      flagg: s.flags,
      rapport: s.report,
      rapportIkke: s.reportAbsent ?? {},
      nettleser: s.browser ?? [],
    })),
    nettleser: def.browserChecks,
    merknader: def.notes,
  };
}

export interface BuiltTestPackage {
  def: TestPackageDef;
  built: BuiltPackage;
  expected: ExpectedFile;
}

export async function buildSuite(opt: SuiteOptions): Promise<BuiltTestPackage[]> {
  const out: BuiltTestPackage[] = [];
  for (const def of buildSuiteDefs(opt)) {
    const built = await buildPackageZip(def.questionnaire, def.reports, def.media);
    out.push({ def, built, expected: expectedFile(def, built) });
  }
  return out;
}

// ── Simulering av en bygget pakke (leser zip-en tilbake som ved import) ──────

export async function unzipText(base64: string): Promise<Record<string, string>> {
  const zip = await JSZip.loadAsync(base64, { base64: true });
  const files: Record<string, string> = {};
  for (const [k, f] of Object.entries(zip.files)) {
    if (!f.dir && !k.startsWith('media/')) files[k] = await f.async('string');
  }
  return files;
}

/** Leser kartlegging, beregninger, flagg og oversettelser fra zip-filene slik Studio importerer dem. */
export function loadPackageFiles(files: Record<string, string>): Questionnaire {
  const quizKey = Object.keys(files).find((k) => k.endsWith('.questionnaire'));
  if (!quizKey) throw new Error('Mangler .questionnaire');
  let q = parseQuestionnaire(files[quizKey]);
  const calcs = Object.keys(files).filter((k) => k.endsWith('.calculation'))
    .map((k) => parseCalculationFile(files[k], q)).filter((c): c is Calculation => !!c);
  q.calculations = { calculations: calcs, norms: [] };
  q.flags = Object.keys(files).filter((k) => k.endsWith('.flag'))
    .map((k) => parseFlagFile(files[k], q)).filter((f): f is Flag => !!f);
  for (const k of Object.keys(files).filter((x) => x.endsWith('.translation'))) q = applyTranslationFile(q, files[k]);
  return q;
}

function simAnswers(q: Questionnaire, set: AnswerSet): Map<string, SimAnswer> {
  const m = new Map<string, SimAnswer>();
  for (const [code, a] of Object.entries(set.answers)) {
    if (Array.isArray(a)) continue;
    const o = optionOf(q, code, a);
    if (o) m.set(code, { score: o.score ?? 0, text: o.texts.NO ?? a });
    else if (a !== '' && !Number.isNaN(Number(a))) m.set(code, { score: Number(a), text: a });
  }
  return m;
}

export interface SimulatedSet {
  calculations: Record<string, number>;
  flags: Record<string, boolean>;
  report: Partial<Record<'NO' | 'EN', string>>;
}

/** Kjører Studios simulator på pakkefilene for ett svarsett. */
export function simulateSet(files: Record<string, string>, set: AnswerSet): SimulatedSet {
  const q = loadPackageFiles(files);
  const ctx: SimContext = { questionnaire: q, answers: simAnswers(q, set), patient: { name: 'Test Testesen', dob: '1990-01-01', gender: 2 } };
  const calculations = Object.fromEntries((q.calculations?.calculations ?? []).map((c) => [c.code, simulateCalculation(c.code, ctx)]));
  const flags = Object.fromEntries((q.flags ?? []).map((f) => [f.code, simulateFlag(f.code, ctx)]));
  const report: Partial<Record<'NO' | 'EN', string>> = {};
  for (const [k, content] of Object.entries(files)) {
    if (!k.endsWith('.rap')) continue;
    const lang = /\$language en\b/.test(content) ? 'EN' : 'NO';
    report[lang] = interpretRap(content, ctx);
  }
  return { calculations, flags, report };
}
