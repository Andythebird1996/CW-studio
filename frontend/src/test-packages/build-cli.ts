/**
 * Bygger alle testpakkene til en mappe: <kode>_v1.<release>.zip + <kode>.expected.json + suite.json.
 *
 *   bun run test-packages [-- --out <mappe>] [--date 20261125] [--release 0]
 *
 * Publiserer ingenting og leser ingen pålogging.
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { buildSuite } from './suite';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const today = new Date();
const stamp = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
const date = arg('date', stamp);
const release = arg('release', '0');
const out = resolve(arg('out', 'test-packages-out'));

const suite = await buildSuite({ date, release });
mkdirSync(out, { recursive: true });
const index = [];
for (const p of suite) {
  writeFileSync(join(out, p.built.fileName), Buffer.from(p.built.base64, 'base64'));
  const expectedName = `${p.def.code}.expected.json`;
  writeFileSync(join(out, expectedName), JSON.stringify(p.expected, null, 2) + '\n');
  index.push({
    code: p.def.code, name: p.def.name, area: p.def.area,
    version: p.def.questionnaire.version, release: p.def.questionnaire.release,
    zip: p.built.fileName, expected: expectedName, sizeBytes: p.built.sizeBytes, files: p.built.files,
  });
  console.log(`${p.built.fileName}  (${p.built.sizeBytes} B)  + ${expectedName}`);
}
writeFileSync(join(out, 'suite.json'), JSON.stringify(index, null, 2) + '\n');
console.log(`\n${suite.length} pakker skrevet til ${out}`);
