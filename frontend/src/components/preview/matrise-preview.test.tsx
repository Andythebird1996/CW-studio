// Forhåndsvisning av matriseseksjoner (syntetisk innhold).
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RespondentSheet } from './AssessmentPreview';
import { parseQuestionnaire } from '../../services/xml-parser';

const NS = 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:questionnaire="http://questionnaire/1.0"';
const q = (code: string, tpl = 'QT1') =>
  `<contains xsi:type="questionnaire:Question" code="${code}" question="Spørsmål ${code}" mandatory="true" template="${tpl}"/>`;
const xml = (matrix: boolean, description = '') => `<?xml version="1.0" encoding="UTF-8"?>
<questionnaire:Questionnaire ${NS} code="MX" name="Matrise" version="1" language="norwegian">
  <responseTemplates>
    <responseTemplate questions="R1 R2" code="QT1" name="Ofte"><widget xsi:type="questionnaire:Radiobutton"/>
      <option xsi:type="questionnaire:TextOption" code="A0" value="0" label="Aldri"/>
      <option xsi:type="questionnaire:TextOption" code="A1" value="1" label="Noen ganger"/>
      <option xsi:type="questionnaire:TextOption" code="A2" value="2" label="Ofte"/>
    </responseTemplate>
  </responseTemplates>
  <section code="S1" matrix="${matrix}"${description ? ` description="${description}"` : ''}>
    <contains xsi:type="questionnaire:Text" code="T0" content="Innledning" contentStyle="normal"/>
    ${q('R1')}
    <contains xsi:type="questionnaire:Text" code="T2" content="Mellomtekst" contentStyle="normal"/>
    ${q('R2')}
  </section>
</questionnaire:Questionnaire>`;

function render(src: string, expertMode = false): string {
  const questionnaire = parseQuestionnaire(src);
  return renderToStaticMarkup(
    <RespondentSheet
      mode="page"
      questionnaire={questionnaire}
      lang={questionnaire.defaultLanguage}
      answers={new Map([['R2', 'A2']])}
      section={questionnaire.sections[0]}
      sectionOrdinal={0}
      questionStart={0}
      expertMode={expertMode}
    />,
  );
}

describe('forhåndsvisning av matrise', () => {
  it('første tekst som blokk, resten som tabell med alternativene som kolonner', () => {
    const html = render(xml(true));
    expect(html).toContain('data-testid="preview-matrix"');
    const table = html.slice(html.indexOf('<table'), html.indexOf('</table>'));
    expect(html.indexOf('Innledning')).toBeLessThan(html.indexOf('<table'));
    expect(table).not.toContain('Innledning');
    expect(table.match(/<th scope="col">/g)).toHaveLength(3);
    expect(table).toContain('Noen ganger');
    expect(table.match(/<th scope="row"/g)).toHaveLength(2);
    expect(table.match(/type="radio"/g)).toHaveLength(6);
    expect(table).toContain('cw-resp-matrix-text');
    expect(table).toContain('Mellomtekst');
    // Svaret på R2 vises i riktig kolonne
    expect(table).toContain(`aria-label="Ofte" name="R2-0" checked=""`);
    expect(table).not.toContain(`aria-label="Ofte" name="R1-0" checked=""`);
    // Nummereringen fortsetter gjennom radene
    expect(table).toContain('1. ');
    expect(table).toContain('2. ');
  });

  it('uten matrise vises spørsmålene som vanlig', () => {
    expect(render(xml(false))).not.toContain('preview-matrix');
  });

  it('tittel fra Section@description vises bare i ekspertvisning', () => {
    expect(render(xml(true, 'Skjult tittel'))).not.toContain('Skjult tittel');
    expect(render(xml(true, 'Skjult tittel'), true)).toContain('Skjult tittel');
  });
});
