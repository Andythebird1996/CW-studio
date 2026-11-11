/**
 * SOAP client for Checkware Store API
 * Handles XML envelope building, HTTP auth, and response parsing
 */

const NS = 'http://checkware.com/store/';

export interface SoapConfig {
  wsdlUrl: string;
  user: string;
  password: string;
}

/** Derive service endpoint from WSDL URL by fetching and parsing it */
let cachedEndpoint: string | null = null;

/** True if the URL looks like a store WSDL rather than a REST endpoint */
export function looksLikeWsdlUrl(url: string): boolean {
  const u = url.toLowerCase();
  // A store WSDL must reference wsdl and must not point at the clinician REST API
  const isRest = /\/rest\/|\/clinician\/|\/respondent\/|backend-commons/.test(u);
  return u.includes('wsdl') && !isRest;
}

const WSDL_HINT =
  'Server-URL må peke på store-WSDL-en (skal ende på "store-api.wsdl"), ' +
  'ikke på klinikker-REST-API-et. Eksempel: ' +
  'https://cia.checkwareonline.com/v2/store/api/store-api.wsdl';

export async function getEndpoint(config: SoapConfig): Promise<string> {
  if (cachedEndpoint) return cachedEndpoint;

  if (!looksLikeWsdlUrl(config.wsdlUrl)) {
    throw new Error(`Ugyldig Server-URL: "${config.wsdlUrl}". ${WSDL_HINT}`);
  }

  const auth = btoa(`${config.user}:${config.password}`);
  const res = await fetch(config.wsdlUrl, {
    headers: { Authorization: `Basic ${auth}` },
  });

  if (!res.ok) {
    throw new Error(`Kunne ikke hente WSDL (HTTP ${res.status}). ${WSDL_HINT}`);
  }

  const text = await res.text();
  const match = text.match(/soap:address\s+location="([^"]+)"/i);
  if (!match) {
    // A JSON body (e.g. a Symfony error) means the URL is not a WSDL
    const looksLikeJson = text.trimStart().startsWith('{');
    throw new Error(
      looksLikeJson
        ? `Server-URL svarte med JSON, ikke en WSDL. ${WSDL_HINT}`
        : `Fant ikke tjeneste-endepunkt (soap:address) i WSDL. ${WSDL_HINT}`
    );
  }

  cachedEndpoint = match[1];
  return cachedEndpoint;
}

export function clearEndpointCache() {
  cachedEndpoint = null;
}

/** Build SOAP envelope */
function envelope(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tns="${NS}">
  <soap:Body>${body}</soap:Body>
</soap:Envelope>`;
}

/** Execute a SOAP operation */
async function call(config: SoapConfig, action: string, body: string): Promise<string> {
  const endpoint = await getEndpoint(config);
  const auth = btoa(`${config.user}:${config.password}`);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: `"${NS}${action}"`,
      Authorization: `Basic ${auth}`,
    },
    body: envelope(body),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`SOAP error ${res.status}: ${text}`);
  return text;
}

/** Parse text content from an XML tag */
function extractAll(xml: string, tag: string): string[] {
  const results: string[] = [];
  const re = new RegExp(`<(?:[^:>]+:)?${tag}[^>]*>([\\s\\S]*?)<\/(?:[^:>]+:)?${tag}>`, 'g');
  let m;
  while ((m = re.exec(xml)) !== null) results.push(m[1].trim());
  return results;
}

function extract(xml: string, tag: string): string {
  return extractAll(xml, tag)[0] ?? '';
}

function extractAttr(xml: string, tag: string, attr: string): string {
  const re = new RegExp(`<(?:[^:>]+:)?${tag}[^>]*\\s${attr}="([^"]*)"`, 'i');
  const m = xml.match(re);
  return m ? m[1] : '';
}

// ─── Public API operations ─────────────────────────────────────────────────

export interface PackageSummary {
  uid: number;
  name: string;
  code: string;
  version: string;
  release: string;
  isPublic: boolean;
}

