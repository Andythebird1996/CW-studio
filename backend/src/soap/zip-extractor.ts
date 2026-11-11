import JSZip from 'jszip';

export interface ExtractedFile {
  path: string;
  fileName: string;
  extension: string;
  content: string;        // UTF-8 text or base64 for binary files
  encoding: 'text' | 'base64';
}

// Extensions that should be base64-encoded instead of decoded as UTF-8 text
const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg',
  'pdf', 'mp3', 'wav', 'ogg', 'mp4', 'avi',
  'ttf', 'otf', 'woff', 'woff2',
  'zip', 'jar',
]);

/**
 * Decode base64 ZIP and extract all text files.
 */
export async function extractZip(base64Data: string): Promise<ExtractedFile[]> {
  const buf = Buffer.from(base64Data, 'base64');
  const zip = await JSZip.loadAsync(buf);

  const results: ExtractedFile[] = [];

  for (const [rawPath, file] of Object.entries(zip.files)) {
    if (file.dir) continue;

    // Normalize Windows backslash paths
    const normalPath = rawPath.replace(/\\/g, '/');
    const fileName = normalPath.split('/').pop() ?? rawPath;
    const dotIdx = fileName.lastIndexOf('.');
    const extension = dotIdx >= 0 ? fileName.slice(dotIdx + 1) : '';

    const isBinary = BINARY_EXTENSIONS.has(extension.toLowerCase());
    const content = isBinary
      ? await file.async('base64')
      : await file.async('text');
    const encoding: 'text' | 'base64' = isBinary ? 'base64' : 'text';
    results.push({ path: normalPath, fileName, extension, content, encoding });
  }

  return results;
}
