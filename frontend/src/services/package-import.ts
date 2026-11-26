/**
 * Leser filene i en pakke (fra store eller zip) inn i Studios modell.
 * Samme vei som «Importer fra store», slik at rundtur-sjekken og versjonsvarselet bruker nøyaktig det samme.
 */
import type { Calculation, Flag, LanguageType, MediaFile, Norm, PackageMetadata, Questionnaire } from '../types/questionnaire';
import {
  applyTranslationFile,
  parseCalculationFile,
  parseFlagFile,
  parseManifestFile,
  parseNormFile,
  parseQuestionnaire,
  translationFileLanguage,
} from './xml-parser';
import { serializeTranslation } from './xml-serializer';

export interface PackageFileInput {
  fileName: string;
  extension: string;
  content: string;
  encoding: 'text' | 'base64';
}

export interface ImportedPackage {
  questionnaire: Questionnaire;
  rapFiles: Record<string, string>;
  mediaFiles: MediaFile[];
  packageMetadata?: PackageMetadata;
}

export const MEDIA_MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp',
  svg: 'image/svg+xml', pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', mp4: 'video/mp4',
};

const TR_RE = /<translation\b[^>]*?\scode="([^"]*)"[^>]*?\sentity="([^"]*)"[^>]*?\sproperty="([^"]*)"[^>]*?\soriginalText="([^"]*)"/g;
const unesc = (v: string) => v
  .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/**
 * originalText i en oversettelsesfil kan være en eldre tekst enn den kartleggingen har nå. Slike
 * huskes, så eksporten skriver dem likt tilbake så lenge teksten på hovedspråket ikke er endret.
 */
function keepOriginalTexts(q: Questionnaire, contents: string[]): Questionnaire {
  let out = q;
  for (const content of contents) {
    const lang = translationFileLanguage(content);
    if (!lang || lang === q.defaultLanguage) continue;
    const ours = new Map<string, string>();
    for (const m of serializeTranslation(out, lang, out.code).matchAll(TR_RE)) ours.set(`${m[1]}|${m[2]}|${m[3]}`, unesc(m[4]));
    const originalTexts: Record<string, { original: string; source: string }> = {};
    for (const m of content.matchAll(TR_RE)) {
      const key = `${m[1]}|${m[2]}|${m[3]}`;
      const original = unesc(m[4]);
      const source = ours.get(key);
      if (source !== undefined && source !== original) originalTexts[key] = { original, source };
    }
    if (Object.keys(originalTexts).length === 0) continue;
    const prev = out._extraTranslations?.[lang] ?? { xml: [] };
    out = { ...out, _extraTranslations: { ...(out._extraTranslations ?? {}), [lang]: { ...prev, originalTexts } } };
  }
  return out;
}

export function importPackageFiles(files: PackageFileInput[]): ImportedPackage {
  const byExt = (ext: string) => files.filter((f) => f.extension.toLowerCase() === ext);
  const qFile = byExt('questionnaire')[0];
  if (!qFile) throw new Error('Pakken mangler .questionnaire');

  let questionnaire = parseQuestionnaire(qFile.content);

  const calculations = byExt('calculation')
    .map((f) => parseCalculationFile(f.content, questionnaire))
    .filter((c): c is Calculation => !!c);
  const norms = byExt('norm')
    .map((f) => parseNormFile(f.content))
    .filter((n): n is Norm => !!n);
  if (calculations.length > 0 || norms.length > 0) {
    questionnaire = {
      ...questionnaire,
      calculations: {
        calculations: calculations.length > 0 ? calculations : questionnaire.calculations?.calculations ?? [],
        norms: [...(questionnaire.calculations?.norms ?? []), ...norms],
      },
    };
  }

  const flags = byExt('flag')
    .map((f) => parseFlagFile(f.content, questionnaire))
    .filter((f): f is Flag => !!f);
  if (flags.length > 0) questionnaire = { ...questionnaire, flags };

  for (const tf of byExt('translation')) questionnaire = applyTranslationFile(questionnaire, tf.content);
  questionnaire = keepOriginalTexts(questionnaire, byExt('translation').map((f) => f.content));

  const manifestFile = byExt('manifest')[0];
  const manifest = manifestFile ? (parseManifestFile(manifestFile.content) ?? undefined) : undefined;
  const extraQuestionnaires = byExt('questionnaire').slice(1).map((f) => ({ fileName: f.fileName, content: f.content }));
  // Filnavnene fra pakken beholdes ved eksport, så referansene til dem (beregninger, flagg,
  // manifest) ikke endres. Gir Studio kartleggingen ny kode, får fila nytt navn og referansene følger.
  const translations: Partial<Record<LanguageType, string>> = {};
  for (const tf of byExt('translation')) {
    const lang = translationFileLanguage(tf.content);
    if (lang && !translations[lang]) translations[lang] = tf.fileName;
  }
  const projectFile = files.find((f) => f.fileName === '.project' && f.encoding === 'text');
  const sourceFileNames = {
    ...(manifest?.sourceFileNames ?? {}),
    questionnaire: { fileName: qFile.fileName, code: questionnaire.code },
    ...(Object.keys(translations).length > 0 && { translations }),
  };
  const packageMetadata: PackageMetadata = {
    ...(manifest ?? { code: questionnaire.code, isPublic: false }),
    ...(extraQuestionnaires.length > 0 && { extraQuestionnaires }),
    sourceFileNames,
    ...(projectFile && { projectXml: projectFile.content }),
  };

  const rapFiles: Record<string, string> = {};
  for (const r of byExt('rap')) rapFiles[r.fileName] = r.content;

  // Mediefilene i samme rekkefølge som i manifestet
  const order = new Map((sourceFileNames.order ?? []).map((n, i) => [n, i] as const));
  const pos = (n: string) => order.get(n) ?? Number.MAX_SAFE_INTEGER;
  const mediaFiles: MediaFile[] = files
    .filter((f) => f.extension.toLowerCase() in MEDIA_MIME)
    .map((f, i) => ({ f, i }))
    .sort((a, b) => pos(a.f.fileName) - pos(b.f.fileName) || a.i - b.i)
    .map(({ f }) => f)
    .map((f) => {
      const mime = MEDIA_MIME[f.extension.toLowerCase()] ?? 'application/octet-stream';
      return {
        fileName: f.fileName,
        extension: f.extension,
        mimeType: mime,
        dataUrl: f.encoding === 'base64' ? `data:${mime};base64,${f.content}` : '',
        sizeKb: Math.round(f.content.length * 0.75 / 1024),
      };
    });

  return { questionnaire, rapFiles, mediaFiles, packageMetadata };
}
