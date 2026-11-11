/**
 * Vitest tests for package-builder.ts
 *
 * Covers:
 *  1. buildPackageZip() returns a non-null BuiltPackage
 *  2. ZIP contains expected files/folders (manifest, quiz/, calculations/, flags/, norms/, reports/, media/, translations/)
 *  3. manifest.xml contains package code and name
 *  4. Minimal questionnaire (no calculations/flags/norms) works without errors
 *  5. Package with calculations, norms, and flags generates correct files
 *  6. Package with a mediaFile generates media file in ZIP
 */

import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { buildPackageZip } from './package-builder';
import type { Questionnaire, Calculation, Norm, Flag, MediaFile } from '../types/questionnaire';

// ─── Minimal questionnaire factory ────────────────────────────────────────

function makeMinimalQuestionnaire(overrides: Partial<Questionnaire> = {}): Questionnaire {
  return {
    code: 'TEST_Q',
    version: '1',
    release: '0',
    name: { NO: 'Test questionnaire', EN: 'Test questionnaire' } as Record<string, string>,
    type: 'QUESTIONNAIRE',
    defaultLanguage: 'NO',
    supportedLanguages: ['NO'],
    sections: [
      {
        id: 'sec1',
        code: 'SEC1',
        type: 'NORMAL',
        titles: { NO: 'Section 1' } as Record<string, string>,
        questions: [
          {
            id: 'q1',
            code: 'Q1',
            type: 'radiobutton',
            required: false,
            texts: { NO: 'Spørsmål 1' } as Record<string, string>,
            options: [
              { code: 'OPT1', score: 0, texts: { NO: 'Nei' } as Record<string, string> },
              { code: 'OPT2', score: 1, texts: { NO: 'Ja' } as Record<string, string> },
            ],
          },
        ],
      },
    ],
    ...overrides,
  } as Questionnaire;
}

// ─── Helper: decode base64 BuiltPackage into JSZip ────────────────────────

