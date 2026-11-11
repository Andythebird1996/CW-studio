/**
 * Builds a Checkware Studio ZIP package from a Questionnaire + optional files.
 * Format mirrors what the Java client produces for PublishPackage.
 */
import JSZip from 'jszip';
import type { Questionnaire, MediaFile, PackageMetadata } from '../types/questionnaire';
import {
  serializeQuestionnaire,
  serializeCalculation,
  serializeFlag,
  serializeNorm,
  serializeTranslation,
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
          `      <file fileName="${f.fileName}" path="${f.path}" extension="${f.extension}" code="${f.code}" id="${f.fileName}"/>`,
      )
      .join('\n');
    return `    <folder name="${folder}">\n${fileLines}\n    </folder>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<questionnaire:Manifest xmlns:questionnaire="http://questionnaire/1.0" code="${code}" description="${description}" public="${isPublic}" requiredSkills="${requiredSkills}" version="${q.version}" release="${q.release ?? '0'}" name="${name}">
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
    <nature>projectNature</nature>
  </natures>
</projectDescription>`;
}

export interface BuiltPackage {
  base64: string;
  fileName: string;
  sizeBytes: number;
  files: ManifestFile[];
}

export async function buildPackageZip(
  q: Questionnaire,
  rapFiles?: Record<string, string>,
  mediaFiles?: MediaFile[],
  packageMetadata?: PackageMetadata,
): Promise<BuiltPackage> {
  const zip = new JSZip();
  const manifestFiles: ManifestFile[] = [];

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
    zip.file(`calculations/${fileName}`, serializeCalculation(calc, q.code));
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
    const fixedContent = content
      .replace(/\/\* \$questionnaire\s*\*\//, `/* $questionnaire ${q.code} */`)
      .replace(/\/\* \$code\s*\*\//, `/* $code ${rapCode} */`)
      .replace(/\/\* \$name\s*\*\//, `/* $name ${rapName} */`);
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
  };
}
