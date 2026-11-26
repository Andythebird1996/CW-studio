/**
 * Gi en mediefil nytt navn og oppdater alle steder som viser til den.
 *
 * Mediefiler refereres med filnavnet alene (ikke «media/…») i ekte pakker:
 * - ImageElement@imageFile, AudioVideo@audioVideoFile, Section@backgroundImage
 * - ImageOption@imageFile og ImageValueLabel@imageFile i svarmalene
 * - rapportene: <img src="fil.png"> (over 50 000 forekomster i store)
 * - manifestet: file@reference (dokumentlenker i menyen) med id der mellomrom er *
 * - rå XML Studio ikke redigerer (andre kartlegginger, ukjente barneelementer)
 */
import type {
  MediaFile, PackageMetadata, Question, Questionnaire, ResponseTemplate, Section, TextOption, ValueLabel,
} from '../types/questionnaire';

export interface MediaPackageState {
  questionnaire: Questionnaire;
  rapFiles?: Record<string, string>;
  mediaFiles?: MediaFile[];
  packageMetadata?: PackageMetadata;
}

export type MediaRefKind = 'image' | 'audio' | 'background' | 'option' | 'valueLabel' | 'text' | 'report' | 'documentLink' | 'other';

export interface MediaReference {
  kind: MediaRefKind;
  /** Kode for elementet, seksjonen, malen eller filnavnet til rapporten */
  where: string;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Filnavnet som helt verdi: etter " ' / = og før " ' \ ? # & eller slutt */
function boundaryRe(name: string): RegExp {
  return new RegExp(`(^|["'/=])${escapeRe(name)}(?=$|["'\\\\?#&])`, 'g');
}

function replaceIn(text: string, oldName: string, newName: string): string {
  let out = text.replace(boundaryRe(oldName), (_, pre: string) => `${pre}${newName}`);
  const oldEsc = xmlEsc(oldName);
  if (oldEsc !== oldName) out = out.replace(boundaryRe(oldEsc), (_, pre: string) => `${pre}${xmlEsc(newName)}`);
  return out;
}

function countIn(text: string | undefined, name: string): number {
  if (!text) return 0;
  const n = (text.match(boundaryRe(name)) ?? []).length;
  const e = xmlEsc(name);
  return n + (e !== name ? (text.match(boundaryRe(e)) ?? []).length : 0);
}

function walkSections(sections: Section[], fn: (s: Section) => Section): Section[] {
  return sections.map((s) => fn({ ...s, ...(s.subSections && { subSections: walkSections(s.subSections, fn) }) }));
}

function allSections(sections: Section[]): Section[] {
  return sections.flatMap((s) => [s, ...allSections(s.subSections ?? [])]);
}

/** Alle steder som viser til mediefila */
export function findMediaReferences(state: MediaPackageState, fileName: string): MediaReference[] {
  const refs: MediaReference[] = [];
  const q = state.questionnaire;
  const optRefs = (opts: TextOption[] | undefined, where: string) => {
    for (const o of opts ?? []) {
      if (o.imageFile === fileName) refs.push({ kind: 'option', where: `${where}/${o.code}` });
      if (countIn(o._extraXml, fileName)) refs.push({ kind: 'other', where: `${where}/${o.code}` });
    }
  };
  const labelRefs = (labels: ValueLabel[] | undefined, where: string) => {
    for (const v of labels ?? []) if (v.imageFile === fileName) refs.push({ kind: 'valueLabel', where: `${where}/${v.code}` });
  };
  for (const s of allSections(q.sections)) {
    const sc = s.code ?? s.id;
    if (s.backgroundImage === fileName) refs.push({ kind: 'background', where: sc });
    for (const qq of s.questions) {
      if (qq.type === 'image' && qq.imageSrc === fileName) refs.push({ kind: 'image', where: qq.code });
      if (qq.type === 'audioVideo' && qq.mediaFile === fileName) refs.push({ kind: 'audio', where: qq.code });
      if (qq.type === 'slider') labelRefs(qq.valueLabels, qq.code);
      if ('options' in qq) optRefs(qq.options, qq.code);
      if (Object.values(qq.texts ?? {}).some((t) => countIn(t, fileName) > 0)) refs.push({ kind: 'text', where: qq.code });
      const extra = [qq._extraXml, ...Object.values(qq._extraAttrs ?? {}).map((v) => `"${v}"`)].join('');
      if (countIn(extra, fileName)) refs.push({ kind: 'other', where: qq.code });
    }
  }
  for (const t of q.responseTemplates?.templates ?? []) {
    optRefs(t.options, t.code);
    labelRefs(t.valueLabels, t.code);
    if (countIn(t._extraXml, fileName)) refs.push({ kind: 'other', where: t.code });
  }
  for (const [name, content] of Object.entries(state.rapFiles ?? {})) {
    const n = countIn(content, fileName);
    for (let i = 0; i < n; i++) refs.push({ kind: 'report', where: name });
  }
  const pm = state.packageMetadata;
  if (pm?.documentLinks?.includes(fileName)) refs.push({ kind: 'documentLink', where: q.code });
  for (const [f, list] of Object.entries(pm?.otherReferences ?? {})) if (list.includes(fileName)) refs.push({ kind: 'other', where: f });
  for (const x of pm?.extraQuestionnaires ?? []) if (countIn(x.content, fileName)) refs.push({ kind: 'other', where: x.fileName });
  return refs;
}

const extOf = (n: string) => (n.includes('.') ? n.split('.').pop()!.toLowerCase() : '');

/** Feilkode om navnet ikke kan brukes, ellers null */
export function mediaRenameError(state: MediaPackageState, oldName: string, newName: string): 'empty' | 'exists' | 'extension' | 'invalid' | null {
  const n = newName.trim();
  if (!n) return 'empty';
  if (/[/\\"<>|:*?]/.test(n)) return 'invalid';
  if (extOf(n) !== extOf(oldName)) return 'extension';
  if (n !== oldName && (state.mediaFiles ?? []).some((m) => m.fileName === n)) return 'exists';
  return null;
}

/** Gi mediefila nytt navn og oppdater alle referanser. Returnerer ny tilstand (uendret ved feil). */
export function renameMediaFile(state: MediaPackageState, oldName: string, newNameRaw: string): MediaPackageState {
  const newName = newNameRaw.trim();
  if (oldName === newName || mediaRenameError(state, oldName, newName)) return state;
  const r = (v: string | undefined) => (v === oldName ? newName : v);
  const rt = (v: string | undefined) => (v === undefined ? v : replaceIn(v, oldName, newName));
  const opts = (list: TextOption[] | undefined) => list?.map((o) => ({
    ...o, ...(o.imageFile !== undefined && { imageFile: r(o.imageFile) }), ...(o._extraXml && { _extraXml: rt(o._extraXml) }),
  }));
  const labels = (list: ValueLabel[] | undefined) => list?.map((v) => (v.imageFile === oldName ? { ...v, imageFile: newName } : v));
  const texts = <T extends Record<string, string> | undefined>(t: T): T =>
    (t ? Object.fromEntries(Object.entries(t).map(([k, v]) => [k, replaceIn(v, oldName, newName)])) as T : t);

  const fixQuestion = (qq: Question): Question => {
    let out: Question = {
      ...qq,
      texts: texts(qq.texts),
      ...(qq._extraXml && { _extraXml: rt(qq._extraXml) }),
      ...(qq._extraAttrs && { _extraAttrs: Object.fromEntries(Object.entries(qq._extraAttrs).map(([k, v]) => [k, r(v) ?? v])) }),
    };
    if (out.type === 'image') out = { ...out, imageSrc: r(out.imageSrc) };
    else if (out.type === 'audioVideo') out = { ...out, mediaFile: r(out.mediaFile) };
    else if (out.type === 'slider') out = { ...out, ...(out.valueLabels && { valueLabels: labels(out.valueLabels) }) };
    if ((out.type === 'radiobutton' || out.type === 'checkbox' || out.type === 'combobox' || out.type === 'rank') && out.options) {
      out = { ...out, options: opts(out.options) ?? [] };
    }
    return out;
  };
  const fixTemplate = (t: ResponseTemplate): ResponseTemplate => ({
    ...t,
    options: opts(t.options) ?? [],
    ...(t.valueLabels && { valueLabels: labels(t.valueLabels) }),
    ...(t._extraXml && { _extraXml: rt(t._extraXml) }),
  });

  const q = state.questionnaire;
  const questionnaire: Questionnaire = {
    ...q,
    sections: walkSections(q.sections, (s) => ({
      ...s,
      ...(s.backgroundImage === oldName && { backgroundImage: newName }),
      questions: s.questions.map(fixQuestion),
    })),
    ...(q.responseTemplates && { responseTemplates: { templates: q.responseTemplates.templates.map(fixTemplate) } }),
  };

  const rapFiles = state.rapFiles
    ? Object.fromEntries(Object.entries(state.rapFiles).map(([k, v]) => [k, replaceIn(v, oldName, newName)]))
    : state.rapFiles;
  const mediaFiles = state.mediaFiles?.map((m) => (m.fileName === oldName ? { ...m, fileName: newName } : m));
  const pm = state.packageMetadata;
  const list = (l: string[] | undefined) => l?.map((x) => (x === oldName ? newName : x));
  const packageMetadata: PackageMetadata | undefined = pm && {
    ...pm,
    ...(pm.documentLinks && { documentLinks: list(pm.documentLinks) }),
    ...(pm.otherReferences && { otherReferences: Object.fromEntries(Object.entries(pm.otherReferences).map(([k, v]) => [k === oldName ? newName : k, list(v) ?? v])) }),
    ...(pm.extraQuestionnaires && { extraQuestionnaires: pm.extraQuestionnaires.map((x) => ({ ...x, content: replaceIn(x.content, oldName, newName) })) }),
    ...(pm.sourceFileNames && {
      sourceFileNames: {
        ...pm.sourceFileNames,
        ...(pm.sourceFileNames.order && { order: list(pm.sourceFileNames.order) }),
        ...(pm.sourceFileNames.noCode && { noCode: list(pm.sourceFileNames.noCode) }),
      },
    }),
  };
  return { questionnaire, rapFiles, mediaFiles, packageMetadata };
}