async function unzip(base64: string): Promise<JSZip> {
  // atob is available in happy-dom; convert to Uint8Array for JSZip.loadAsync
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return JSZip.loadAsync(bytes);
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('buildPackageZip()', () => {

  // ── Test 1: returns a non-null BuiltPackage ──────────────────────────────
  it('returns a BuiltPackage object (not undefined/null)', async () => {
    const q = makeMinimalQuestionnaire();
    const result = await buildPackageZip(q);

    expect(result).toBeDefined();
    expect(result).not.toBeNull();
    expect(result.base64).toBeTruthy();
    expect(typeof result.base64).toBe('string');
    expect(result.fileName).toBeTruthy();
    expect(result.sizeBytes).toBeGreaterThan(0);
    expect(Array.isArray(result.files)).toBe(true);
  });

  // ── Test 2: ZIP contains expected files/folders ──────────────────────────
  it('ZIP contains manifest, .project, and quiz/ folder files', async () => {
    const q = makeMinimalQuestionnaire();
    const result = await buildPackageZip(q);
    const zip = await unzip(result.base64);

    const fileNames = Object.keys(zip.files);

    // Manifest
    expect(fileNames).toContain('metadata/assessmentPackage.manifest');

    // .project
    expect(fileNames).toContain('.project');

    // quiz/ — the questionnaire file
    expect(fileNames).toContain(`quiz/${q.code}.questionnaire`);
  });

  it('manifest file list contains all standard folder entries', async () => {
    const q = makeMinimalQuestionnaire();
    const result = await buildPackageZip(q);
    const zip = await unzip(result.base64);

    const manifestFile = zip.files['metadata/assessmentPackage.manifest'];
    expect(manifestFile).toBeDefined();

    const manifestContent = await manifestFile.async('string');

    // All standard folders must appear in the manifest XML
    for (const folder of ['quiz', 'calculations', 'flags', 'norms', 'reports', 'media', 'translations']) {
      expect(manifestContent).toContain(`name="${folder}"`);
    }
  });

  // ── Test 3: manifest.xml contains package code and name ─────────────────
  it('manifest contains the questionnaire code and name', async () => {
    const q = makeMinimalQuestionnaire();
    const result = await buildPackageZip(q);
    const zip = await unzip(result.base64);

    const manifestFile = zip.files['metadata/assessmentPackage.manifest'];
    const content = await manifestFile.async('string');

    expect(content).toContain(`code="${q.code}"`);
    expect(content).toContain(`name="${q.name[q.defaultLanguage]}"`);
  });

  it('manifest uses custom PackageMetadata code when provided', async () => {
    const q = makeMinimalQuestionnaire();
    const pm = { code: 'CUSTOM_CODE', description: 'A custom package', isPublic: false };
    const result = await buildPackageZip(q, undefined, undefined, pm);
    const zip = await unzip(result.base64);

    const manifestFile = zip.files['metadata/assessmentPackage.manifest'];
    const content = await manifestFile.async('string');

    expect(content).toContain('code="CUSTOM_CODE"');
  });

  // ── Test 4: Minimal package (no calculations/flags/norms) ────────────────
  it('minimal questionnaire (no calculations/flags/norms) builds without errors', async () => {
    const q = makeMinimalQuestionnaire();
    // Should not throw
    await expect(buildPackageZip(q)).resolves.not.toThrow();

    const result = await buildPackageZip(q);
    const zip = await unzip(result.base64);

    // Only quiz/ should contain actual file entries (calculations/ etc. absent as entries)
    const fileNames = Object.keys(zip.files);
    const calcFiles = fileNames.filter((n) => n.startsWith('calculations/'));
    const flagFiles = fileNames.filter((n) => n.startsWith('flags/'));
    const normFiles = fileNames.filter((n) => n.startsWith('norms/'));

    expect(calcFiles).toHaveLength(0);
    expect(flagFiles).toHaveLength(0);
    expect(normFiles).toHaveLength(0);
  });

  it('BuiltPackage.files for minimal questionnaire has exactly 1 entry (the questionnaire)', async () => {
    const q = makeMinimalQuestionnaire();
    const result = await buildPackageZip(q);

    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe('quiz');
    expect(result.files[0].extension).toBe('questionnaire');
    expect(result.files[0].code).toBe(q.code);
  });

  it('fileName uses questionnaire code, version, and release', async () => {
    const q = makeMinimalQuestionnaire({ version: '3', release: '7' });
    const result = await buildPackageZip(q);

    expect(result.fileName).toBe(`${q.code}_v3.7.zip`);
  });

  // ── Test 5: Package with calculations, norms, and flags ─────────────────
  it('package with calculations generates .calculation files in ZIP', async () => {
    const calc: Calculation = {
      code: 'CALC1',
      name: 'Total score',
      type: 'SUM',
      innerCalculations: [{ questionCode: 'Q1' }],
    };
    const q = makeMinimalQuestionnaire({
      calculations: { calculations: [calc], norms: [] },
    });

    const result = await buildPackageZip(q);
    const zip = await unzip(result.base64);

    expect(Object.keys(zip.files)).toContain('calculations/CALC1.calculation');
    const calcContent = await zip.files['calculations/CALC1.calculation'].async('string');
    expect(calcContent).toContain('code="CALC1"');
    expect(calcContent).toContain('name="Total score"');
  });

  it('package with norms generates .norm files in ZIP', async () => {
    const norm: Norm = {
      code: 'NORM1',
      name: 'Reference norm',
      type: 'NORM',
      data: [
        { score: 0, normValue: 10 },
        { score: 5, normValue: 50 },
        { score: 10, normValue: 90 },
      ],
    };
    const q = makeMinimalQuestionnaire({
      calculations: { calculations: [], norms: [norm] },
    });

    const result = await buildPackageZip(q);
    const zip = await unzip(result.base64);

    expect(Object.keys(zip.files)).toContain('norms/NORM1.norm');
    const normContent = await zip.files['norms/NORM1.norm'].async('string');
    expect(normContent).toContain('code="NORM1"');
  });

  it('package with flags generates .flag files in ZIP', async () => {
    const flag: Flag = {
      code: 'FLAG1',
      name: 'High score flag',
      type: 'WARNING',
      logic: 'AND',
      conditions: [
        { calculationCode: 'CALC1', operator: 'GTE', threshold: 8 },
      ],
    };
    const q = makeMinimalQuestionnaire({ flags: [flag] });

    const result = await buildPackageZip(q);
    const zip = await unzip(result.base64);

    expect(Object.keys(zip.files)).toContain('flags/FLAG1.flag');
    const flagContent = await zip.files['flags/FLAG1.flag'].async('string');
    expect(flagContent).toContain('code="FLAG1"');
    expect(flagContent).toContain('name="High score flag"');
  });

  it('BuiltPackage.files lists calculation, norm, and flag entries', async () => {
    const calc: Calculation = {
      code: 'CALC1',
      name: 'Total',
      type: 'SUM',
      innerCalculations: [{ questionCode: 'Q1' }],
    };
    const norm: Norm = {
      code: 'NORM1',
      name: 'Norm',
      type: 'NORM',
      data: [{ score: 0, normValue: 0 }],
    };
    const flag: Flag = {
      code: 'FLAG1',
      name: 'Flag',
      type: 'INFO',
      logic: 'OR',
      conditions: [{ calculationCode: 'CALC1', operator: 'GT', threshold: 5 }],
    };
    const q = makeMinimalQuestionnaire({
      calculations: { calculations: [calc], norms: [norm] },
      flags: [flag],
    });

    const result = await buildPackageZip(q);

    const paths = result.files.map((f) => f.path);
    expect(paths).toContain('quiz');
    expect(paths).toContain('calculations');
    expect(paths).toContain('norms');
    expect(paths).toContain('flags');

    const calcEntry = result.files.find((f) => f.code === 'CALC1');
    expect(calcEntry).toBeDefined();
    expect(calcEntry!.extension).toBe('calculation');

    const normEntry = result.files.find((f) => f.code === 'NORM1');
    expect(normEntry).toBeDefined();
    expect(normEntry!.extension).toBe('norm');

    const flagEntry = result.files.find((f) => f.code === 'FLAG1');
    expect(flagEntry).toBeDefined();
    expect(flagEntry!.extension).toBe('flag');
  });

  // ── Test 6: Package with mediaFile generates media file ─────────────────
  it('package with a mediaFile generates the media file in ZIP', async () => {
    // Minimal 1x1 PNG in base64 (a real tiny PNG)
    const tinyPngB64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const mediaFile: MediaFile = {
      fileName: 'logo.png',
      extension: 'png',
      mimeType: 'image/png',
      dataUrl: `data:image/png;base64,${tinyPngB64}`,
      sizeKb: 1,
    };

    const q = makeMinimalQuestionnaire();
    const result = await buildPackageZip(q, undefined, [mediaFile]);
    const zip = await unzip(result.base64);

    expect(Object.keys(zip.files)).toContain('media/logo.png');
  });

  it('mediaFile is listed in BuiltPackage.files with path "media"', async () => {
    const tinyPngB64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const mediaFile: MediaFile = {
      fileName: 'image.jpg',
      extension: 'jpg',
      mimeType: 'image/jpeg',
      dataUrl: `data:image/jpeg;base64,${tinyPngB64}`,
      sizeKb: 1,
    };

    const q = makeMinimalQuestionnaire();
    const result = await buildPackageZip(q, undefined, [mediaFile]);

    const mediaEntry = result.files.find((f) => f.path === 'media');
    expect(mediaEntry).toBeDefined();
    expect(mediaEntry!.fileName).toBe('image.jpg');
    expect(mediaEntry!.extension).toBe('jpg');
  });

  it('mediaFile with no dataUrl is skipped', async () => {
    const mediaFile: MediaFile = {
      fileName: 'empty.png',
      extension: 'png',
      mimeType: 'image/png',
      dataUrl: '',
      sizeKb: 0,
    };

    const q = makeMinimalQuestionnaire();
    const result = await buildPackageZip(q, undefined, [mediaFile]);
    const zip = await unzip(result.base64);

    expect(Object.keys(zip.files)).not.toContain('media/empty.png');
    expect(result.files.find((f) => f.path === 'media')).toBeUndefined();
  });

  // ── Translations ─────────────────────────────────────────────────────────
  it('package with multiple supported languages generates translation files', async () => {
    const q = makeMinimalQuestionnaire({
      supportedLanguages: ['NO', 'EN'],
      name: { NO: 'Test norsk', EN: 'Test english' } as Record<string, string>,
    });

    const result = await buildPackageZip(q);
    const zip = await unzip(result.base64);

    // Should have a translation file for EN (non-default language)
    expect(Object.keys(zip.files)).toContain(`translations/${q.code}_EN.translation`);

    // Should NOT have a translation file for NO (default language)
    expect(Object.keys(zip.files)).not.toContain(`translations/${q.code}_NO.translation`);
  });

  it('translation entry is listed in BuiltPackage.files', async () => {
    const q = makeMinimalQuestionnaire({
      supportedLanguages: ['NO', 'EN'],
      name: { NO: 'Norsk', EN: 'English' } as Record<string, string>,
    });

    const result = await buildPackageZip(q);
    const translationEntry = result.files.find((f) => f.path === 'translations');
    expect(translationEntry).toBeDefined();
    expect(translationEntry!.extension).toBe('translation');
  });

  // ── RAP report files ──────────────────────────────────────────────────────
  it('rapFiles are placed in reports/ with .rap extension', async () => {
    const q = makeMinimalQuestionnaire();
    const rapFiles = { 'my_report': '/* $questionnaire */ /* $code */ /* $name */ body {}' };

    const result = await buildPackageZip(q, rapFiles);
    const zip = await unzip(result.base64);

    expect(Object.keys(zip.files)).toContain('reports/my_report.rap');
  });

  it('rapFiles already ending in .rap are not double-suffixed', async () => {
    const q = makeMinimalQuestionnaire();
    const rapFiles = { 'my_report.rap': '/* $questionnaire */ body {}' };

    const result = await buildPackageZip(q, rapFiles);
    const zip = await unzip(result.base64);

    expect(Object.keys(zip.files)).toContain('reports/my_report.rap');
    expect(Object.keys(zip.files)).not.toContain('reports/my_report.rap.rap');
  });

  // ── .project file ─────────────────────────────────────────────────────────
  it('.project file contains the questionnaire code as project name', async () => {
    const q = makeMinimalQuestionnaire();
    const result = await buildPackageZip(q);
    const zip = await unzip(result.base64);

    const projectFile = zip.files['.project'];
    expect(projectFile).toBeDefined();
    const content = await projectFile.async('string');
    expect(content).toContain(`<name>${q.code}</name>`);
  });
});