export async function retreiveAvailablePackages(config: SoapConfig): Promise<PackageSummary[]> {
  const xml = await call(
    config,
    'RetreiveAvailablePackages',
    `<tns:retreiveAvailablePackages><arg0></arg0></tns:retreiveAvailablePackages>`,
  );

  // Response: <package><identifier><code>...</code><uid>...</uid>...</identifier></package>
  const items = extractAll(xml, 'package');
  return items.map((item) => {
    const ident = extract(item, 'identifier');
    return {
      uid: parseInt(extract(ident, 'uid') || '0', 10),
      name: extract(ident, 'name'),
      code: extract(ident, 'code'),
      version: extract(ident, 'version'),
      release: extract(ident, 'release'),
      isPublic: extract(ident, 'public') === 'true',
    };
  });
}

export interface PackageFile {
  path: string;
  fileName: string;
  extension: string;
  content: string;
  encoding: 'text' | 'base64';
}

export interface StudioPackage {
  uid: number;
  name: string;
  code: string;
  version: string;
  release: string;
  files: PackageFile[];
}

export async function retreivePackage(config: SoapConfig, uid: number): Promise<StudioPackage> {
  const { extractZip } = await import('./zip-extractor.ts');

  const xml = await call(
    config,
    'RetreivePackage',
    `<tns:retreivePackage><arg0>${uid}</arg0></tns:retreivePackage>`,
  );

  // Extract identifier from <content><identifier>
  const content = extract(xml, 'content');
  const ident = extract(content, 'identifier');

  // Decode base64 ZIP from <binaryFile><fileData>
  const b64 = extract(xml, 'fileData');
  const files = b64 ? await extractZip(b64) : [];

  return {
    uid,
    name: extract(ident, 'name'),
    code: extract(ident, 'code'),
    version: extract(ident, 'version'),
    release: extract(ident, 'release'),
    files,
  };
}

export interface ValidationResult {
  allowed: boolean;
  denials: string[];
}

export interface ManifestFileEntry {
  fileName: string;
  path: string;
  extension: string;
  code: string;
}

export interface PackagePayload {
  code: string;
  name: string;
  version: string;
  release: string;
  isPublic: boolean;
  base64Zip: string;
  fileName: string;
  sizeBytes: number;
  files?: ManifestFileEntry[];
}

function identifierXml(payload: PackagePayload): string {
  return `<identifier>
        <code>${payload.code}</code>
        <version>${payload.version}</version>
        <release>${payload.release}</release>
        <name>${payload.name}</name>
        <public>${payload.isPublic}</public>
      </identifier>`;
}

function fileListXml(files: ManifestFileEntry[]): string {
  return files
    .map(
      (f) => `<file>
        <fileName>${f.fileName}</fileName>
        <path>${f.path}</path>
        <extension>${f.extension}</extension>
        <code>${f.code}</code>
      </file>`,
    )
    .join('\n      ');
}

export async function validatePackage(
  config: SoapConfig,
  payload: PackagePayload,
): Promise<ValidationResult> {
  const files = fileListXml(payload.files ?? []);
  const body = `<tns:PublishPackageValidation>
    <PublishPackageValidationRequest>
      ${identifierXml(payload)}
      ${files}
    </PublishPackageValidationRequest>
  </tns:PublishPackageValidation>`;

  const xml = await call(config, 'PublishPackageValidation', body);

  const resp = extract(xml, 'return') || xml;
  const allowed = extract(resp, 'publishAllowed') === 'true' || xml.includes('publishAllowed>true');
  const denials = extractAll(resp, 'publishDenial').map((d) => extract(d, 'reason') || d);

  return { allowed, denials };
}

export async function publishPackage(
  config: SoapConfig,
  payload: PackagePayload,
): Promise<boolean> {
  const files = fileListXml(payload.files ?? []);
  const body = `<tns:PublishPackage>
    <PublishPackageRequest>
      <content>
        ${identifierXml(payload)}
        ${files}
      </content>
      <binaryFile>
        <fileName>${payload.fileName}</fileName>
        <fileSize>${payload.sizeBytes}</fileSize>
        <fileData>${payload.base64Zip}</fileData>
      </binaryFile>
    </PublishPackageRequest>
  </tns:PublishPackage>`;

  const xml = await call(config, 'PublishPackage', body);
  if (xml.includes('Fault')) return false;
  const status = extract(xml, 'publishStatus');
  return status === 'ok';
}
