/**
 * Semantisk sammenligning av to XML-dokumenter (rundtur-sjekk: original pakke → Studio → eksport).
 * Rekkefølgen på attributter spiller ingen rolle, og barn matches på kode/entity/property der de finnes.
 * Stiene er generiske (elementnavn og xsi:type, uten indekser), slik at like forskjeller kan telles på tvers av pakker.
 */
export type XmlDiffKind = 'lost' | 'added' | 'changed';

export interface XmlDiff {
  kind: XmlDiffKind;
  /** Generisk sti, f.eks. «questionnaire/section/contains[questionnaire:Question]» */
  path: string;
  /** Attributtnavn, «#text» for tekstinnhold, eller tom for hele elementet */
  attr: string;
  from?: string;
  to?: string;
}

const IGNORED_ATTRS = new Set(['xmi:version', 'xmlns', 'xsi:schemaLocation']);
const KEY_ATTRS = ['code', 'entity', 'property', 'language', 'key', 'id', 'fileName'];

function signature(el: Element): string {
  const type = el.getAttribute('xsi:type');
  return type ? `${el.localName}[${type}]` : el.localName;
}

function attrsOf(el: Element): Map<string, string> {
  const m = new Map<string, string>();
  for (const a of Array.from(el.attributes)) {
    if (IGNORED_ATTRS.has(a.name) || a.name.startsWith('xmlns:')) continue;
    m.set(a.name, a.value);
  }
  return m;
}

function childElements(el: Element): Element[] {
  return Array.from(el.childNodes).filter((n): n is Element => n.nodeType === 1);
}

function ownText(el: Element): string {
  return Array.from(el.childNodes)
    .filter((n) => n.nodeType === 3 || n.nodeType === 4)
    .map((n) => n.textContent ?? '')
    .join('')
    .trim();
}

/** Like verdier som skrives ulikt: 1 / 1.0, true / TRUE, ekstra mellomrom */
export function sameValue(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.trim() === b.trim()) return true;
  const na = Number(a);
  const nb = Number(b);
  if (a.trim() !== '' && b.trim() !== '' && !Number.isNaN(na) && !Number.isNaN(nb)) return na === nb;
  if (/^(true|false)$/i.test(a) && /^(true|false)$/i.test(b)) return a.toLowerCase() === b.toLowerCase();
  return false;
}

function childKey(el: Element): string | null {
  const parts = KEY_ATTRS.map((k) => el.getAttribute(k)).filter((v): v is string => !!v);
  return parts.length ? parts.join('|') : null;
}

function diffElements(a: Element, b: Element, path: string, out: XmlDiff[]): void {
  const aa = attrsOf(a);
  const ba = attrsOf(b);
  for (const [k, v] of aa) {
    if (!ba.has(k)) out.push({ kind: 'lost', path, attr: k, from: v });
    else if (!sameValue(v, ba.get(k) ?? '')) out.push({ kind: 'changed', path, attr: k, from: v, to: ba.get(k) });
  }
  for (const [k, v] of ba) if (!aa.has(k)) out.push({ kind: 'added', path, attr: k, to: v });

  const at = ownText(a);
  const bt = ownText(b);
  if (at || bt) {
    if (!bt) out.push({ kind: 'lost', path, attr: '#text', from: at });
    else if (!at) out.push({ kind: 'added', path, attr: '#text', to: bt });
    else if (!sameValue(at, bt)) out.push({ kind: 'changed', path, attr: '#text', from: at, to: bt });
  }

  // Barn grupperes på signatur; innen gruppen matches de på nøkkel, ellers på plass
  const group = (els: Element[]) => {
    const m = new Map<string, Element[]>();
    for (const e of els) {
      const s = signature(e);
      m.set(s, [...(m.get(s) ?? []), e]);
    }
    return m;
  };
  const ag = group(childElements(a));
  const bg = group(childElements(b));
  for (const sig of new Set([...ag.keys(), ...bg.keys()])) {
    const childPath = `${path}/${sig}`;
    const as = ag.get(sig) ?? [];
    const bs = [...(bg.get(sig) ?? [])];
    const unmatchedA: Element[] = [];
    for (const ae of as) {
      const key = childKey(ae);
      const idx = key ? bs.findIndex((be) => childKey(be) === key) : -1;
      if (idx >= 0) diffElements(ae, bs.splice(idx, 1)[0], childPath, out);
      else unmatchedA.push(ae);
    }
    // Uten nøkkel (eller med endret nøkkel): på plass
    const n = Math.min(unmatchedA.length, bs.length);
    for (let i = 0; i < n; i++) diffElements(unmatchedA[i], bs[i], childPath, out);
    for (const ae of unmatchedA.slice(n)) out.push({ kind: 'lost', path: childPath, attr: '', from: childKey(ae) ?? undefined });
    for (const be of bs.slice(n)) out.push({ kind: 'added', path: childPath, attr: '', to: childKey(be) ?? undefined });
  }
}

export function diffXml(original: string, exported: string): XmlDiff[] {
  const parse = (s: string) => new DOMParser().parseFromString(s, 'application/xml').documentElement;
  const a = parse(original);
  const b = parse(exported);
  const out: XmlDiff[] = [];
  if (signature(a) !== signature(b)) {
    out.push({ kind: 'changed', path: '', attr: '(rotelement)', from: signature(a), to: signature(b) });
    return out;
  }
  diffElements(a, b, signature(a), out);
  return out;
}
