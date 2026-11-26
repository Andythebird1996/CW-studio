import { describe, it, expect } from 'vitest';
import { diffXml, sameValue } from './xml-semantic-diff';

const NS = 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:q="urn:q"';

describe('semantisk XML-sammenligning (rundtur)', () => {
  it('rekkefølge på attributter og like tall/boolske verdier gir ingen forskjell', () => {
    const a = `<q:Q ${NS} code="X"><section code="S1" a="1" b="true"/></q:Q>`;
    const b = `<q:Q ${NS} code="X"><section b="TRUE" a="1.0" code="S1"/></q:Q>`;
    expect(diffXml(a, b)).toEqual([]);
    expect(sameValue('2', '2.00')).toBe(true);
  });

  it('finner tapte, endrede og nye attributter og elementer med generisk sti', () => {
    const a = `<q:Q ${NS}><section code="S1"><contains xsi:type="q:Question" code="A" matrix="x"/><contains xsi:type="q:Question" code="B"/></section></q:Q>`;
    const b = `<q:Q ${NS}><section code="S1" extra="1"><contains xsi:type="q:Question" code="A" matrix="y"/></section></q:Q>`;
    const d = diffXml(a, b);
    const p = 'Q/section/contains[q:Question]';
    expect(d).toContainEqual({ kind: 'changed', path: p, attr: 'matrix', from: 'x', to: 'y' });
    expect(d).toContainEqual({ kind: 'lost', path: p, attr: '', from: 'B' });
    expect(d).toContainEqual({ kind: 'added', path: 'Q/section', attr: 'extra', to: '1' });
  });

  it('matcher barn på kode uavhengig av rekkefølge, og sammenligner tekstinnhold', () => {
    const a = `<r><t code="A" entity="Text"/><t code="B" entity="Text"/><v>1</v></r>`;
    const b = `<r><t code="B" entity="Text"/><t code="A" entity="Text"/><v>2</v></r>`;
    expect(diffXml(a, b)).toEqual([{ kind: 'changed', path: 'r/v', attr: '#text', from: '1', to: '2' }]);
  });
});
