/**
 * Leser filene i en pakke (fra store eller zip) inn i Studios modell.
 * Samme vei som «Importer fra store», slik at rundtur-sjekken og versjonsvarselet bruker nøyaktig det samme.
 */
import type { Calculation, Flag, MediaFile, Norm, PackageMetadata, Questionnaire } from '../types/questionnaire';
import {
  applyTranslationFile,
  parseCalculationFile,
  parseFlagFile,
  parseManifestFile,
  parseNormFile,
  parseQuestionnaire,
} from './xml-parser';

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

  const manifestFile = byExt('manifest')[0];
  const manifest = manifestFile ? (parseManifestFile(manifestFile.content) ?? undefined) : undefined;
  const extraQuestionnaires = byExt('questionnaire').slice(1).map((f) => ({ fileName: f.fileName, content: f.content }));
  const packageMetadata: PackageMetadata | undefined = extraQuestionnaires.length > 0
    ? { ...(manifest ?? { code: questionnaire.code, isPublic: false }), extraQuestionnaires }
    : manifest;

  const rapFiles: Record<string, string> = {};
  for (const r of byExt('rap')) rapFiles[r.fileName] = r.content;

  const mediaFiles: MediaFile[] = files
    .filter((f) => f.extension.toLowerCase() in MEDIA_MIME)
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
