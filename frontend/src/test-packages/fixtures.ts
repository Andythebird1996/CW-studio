/**
 * Syntetiske mediefiler for testpakkene. Ingen lisensiert innhold:
 * - PNG lages i kode (rutemønster), PDF skrives som tekst,
 * - JPEG (32x32, blå med hvit firkant) og MP3 (440 Hz-tone, 0,5 s) er laget med ffmpeg.
 */
import type { MediaFile } from '../types/questionnaire';

export const JPEG_BASE64 = '/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYxLjE5LjEwMQD/2wBDAAgQEBMQExYWFhYWFhoYGhsbGxoaGhobGxsdHR0iIiIdHR0bGx0dICAiIiUmJSMjIiMmJigoKDAwLi44ODpFRVP/xABbAAEBAQAAAAAAAAAAAAAAAAAHAAUBAQEAAAAAAAAAAAAAAAAAAAAGEAEAAAAAAAAAAAAAAAAAAAAAEQABAgQHAQAAAAAAAAAAAAAREgRBADEDUSEUYRMBgSL/wAARCAAgACADASIAAhEAAxEA/9oADAMBAAIRAxEAPwDSSNqmvXuIZEmIp5MK2bahX0lIganfrCRJG0JFm9ynIARNfJOW2nT9KUYCg37xmNoSRes8ozAMDX2TZzp1fKlCIodu8ZbQkkWbPEcyRAU9k5c6hPylJiajbrCf/9k=';

export const MP3_BASE64 = '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';

function crc32(bytes: Uint8Array): number {
  let c = ~0;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const x of bytes) {
    a = (a + x) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

function concat(parts: (Uint8Array | number[])[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const td = concat([Array.from(type, (c) => c.charCodeAt(0)), data]);
  return concat([u32(data.length), td, u32(crc32(td))]);
}

/** Ukomprimert («stored») zlib-strøm – nok for små testbilder og uten avhengigheter. */
function zlibStored(raw: Uint8Array): Uint8Array {
  const blocks: (Uint8Array | number[])[] = [[0x78, 0x01]];
  for (let i = 0; i < raw.length || i === 0; i += 65535) {
    const part = raw.subarray(i, Math.min(raw.length, i + 65535));
    const last = i + 65535 >= raw.length ? 1 : 0;
    blocks.push([last, part.length & 255, part.length >>> 8, ~part.length & 255, (~part.length >>> 8) & 255], part);
    if (raw.length === 0) break;
  }
  blocks.push(u32(adler32(raw)));
  return concat(blocks);
}

/** Rutemønster-PNG (RGB) i to farger. */
export function makePng(w: number, h: number, a: [number, number, number], b: [number, number, number]): Uint8Array {
  const raw = new Uint8Array((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      const c = (x + y) % 16 < 8 ? a : b;
      raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2];
    }
  }
  const ihdr = new Uint8Array([...u32(w), ...u32(h), 8, 2, 0, 0, 0]);
  return concat([[137, 80, 78, 71, 13, 10, 26, 10], pngChunk('IHDR', ihdr), pngChunk('IDAT', zlibStored(raw)), pngChunk('IEND', new Uint8Array(0))]);
}

/** Minimal gyldig PDF (én side med en kort syntetisk tekst). */
export function makePdf(text: string): Uint8Array {
  const safe = text.replace(/[()\\]/g, '');
  const stream = `BT /F1 18 Tf 72 720 Td (${safe}) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(body.length); body += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = body.length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) body += `${String(off).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(body, (c) => c.charCodeAt(0));
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function mediaFile(fileName: string, mimeType: string, base64: string): MediaFile {
  return {
    fileName,
    extension: fileName.split('.').pop() ?? '',
    mimeType,
    dataUrl: `data:${mimeType};base64,${base64}`,
    sizeKb: Math.max(1, Math.ceil((base64.length * 3) / 4 / 1024)),
  };
}
