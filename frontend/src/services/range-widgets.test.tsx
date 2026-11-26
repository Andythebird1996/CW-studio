// Range/Slider over svaralternativer og NumericRange, formet som i ekte store-pakker (syntetisk innhold).
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseQuestionnaire } from './xml-parser';
import { serializeQuestionnaire } from './xml-serializer';
import { diffXml } from './xml-semantic-diff';
import { RespondentSheet } from '../components/preview/AssessmentPreview';
import type { Question, Questionnaire, RadiobuttonQuestion, SliderQuestion } from '../types/questionnaire';

const NS = 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:questionnaire="http://questionnaire/1.0"';
const RANGE_ATTRS = 'showEndLabels="false" showScaleLabels="true" labelPosition="after" direction="vertical" displayValue="false" showTicks="true" showDigitalPoints="false" showClear="false" hairline="true"';
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<questionnaire:Questionnaire ${NS} code="RW" name="Range" version="1" language="norwegian">
  <responseTemplates>
    <responseTemplate questions="R1" code="QT1" name="Range - Vertical">
      <widget xsi:type="questionnaire:Range" ${RANGE_ATTRS}/>
      <option xsi:type="questionnaire:TextOption" code="QT1-O1" value="1" label="Lite"/>
      <option xsi:type="questionnaire:TextOption" code="QT1-O2" value="2" label="Middels"/>
      <option xsi:type="questionnaire:TextOption" code="QT1-O3" value="3" label="Mye"/>
    </responseTemplate>
    <responseTemplate questions="S1Q" code="QT2">
      <widget xsi:type="questionnaire:Slider" showEndLabels="true" showScaleLabels="true" labelPosition="after" direction="horizontal" displayValue="true" showTicks="false" hairline="false"/>
      <option xsi:type="questionnaire:TextOption" code="QT2-O1" value="0" label="Nei"/>
      <option xsi:type="questionnaire:TextOption" code="QT2-O2" value="1" label="Ja"/>
    </responseTemplate>
    <responseTemplate questions="N1" code="QT3">
      <widget xsi:type="questionnaire:NumericRange" minValue="0.0" maxValue="10.0" step="1.0" labelStep="1.0" showEndLabels="false" showScaleLabels="false" labelPosition="after" direction="vertical" displayValue="false" showTicks="false" hairline="false"/>
      <valueLabel xsi:type="questionnaire:TextValueLabel" code="QT3-VL1" value="0" label="Ingen"/>
    </responseTemplate>
  </responseTemplates>
  <section code="S1">
    <contains xsi:type="questionnaire:Question" code="R1" question="Range" mandatory="true" template="QT1"/>
    <contains xsi:type="questionnaire:Question" code="S1Q" question="Slider" mandatory="true" template="QT2"/>
    <contains xsi:type="questionnaire:Question" code="N1" question="NumericRange" mandatory="true" template="QT3"/>
  </section>
</questionnaire:Questionnaire>`;

const find = (q: Questionnaire, code: string): Question | undefined => q.sections[0].questions.find((x) => x.code === code);
const widgetsOf = (out: string) => [...out.matchAll(/<widget xsi:type="questionnaire:(\w+)"([^>]*)\/>/g)].map((m) => [m[1], m[2].trim()]);

describe('Range-widgets', () => {
  it('Range og Slider med alternativer leses som valgspørsmål, NumericRange som tallskyveknapp', () => {
    const q = parseQuestionnaire(xml);
    expect(find(q, 'R1')).toMatchObject({ type: 'radiobutton', choiceWidget: 'Range', choiceDirection: 'vertical', choiceDisplayValue: false, choiceShowTicks: true });
    expect((find(q, 'R1') as RadiobuttonQuestion).options?.map((o) => [o.code, o.score])).toEqual([['QT1-O1', 1], ['QT1-O2', 2], ['QT1-O3', 3]]);
    expect(find(q, 'S1Q')).toMatchObject({ type: 'radiobutton', choiceWidget: 'Slider' });
    expect(find(q, 'N1')).toMatchObject({ type: 'slider', rangeWidget: true, min: 0, max: 10, direction: 'vertical' });
  });

  it('overlever eksport uten endringer, også attributter som manglet', () => {
    const out = serializeQuestionnaire(parseQuestionnaire(xml));
    const relevant = diffXml(xml, out).filter((d) => d.path.includes('responseTemplate'));
    expect(relevant).toEqual([]);
    const w = widgetsOf(out);
    expect(w[0]).toEqual(['Range', RANGE_ATTRS]);
    expect(w[2][0]).toBe('NumericRange');
    expect(w[2][1]).not.toContain('valuePosition');
    expect(w[2][1]).not.toContain('showClear');
  });

  it('endret visning i editoren skrives riktig', () => {
    const q = parseQuestionnaire(xml);
    const sec = q.sections[0];
    sec.questions = sec.questions.map((x): Question => {
      if (x.code === 'R1' && x.type === 'radiobutton') return { ...x, choiceDirection: 'horizontal' };
      if (x.code === 'S1Q' && x.type === 'radiobutton') return { ...x, choiceWidget: undefined };
      if (x.code === 'N1' && x.type === 'slider') return { ...x, rangeWidget: undefined } satisfies SliderQuestion;
      return x;
    });
    const w = widgetsOf(serializeQuestionnaire(q));
    expect(w[0][1]).toContain('direction="horizontal"');
    expect(w[0][1]).toContain('hairline="true"');
    expect(w[1]).toEqual(['Radiobutton', '']);
    expect(w[2][0]).toBe('NumericSlider');
  });

  it('nytt valgspørsmål som Range får standardattributtene fra ekte pakker', () => {
    const q: Questionnaire = {
      code: 'NY', name: { NO: 'Ny' }, version: '1', release: '0', type: 'QUESTIONNAIRE', defaultLanguage: 'NO', supportedLanguages: ['NO'],
      sections: [{ id: 's', code: 'S', type: 'NORMAL', titles: { NO: 'S' }, questions: [
        { id: 'r', code: 'R', type: 'radiobutton', required: true, choiceWidget: 'Range', texts: { NO: 'R' },
          options: [{ code: 'R_0', score: 0, texts: { NO: 'A' } }, { code: 'R_1', score: 1, texts: { NO: 'B' } }] },
      ] }],
    } as Questionnaire;
    expect(widgetsOf(serializeQuestionnaire(q))[0]).toEqual(['Range',
      'showEndLabels="true" showScaleLabels="true" labelPosition="after" direction="horizontal" displayValue="true" showTicks="false" showDigitalPoints="false" showClear="true" hairline="false"']);
  });

  it('forhåndsvisningen viser alternativene på en skyveknapp', () => {
    const q = parseQuestionnaire(xml);
    const html = renderToStaticMarkup(
      <RespondentSheet mode="page" questionnaire={q} lang={q.defaultLanguage} answers={new Map([['R1', 'QT1-O2']])}
        section={q.sections[0]} sectionOrdinal={0} questionStart={0} expertMode={false} />,
    );
    expect(html.match(/data-testid="preview-choice-slider"/g)?.length).toBe(2);
    expect(html).toContain('data-widget="Range"');
    expect(html).toMatch(/type="range"[^>]*max="2"[^>]*value="1"|value="1"[^>]*max="2"/);
    for (const label of ['Lite', 'Middels', 'Mye']) expect(html).toContain(label);
  });
});
