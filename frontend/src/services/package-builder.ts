/**
 * Builds a Checkware Studio ZIP package from a Questionnaire + optional files.
 * Format mirrors what the Java client produces for PublishPackage.
 */
import JSZip from 'jszip';
import { lintRap, type RapLintIssue } from './rap-interpreter';
import type { Questionnaire, MediaFile, PackageMetadata } from '../types/questionnaire';
import {
  serializeQuestionnaire,
  serializeCalculation,
  serializeFlag,
  serializeNorm,
  serializeTranslation,
  esc,
  calculationQuestionnaireRef,
} from './xml-serializer';

export interface ManifestFile {
  fileName: string;
  path: string;
  extension: string;
  code: string;
}

function manifestXml(q: Questionnaire, files: ManifestFile[], pm?: PackageMetadata): string {
  const lang = q.defaultLanguage;
  const code = pm?.code || q.code;
  const name = q.name[lang] ?? code;
  const description = pm?.description ?? '';
  const isPublic = pm?.isPublic ?? false;
  const requiredSkills = pm?.requiredSkills ?? '';

  // Group files by folder
  const byFolder = new Map<string, ManifestFile[]>();
  for (const f of files) {
    if (!byFolder.has(f.path)) byFolder.set(f.path, []);
    byFolder.get(f.path)!.push(f);
  }

  const allFolders = ['quiz', 'calculations', 'flags', 'norms', 'reports', 'media', 'translations'];

  const folderXml = allFolders.map((folder) => {
    const folderFiles = byFolder.get(folder) ?? [];
    if (folderFiles.length === 0) return `    <folder name="${folder}"/>`;
    const fileLines = folderFiles
      .map(
        (f) =>
          `      <file fileName="${esc(f.fileName)}" path="${esc(f.path)}" extension="${esc(f.extension)}" code="${esc(f.code)}" id="${esc(f.fileName)}"/>`,
      )
      .join('\n');
    return `    <folder name="${folder}">\n${fileLines}\n    </folder>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<questionnaire:Manifest xmlns:questionnaire="http://questionnaire/1.0" code="${esc(code)}" description="${esc(description)}" public="${isPublic}" requiredSkills="${esc(requiredSkills)}" version="${esc(q.version)}" release="${esc(q.release ?? '0')}" name="${esc(name)}">
  <content>
${folderXml.join('\n')}
  </content>
</questionnaire:Manifest>`;
}

function projectXml(q: Questionnaire): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<projectDescription>
  <name>${q.code}</name>
  <comment></comment>
  <projects></projects>
  <buildSpec></buildSpec>
  <natures>
    <nature>com.checkware.studio.editor.projectNature</nature>
  </natures>
</projectDescription>`;
}

export interface BuiltPackage {
  base64: string;
  fileName: string;
  sizeBytes: number;
  files: ManifestFile[];
  /** Koder for beregninger som mangler referanse til kartleggingen (stopper installasjon i Checkware) */
  calcsMissingQuestionnaireRef: string[];
  /** Koder for rapporter som mangler `$language`/`$version` (stopper installasjon i Checkware) */
  rapsMissingHeaders: string[];
  /** Rapporter med funksjon/gruppe, men ufullstendig ramme (de uten ramme får den automatisk) */
  rapsMissingFrame: string[];
  /** Mediefiler med filtype Checkware FP6 ikke kan levere (gir HTTP 500 ved visning) */
  unsupportedMedia: string[];
  /** Konstruksjoner rapportmotoren ikke støtter, per rapportkode */
  rapLint: Record<string, RapLintIssue[]>;
}

/**
 * Filtyper Checkware FP6 kan levere (MediaMimeTypeEnum): pdf, docx, mp3, jpeg og png.
 * Andre typer installeres, men gir HTTP 500 når mediet hentes.
 */
export const ALLOWED_MEDIA_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  mp3: 'audio/mpeg',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export function isAllowedMediaFile(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return ext in ALLOWED_MEDIA_TYPES;
}

export function findUnsupportedMedia(mediaFiles: MediaFile[]): string[] {
  return mediaFiles.filter((m) => !isAllowedMediaFile(m.fileName)).map((m) => m.fileName);
}

/** Navnet ekte maler bruker (829 av 843 rapporter i storen) */
export const RAP_MAIN_FUNCTION = 'standard_rapport';

const hasRapFunction = (c: string) => /\[\s*function\s+\w+\s*\(/i.test(c);
const hasRapGroup = (c: string) => /\[\s*group\s*\(\s*"/i.test(c);
const hasRapCall = (c: string) => /\[\s*CALL\s+\w+\s*\(/i.test(c);

/**
 * Rapportmotoren lagrer bare tekst som ligger i en gruppe inne i en funksjon. Uten rammen
 * logges «Report generated successfully», men ingen rapport lagres.
 * Rapporter uten funksjon, gruppe og CALL pakkes inn; rapporter som allerede har ramme, røres ikke.
 */
export function ensureRapFrame(content: string, groupLabel = 'Rapport'): string {
  if (hasRapFunction(content) || hasRapGroup(content) || hasRapCall(content)) return content;
  let idx = 0;
  let m: RegExpExecArray | null;
  while ((m = RAP_HEADER_LINE.exec(content.slice(idx))) !== null) idx += m[0].length;
  const head = content.slice(0, idx);
  const body = content.slice(idx).replace(/\s+$/, '');
  return `${head}[CALL ${RAP_MAIN_FUNCTION}()]
[DIE]
[function ${RAP_MAIN_FUNCTION}()]
[group("${groupLabel.replace(/"/g, '')}",true)]
${body}
[group_end]
[function_end]
`;
}

/** Rapporter som mangler deler av rammen (funksjon, gruppe eller CALL) */
export function findRapsMissingFrame(rapFiles: Record<string, string>): string[] {
  return Object.entries(rapFiles)
    .filter(([, c]) => !(hasRapFunction(c) && hasRapGroup(c) && hasRapCall(c)))
    .map(([code]) => code);
}

/** Kartleggingsspråk → språkkode i rapportens `$language`-header (som i ekte pakker: norwegian → nb) */
export const LANG_TO_BCP47: Record<string, string> = {
  NO: 'nb', EN: 'en', SV: 'sv', DA: 'da', FI: 'fi', DE: 'de', FR: 'fr', PL: 'pl',
};

/** Standard `$version` for rapporter som mangler den (det vanligste i ekte pakker) */
export const DEFAULT_RAP_VERSION = '1.0';

const RAP_HEADER_LINE = /^[ \t]*\/\*\s*\$\w+[^*]*\*\/[ \t]*\r?\n/;

function hasRapHeader(content: string, key: string): boolean {
  return new RegExp(`/\\*\\s*\\$${key}\\s+[^*\\s][^*]*\\*/`).test(content);
}

/**
 * Checkware leser `$language` og `$version` fra rapporten ved installasjon.
 * Mangler de, feiler installasjonen med «Language  not found» (tomt felt).
 * Fyller tomme headere og legger manglende inn etter de eksisterende headerne.
 * Eksisterende verdier beholdes.
 */
export function ensureRapHeaders(content: string, language: string, version = DEFAULT_RAP_VERSION): string {
  let out = content
    .replace(/\/\*\s*\$version\s*\*\//, `/* $version ${version} */`)
    .replace(/\/\*\s*\$language\s*\*\//, `/* $language ${language} */`)
    .replace(/\/\*\s*\$clinicianOnly\s*\*\//, '/* $clinicianOnly false */');
  const missing: string[] = [];
  if (!hasRapHeader(out, 'version')) missing.push(`/* $version ${version} */`);
  if (!hasRapHeader(out, 'language')) missing.push(`/* $language ${language} */`);
  if (!hasRapHeader(out, 'clinicianOnly')) missing.push('/* $clinicianOnly false */');
  if (missing.length === 0) return out;
  let idx = 0;
  let m: RegExpExecArray | null;
  while ((m = RAP_HEADER_LINE.exec(out.slice(idx))) !== null) idx += m[0].length;
  out = out.slice(0, idx) + missing.join('\n') + '\n' + out.slice(idx);
  return out;
}

/** Finn rapporter som mangler `$language` eller `$version` */
export function findRapsMissingHeaders(rapFiles: Record<string, string>): string[] {
  return Object.entries(rapFiles)
    .filter(([, content]) => !hasRapHeader(content, 'language') || !hasRapHeader(content, 'version'))
    .map(([code]) => code);
}

/** Finn beregningsfiler som ikke peker på kartleggingen med <questionnaire href="…#kode"/> */
export function findCalcsMissingQuestionnaireRef(
  calcFiles: Record<string, string>,
  questionnaireCode: string,
): string[] {
  const ref = calculationQuestionnaireRef(questionnaireCode);
  return Object.entries(calcFiles)
    .filter(([, xml]) => !xml.includes(ref))
    .map(([code]) => code);
}

export async function buildPackageZip(
  q: Questionnaire,
  rapFiles?: Record<string, string>,
  mediaFiles?: MediaFile[],
  packageMetadata?: PackageMetadata,
): Promise<BuiltPackage> {
  const zip = new JSZip();
  const manifestFiles: ManifestFile[] = [];
  const calcXml: Record<string, string> = {};
  const rapOut: Record<string, string> = {};
  const rapLanguage = LANG_TO_BCP47[q.defaultLanguage] ?? q.defaultLanguage.toLowerCase();

  // ── Questionnaire ──────────────────────────────────────────────────────────
  zip.file(`quiz/${q.code}.questionnaire`, serializeQuestionnaire(q));
  manifestFiles.push({
    fileName: `${q.code}.questionnaire`,
    path: 'quiz',
    extension: 'questionnaire',
    code: q.code,
  });

  // ── Calculations ───────────────────────────────────────────────────────────
  for (const calc of q.calculations?.calculations ?? []) {
    const fileName = `${calc.code}.calculation`;
    const xml = serializeCalculation(calc, q.code);
    calcXml[calc.code] = xml;
    zip.file(`calculations/${fileName}`, xml);
    manifestFiles.push({ fileName, path: 'calculations', extension: 'calculation', code: calc.code });
  }

  // ── Norms ──────────────────────────────────────────────────────────────────
  for (const norm of q.calculations?.norms ?? []) {
    const fileName = `${norm.code}.norm`;
    zip.file(`norms/${fileName}`, serializeNorm(norm));
    manifestFiles.push({ fileName, path: 'norms', extension: 'norm', code: norm.code });
  }

  // ── Flags ──────────────────────────────────────────────────────────────────
  for (const flag of q.flags ?? []) {
    const fileName = `${flag.code}.flag`;
    zip.file(`flags/${fileName}`, serializeFlag(flag, q.code));
    manifestFiles.push({ fileName, path: 'flags', extension: 'flag', code: flag.code });
  }

  // ── Translations (non-default languages) ──────────────────────────────────
  for (const lang of q.supportedLanguages) {
    if (lang === q.defaultLanguage) continue;
    const fileName = `${q.code}_${lang}.translation`;
    zip.file(`translations/${fileName}`, serializeTranslation(q, lang, q.code));
    manifestFiles.push({ fileName, path: 'translations', extension: 'translation', code: q.code });
  }

  // ── Report (.rap) — one entry per file ────────────────────────────────────
  for (const [name, content] of Object.entries(rapFiles ?? {})) {
    if (!content) continue;
    const fileName = name.endsWith('.rap') ? name : `${name}.rap`;
    // Ensure RAP headers are populated — empty headers cause server errors.
    const rapCode = fileName.replace(/\.rap$/, '');
    const rapName = q.name[q.defaultLanguage] || q.code;
    const fixedContent = ensureRapFrame(ensureRapHeaders(
      content
        .replace(/\/\* \$questionnaire\s*\*\//, `/* $questionnaire ${q.code} */`)
        .replace(/\/\* \$code\s*\*\//, `/* $code ${rapCode} */`)
        .replace(/\/\* \$name\s*\*\//, `/* $name ${rapName} */`),
      rapLanguage,
    ));
    rapOut[rapCode] = fixedContent;
    zip.file(`reports/${fileName}`, fixedContent);
    manifestFiles.push({ fileName, path: 'reports', extension: 'rap', code: fileName.replace(/\.rap$/, '') });
  }

  // ── Media files ────────────────────────────────────────────────────────────
  for (const media of mediaFiles ?? []) {
    if (!media.dataUrl) continue;
    const commaIdx = media.dataUrl.indexOf(',');
    const b64 = commaIdx >= 0 ? media.dataUrl.slice(commaIdx + 1) : media.dataUrl;
    zip.file(`media/${media.fileName}`, b64, { base64: true });
    manifestFiles.push({ fileName: media.fileName, path: 'media', extension: media.extension, code: media.fileName });
  }

  // ── Manifest + project ────────────────────────────────────────────────────
  zip.file('.project', projectXml(q));
  zip.file('metadata/assessmentPackage.manifest', manifestXml(q, manifestFiles, packageMetadata));

  const buf = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  // Chunked encoding to avoid call stack overflow on large ZIPs
  let binary = '';
  const CHUNK = 8192;
  for (let i = 0; i < buf.length; i += CHUNK) {
    binary += String.fromCharCode(...buf.subarray(i, i + CHUNK));
  }
  const base64 = btoa(binary);

  return {
    base64,
    fileName: `${q.code}_v${q.version}.${q.release ?? '0'}.zip`,
    sizeBytes: buf.length,
    files: manifestFiles,
    calcsMissingQuestionnaireRef: findCalcsMissingQuestionnaireRef(calcXml, q.code),
    rapsMissingHeaders: findRapsMissingHeaders(rapOut),
    rapsMissingFrame: findRapsMissingFrame(rapOut),
    unsupportedMedia: findUnsupportedMedia(mediaFiles ?? []),
    rapLint: Object.fromEntries(Object.entries(rapOut).map(([c, content]) => [c, lintRap(content)]).filter(([, l]) => l.length > 0)),
  };
}
