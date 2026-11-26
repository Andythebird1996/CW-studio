/**
 * Checkware Studio XML serializer
 *
 * Converts TypeScript types back to the EMF XML format used by the
 * Checkware store server.  Each resource type has its own top-level
 * serialize function so package-builder can create individual files.
 */

import { expressionFingerprint } from './expression-raw';
import type {
  Questionnaire,
  Section,
  Question,
  LanguageType,
  ShowExpression,
  HideExpression,
  SimpleStatement,
  Calculation,
  InnerCalculation,
  Flag,
  FlagCondition,
  Norm,
  TextOption,
  ValueLabel,
  StringInputSize,
  RawLayout,
  StringInputQuestion,
  NumericInputQuestion,
  DateInputQuestion,
  SliderQuestion,
  RadiobuttonQuestion,
  CheckboxQuestion,
  ComboboxQuestion,
} from '../types/questionnaire';

// ─── XML escape ────────────────────────────────────────────────────────────

export function esc(s: string | undefined | null): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Linjeskift og tabulator må tegnkodes i attributter, ellers blir de til mellomrom når XML-en leses
    .replace(/\r/g, '&#13;')
    .replace(/\n/g, '&#10;')
    .replace(/\t/g, '&#9;');
}

// ─── Namespace header ──────────────────────────────────────────────────────

const NS = 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:questionnaire="http://questionnaire/1.0"';

// ─── Language mapping ──────────────────────────────────────────────────────

const LANG_REVERSE: Record<LanguageType, string> = {
  NO: 'norwegian', EN: 'english', SV: 'swedish', DA: 'danish',
  FI: 'finnish', DE: 'german', FR: 'french', PL: 'polish',
};

// ─── Expression serialization ──────────────────────────────────────────────

const OP_MAP: Record<SimpleStatement['operator'], string> = {
  EQ: 'equal', NEQ: 'notEqual', LT: 'less', LTE: 'lessOrEqual',
  GT: 'greater', GTE: 'greaterOrEqual', HAS_VALUE: 'hasValue', NO_VALUE: 'noValue',
};

function serializeStatement(stmt: SimpleStatement): string {
  return `<elements xsi:type="questionnaire:SimpleStatement" type="${OP_MAP[stmt.operator] ?? 'equal'}">
        <elements xsi:type="questionnaire:Function" name="${esc(stmt.fn ?? 'questionResponseValue')}">
          <parameter name="question" type="Question">
            <elements xsi:type="questionnaire:QuestionType" question="${esc(stmt.questionCode)}"/>
          </parameter>
        </elements>
        ${stmt.boolValue !== undefined
          ? `<elements xsi:type="questionnaire:BooleanBasicType" value="${stmt.boolValue}"/>`
          : stmt.value ? `<elements xsi:type="questionnaire:OptionType" option="${esc(stmt.value)}" question="${esc(stmt.questionCode)}"/>` : ''}
      </elements>`;
}

function serializeExpression(expr: ShowExpression | HideExpression, tag: string): string {
  // Uendret siden import: skriv uttrykket nøyaktig som det sto (også sammensatte uttrykk)
  if (expr?._raw && expr._raw.xml.startsWith(`<${tag}`) && expressionFingerprint(expr) === expr._raw.fingerprint) {
    return expr._raw.xml;
  }
  if (!expr || expr.statements.length === 0) return '';
  const inner = expr.statements.length === 1
    ? serializeStatement(expr.statements[0])
    : `<elements xsi:type="questionnaire:Operator" type="${expr.logic.toLowerCase()}">
        ${expr.statements.map(serializeStatement).join('\n')}
      </elements>`;
  return `<${tag}>${inner}</${tag}>`;
}

// ─── Response templates ────────────────────────────────────────────────────

function flattenAllQuestions(sections: Section[]): Question[] {
  return sections.flatMap((s) => [...s.questions, ...flattenAllQuestions(s.subSections ?? [])]);
}

/** Map our question type → Studio widget xsi:type short name */
const WIDGET_TYPE_MAP: Partial<Record<Question['type'], string>> = {
  radiobutton: 'Radiobutton',
  checkbox: 'Checkbox',
  combobox: 'Combobox',
  stringInput: 'StringInput',
  numericInput: 'NumericInput',
  dateInput: 'DateInput',
  slider: 'NumericSlider',
  rank: 'Radiobutton', // rank uses radiobutton widget in Studio
  image: 'ImageWidget',
  country: 'CountryWidget',
};

/** Flyttall slik EMF skriver dem: 0 → "0.0", 0.5 → "0.5". */
export function emfFloat(n: number): string {
  return Number.isInteger(n) ? n.toFixed(1) : String(n);
}

/** Antall desimaler → NumericInput step (0 → 1, 1 → 0.1, 2 → 0.01). */
export function stepFromDecimals(decimals: number | undefined): number {
  const d = Math.max(0, Math.min(6, Math.floor(decimals ?? 0)));
  return d === 0 ? 1 : Number((10 ** -d).toFixed(d));
}

/** Studio-størrelse → StringInputSize i Checkware-modellen (line | multiline | story). */
export function stringInputSizeAttr(size: StringInputSize | undefined, multiline?: boolean): 'line' | 'multiline' | 'story' {
  if (size === 'XLARGE') return 'story';
  if (size === 'LARGE' || multiline) return 'multiline';
  return 'line';
}

type WidgetOnlyQuestion = StringInputQuestion | NumericInputQuestion | DateInputQuestion | SliderQuestion;

export function isWidgetOnly(q: Question): q is WidgetOnlyQuestion {
  return q.type === 'stringInput' || q.type === 'numericInput' || q.type === 'dateInput' || q.type === 'slider';
}

/** Widget-attributter for felt uten svaralternativer. Spørsmålets felter er fasiten. */
export function widgetParamsFor(qq: WidgetOnlyQuestion): Record<string, string> {
  const wp: Record<string, string> = {};
  // Attributtnavn og verdiformat følger Checkware-modellen (questionnaire.ecore) og ekte
  // store-pakker: StringInput size=line|multiline|story, NumericWidget minValue/maxValue
  // som flyttall ("0.0"), DateInput addDate/addTime, NumericSlider med full attributtliste.
  if (qq.type === 'stringInput') {
    wp.size = stringInputSizeAttr(qq.size, qq.multiline);
  } else if (qq.type === 'numericInput') {
    if (qq.min !== undefined) wp.minValue = emfFloat(qq.min);
    if (qq.max !== undefined) wp.maxValue = emfFloat(qq.max);
    wp.step = emfFloat(stepFromDecimals(qq.decimals));
  } else if (qq.type === 'dateInput') {
    // Uten årsgrenser gir portalen min/max="Invalid date" (parseInt(undefined)); ekte pakker skriver
    // ingen grenser, så de skrives bare når de er satt.
    if (qq.minAbsoluteYear !== undefined) wp.minAbsoluteYear = String(qq.minAbsoluteYear);
    if (qq.maxAbsoluteYear !== undefined) wp.maxAbsoluteYear = String(qq.maxAbsoluteYear);
    if (qq.minRelativeYear !== undefined) wp.minRelativeYear = String(qq.minRelativeYear);
    if (qq.maxRelativeYear !== undefined) wp.maxRelativeYear = String(qq.maxRelativeYear);
    wp.addTime = String(qq.includeTime === true);
    wp.addDate = 'true';
  } else if (qq.type === 'slider') {
    const step = qq.step ?? 1;
    wp.minValue = emfFloat(qq.min);
    wp.maxValue = emfFloat(qq.max);
    wp.step = emfFloat(step);
    wp.labelStep = emfFloat(qq.labelStep ?? step);
    wp.showEndLabels = String(qq.showEndLabels ?? true);
    wp.showScaleLabels = String(qq.showScaleLabels ?? true);
    wp.valuePosition = qq.valuePosition ?? 'after';
    wp.labelPosition = qq.scaleLabelPosition ?? 'after';
    wp.direction = qq.direction ?? 'horizontal';
    if (qq.sliderLength !== undefined) wp.length = qq.sliderLength;
    wp.displayValue = String(qq.displayValue ?? false);
    wp.showTicks = String(qq.showTicks ?? false);
    wp.showDigitalPoints = String(qq.showDigitalPoints ?? false);
    wp.showClear = String(qq.showClear ?? true);
    wp.hairline = String(qq.hairline ?? false);
  }
  return wp;
}

/** Det to felt uten svaralternativer må ha like for å dele svarmal: widget-innstillingene og verdietikettene. */
function widgetKey(qq: WidgetOnlyQuestion): string {
  const labels = qq.type === 'slider' ? (qq.valueLabels ?? []).map((v) => [v.code, v.value, v.texts ?? null, v.imageFile ?? null]) : [];
  return `${qq.type}|${JSON.stringify(widgetParamsFor(qq))}|${JSON.stringify(labels)}`;
}

type TemplatedQuestion = WidgetOnlyQuestion | RadiobuttonQuestion | CheckboxQuestion | ComboboxQuestion;

function isTemplated(q: Question): q is TemplatedQuestion {
  return isWidgetOnly(q) || q.type === 'radiobutton' || q.type === 'checkbox' || q.type === 'combobox';
}

/**
 * Hva et spørsmål i en matrise deler med de andre radene: en delt svarmal, eller like innstillinger /
 * like svaralternativer. Spørsmål med samme nøkkel kan stå i samme matrise. null = ikke et svarfelt.
 */
export function matrixKey(q: Question): string | null {
  if (!isTemplated(q)) return null;
  if (q.responseTemplateCode) return `tpl:${q.responseTemplateCode}`;
  if (isWidgetOnly(q)) return `auto:${widgetKey(q)}`;
  const opts = (q.options ?? []).map((o) => [o.code, o.score ?? null, o.texts]);
  return `inline:${q.type}|${JSON.stringify(opts)}`;
}

/**
 * Delte svarmaler ved eksport:
 * - I en matrise deler spørsmål uten svarmal, men med like innstillinger/alternativer, malen til
 *   det første av dem (portalen viser matrisen ut fra én felles mal).
 * - Felt som deler svarmal (f.eks. én StringInput-mal for alle radene) beholder den delte malen så
 *   lenge innstillingene er like. Har et spørsmål fått andre innstillinger i editoren, får det sin
 *   egen mal i stedet for å endre de andre spørsmålene.
 */
function shareTemplates(q: Questionnaire): Questionnaire {
  const claimed = new Map<string, string>();
  const shareInMatrix = (questions: Question[]): Question[] => {
    const first = new Map<string, string>();
    return questions.map((qq) => {
      const key = matrixKey(qq);
      if (!key || !isTemplated(qq) || qq.responseTemplateCode) return qq;
      const owner = first.get(key);
      if (owner === undefined) {
        first.set(key, qq.code);
        return isWidgetOnly(qq) ? { ...qq, responseTemplateCode: qq.code } : qq;
      }
      return { ...qq, responseTemplateCode: owner };
    });
  };
  const fix = (sections: Section[]): Section[] => sections.map((sec) => ({
    ...sec,
    questions: (sec.matrix ? shareInMatrix(sec.questions) : sec.questions).map((qq) => {
      if (!isWidgetOnly(qq) || !qq.responseTemplateCode) return qq;
      const key = widgetKey(qq);
      const prev = claimed.get(qq.responseTemplateCode);
      if (prev === undefined) {
        claimed.set(qq.responseTemplateCode, key);
        return qq;
      }
      return prev === key ? qq : { ...qq, responseTemplateCode: undefined };
    }),
    subSections: sec.subSections ? fix(sec.subSections) : sec.subSections,
  }));
  return { ...q, sections: fix(q.sections) };
}

/** TextValueLabel / ImageValueLabel med samme attributter som ekte pakker */
export function serializeValueLabel(v: ValueLabel, lang: LanguageType): string {
  const value = v._rawValue !== undefined && Number(v._rawValue) === v.value ? v._rawValue : String(v.value);
  const desc = v.description !== undefined ? ` description="${esc(v.description)}"` : '';
  if (v.imageFile !== undefined) {
    return `<valueLabel xsi:type="questionnaire:ImageValueLabel" code="${esc(v.code)}" value="${esc(value)}"${desc} imageFile="${esc(v.imageFile)}"/>`;
  }
  const label = v.texts?.[lang] ?? Object.values(v.texts ?? {})[0] ?? '';
  return `<valueLabel xsi:type="questionnaire:TextValueLabel" code="${esc(v.code)}" value="${esc(value)}"${desc} label="${esc(label)}"/>`;
}

function serializeResponseTemplates(q: Questionnaire, lang: LanguageType): string {
  const allQs = flattenAllQuestions(q.sections);
  const templates = q.responseTemplates?.templates ?? [];

  // Build a map of existing template codes for dedup
  const templateMap = new Map(templates.map((t) => [t.code, t]));

  // Auto-create template entries for questions that have inline options (no shared template)
  for (const qq of allQs) {
    if (
      (qq.type === 'radiobutton' || qq.type === 'checkbox' || qq.type === 'combobox' || qq.type === 'rank') &&
      !('responseTemplateCode' in qq && qq.responseTemplateCode) &&
      qq.options != null && qq.options.length > 0
    ) {
      if (!templateMap.has(qq.code)) {
        templateMap.set(qq.code, {
          code: qq.code,
          name: qq.code,
          options: qq.options,
          widgetType: WIDGET_TYPE_MAP[qq.type] ?? 'Radiobutton',
        });
      }
    }
  }

  // Auto-create/override template entries for widget-only question types (stringInput,
  // numericInput, dateInput, slider). The question's current field values are the source
  // of truth for widgetParams — this keeps user edits in sync with the exported template.
  // Also syncs numberOfColumns / limit / ignoreAnswerOptionCode for radiobutton and checkbox.
  for (const qq of allQs) {
    if (qq.type === 'radiobutton' || qq.type === 'checkbox') {
      const hasExtras =
        (qq.type === 'radiobutton' && (qq.numberOfColumns !== undefined || qq.ignoreAnswerOptionCode)) ||
        (qq.type === 'checkbox' && (qq.numberOfColumns !== undefined || qq.limit !== undefined || qq.ignoreAnswerOptionCode));
      if (hasExtras) {
        const templateCode2 = qq.responseTemplateCode ?? qq.code;
        const existing = templateMap.get(templateCode2);
        const wp2: Record<string, string> = { ...(existing?.widgetParams ?? {}) };
        if (qq.numberOfColumns !== undefined) wp2.numberOfColumns = String(qq.numberOfColumns);
        if (qq.type === 'checkbox' && qq.limit !== undefined) wp2.limit = String(qq.limit);
        if (qq.ignoreAnswerOptionCode) wp2.ignoreAnswerOptionCode = qq.ignoreAnswerOptionCode;
        if (existing) {
          templateMap.set(templateCode2, { ...existing, widgetParams: wp2 });
        }
      }
    }
  }
  for (const qq of allQs) {
    if (isWidgetOnly(qq)) {
      const code = qq.responseTemplateCode ?? qq.code;
      const existing = templateMap.get(code);
      // Eldre Slider-mal med svaralternativer som skala: Studio redigerer den ikke, så den skrives uendret.
      if (existing?.widgetType === 'Slider' && qq.type === 'slider') continue;
      const wp = widgetParamsFor(qq);
      templateMap.set(code, {
        code,
        name: existing?.name ?? code,
        options: existing?.options ?? [],
        widgetType: WIDGET_TYPE_MAP[qq.type] ?? qq.type,
        widgetParams: Object.keys(wp).length > 0 ? wp : undefined,
        ...(qq.type === 'slider'
          ? (qq.valueLabels?.length ? { valueLabels: qq.valueLabels } : {})
          : (existing?.valueLabels && { valueLabels: existing.valueLabels })),
        ...(existing?._extraXml && { _extraXml: existing._extraXml }),
      });
    }
  }

  const allTemplates = Array.from(templateMap.values());
  if (allTemplates.length === 0) return '<responseTemplates/>';

  const tmplXml = allTemplates.map((tmpl) => {
    const related = allQs
      .filter((qq) =>
        (qq.type === 'radiobutton' || qq.type === 'checkbox' || qq.type === 'combobox' || qq.type === 'rank' ||
         qq.type === 'stringInput' || qq.type === 'numericInput' || qq.type === 'dateInput' || qq.type === 'slider') &&
        ('responseTemplateCode' in qq && qq.responseTemplateCode ? qq.responseTemplateCode : qq.code) === tmpl.code,
      )
      .map((qq) => qq.code)
      .join(' ');

    const opts = tmpl.options.map((o) => {
      const body = o.imageFile !== undefined
        ? `<option xsi:type="questionnaire:ImageOption" code="${esc(o.code)}" value="${o.score ?? 0}" imageFile="${esc(o.imageFile)}"`
        : `<option xsi:type="questionnaire:TextOption" code="${esc(o.code)}" value="${o.score ?? 0}" label="${esc(o.texts[lang] ?? '')}"`;
      return `      ${body}${o._extraXml ? `>${o._extraXml}</option>` : '/>'}`;
    }).join('\n');
    const labels = (tmpl.valueLabels ?? []).map((v) => `\n      ${serializeValueLabel(v, lang)}`).join('');

    // Determine widget xsi:type — prefer stored widgetType, else infer from options
    const widgetShortName = tmpl.widgetType ?? 'Radiobutton';
    const widgetAttrs = tmpl.widgetParams
      ? ' ' + Object.entries(tmpl.widgetParams).map(([k, v]) => `${k}="${esc(v)}"`).join(' ')
      : '';

    const questionsAttr = related ? `questions="${esc(related)}" ` : '';
    const nameAttr = tmpl.name !== undefined && tmpl.name !== tmpl.code ? ` name="${esc(tmpl.name)}"` : '';
    return `    <responseTemplate ${questionsAttr}code="${esc(tmpl.code)}"${nameAttr}>
      <widget xsi:type="questionnaire:${widgetShortName}"${widgetAttrs}/>
${opts}${labels}${tmpl._extraXml ? `\n      ${tmpl._extraXml}` : ''}
    </responseTemplate>`;
  }).join('\n');

  return `<responseTemplates>\n${tmplXml}\n  </responseTemplates>`;
}

// ─── Sections & questions ──────────────────────────────────────────────────

function serializeRawLayout(tag: 'layout' | 'layoutData', l: RawLayout | undefined): string {
  if (!l) return '';
  const attrs = Object.entries(l.attrs ?? {}).map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
  return `<${tag} xsi:type="${esc(l.type)}"${attrs}/>`;
}

function serializeContains(q: Question, lang: LanguageType, indent = '    '): string {
  const shows = (q.showExpressions ?? []).map((e) => serializeExpression(e, 'show')).join('');
  const hides = (q.hideExpressions ?? []).map((e) => serializeExpression(e, 'hide')).join('');
  const continueIfs = (q.continueIfExpressions ?? []).map((e) => serializeExpression(e as ShowExpression, 'continueIf')).join('');

  const alignAttr = q.align ? ` align="${q.align.toLowerCase()}"` : ' align="left"';
  const labelPosAttr = q.labelPosition ? ` labelPosition="${q.labelPosition}"` : '';

  const layoutData = serializeRawLayout('layoutData', q.layoutData);
  // Attributter og barn fra fila som Studio ikke redigerer (textExpression, defaultOption …)
  const extraAttrs = Object.entries(q._extraAttrs ?? {}).map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
  const extraXml = q._extraXml ?? '';

  // Elementer (Text, ImageElement, AudioVideo) kan også ha vis/skjul-betingelser og layoutData som barn.
  const closeEl = (open: string) =>
    (shows || hides || layoutData || extraXml
      ? `${open}${extraAttrs}>${shows}${hides}${layoutData}${extraXml}</contains>`
      : `${open}${extraAttrs}/>`);

  if (q.type === 'text') {
    const style = q.contentStyle ? ` contentStyle="${esc(q.contentStyle)}"` : ' contentStyle="normal"';
    return closeEl(`${indent}<contains xsi:type="questionnaire:Text" code="${esc(q.code)}" content="${esc(q.texts[lang] ?? '')}"${style}${alignAttr}${labelPosAttr}`);
  }

  // Bilde og lyd som i questionnaire.ecore og ekte pakker: ImageElement@imageFile, AudioVideo@audioVideoFile
  if (q.type === 'image') {
    const fileAttr = q.imageSrc ? ` imageFile="${esc(q.imageSrc)}"` : '';
    return closeEl(`${indent}<contains xsi:type="questionnaire:ImageElement" code="${esc(q.code)}"${fileAttr}`);
  }

  if (q.type === 'audioVideo') {
    const fileAttr = q.mediaFile ? ` audioVideoFile="${esc(q.mediaFile)}"` : '';
    return closeEl(`${indent}<contains xsi:type="questionnaire:AudioVideo" code="${esc(q.code)}"${fileAttr}`);
  }

  if (q.type === 'attachment') {
    const ft = q.fileType ? ` fileType="${q.fileType}"` : '';
    const mf = q.maxFiles !== undefined ? ` maxFiles="${q.maxFiles}"` : '';
    const ms = q.maxFileSize !== undefined ? ` maxFileSize="${q.maxFileSize}"` : '';
    return closeEl(`${indent}<contains xsi:type="questionnaire:Attachment" code="${esc(q.code)}" text="${esc(q.texts[lang] ?? '')}"${mf}${ms}${ft}`);
  }

  if (q.type === 'country') {
    return closeEl(`${indent}<contains xsi:type="widgets:CountryWidget" code="${esc(q.code)}" question="${esc(q.texts[lang] ?? '')}" mandatory="${q.required}"${alignAttr}${labelPosAttr}`);
  }

  const templateCode = 'responseTemplateCode' in q ? (q.responseTemplateCode ?? q.code) : q.code;
  const voluntary = ` voluntary="${q.voluntary === true}"`;
  const readOnly = ` readonly="${q.readonly === true}"`;
  const reversed = ` reversedScore="${q.reversedScore === true}"`;
  const helpText = q.helpTexts?.[lang] ? ` helpText="${esc(q.helpTexts[lang])}"` : '';
  const maxRankAttr = (q.type === 'rank' && q.maxRank !== undefined) ? ` maxRank="${q.maxRank}"` : '';

  return `${indent}<contains xsi:type="questionnaire:Question" code="${esc(q.code)}" question="${esc(q.texts[lang] ?? '')}" mandatory="${q.required}" template="${esc(templateCode)}"${voluntary}${readOnly}${reversed}${helpText}${maxRankAttr}${alignAttr}${labelPosAttr}${extraAttrs}>${shows}${hides}${continueIfs}${layoutData}${extraXml}</contains>`;
}

/**
 * Serveren lagrer ikke Section@description, og ekte pakker har ingen seksjonsnavn – overskrifter er et
 * Text-element med contentStyle="heading1/2/3" først i seksjonen. Studio eksporterer derfor tittelen
 * som et Text-element med denne koden, og parseren fjerner det igjen ved import.
 */
export function sectionTitleCode(sectionCode: string): string {
  return `${sectionCode}_TITLE`;
}

export const SECTION_TITLE_STYLE = 'heading2';

type SectionChild = { kind: 'q'; q: Question } | { kind: 's'; s: Section };

/**
 * Spørsmål og underseksjoner i rekkefølgen fra fila (childOrder). Plassene for spørsmål og for
 * underseksjoner beholdes og fylles i rekkefølgen fra editoren; flere elementer enn plasser havner
 * etter den siste plassen av samme slag.
 */
export function orderedChildren(section: Section): SectionChild[] {
  const qs: SectionChild[] = section.questions.map((q) => ({ kind: 'q', q }));
  const ss: SectionChild[] = (section.subSections ?? []).map((s) => ({ kind: 's', s }));
  const order = section.childOrder;
  if (!order) return [...qs, ...ss];
  const slots = (prefix: string) => order.flatMap((k, i) => (k.startsWith(prefix) ? [i] : []));
  const place = (list: SectionChild[], free: number[]) => {
    const end = free.length > 0 ? free[free.length - 1] : order.length;
    return list.map((c, i) => ({ c, rank: i < free.length ? free[i] : end + (i + 1) / 10000 }));
  };
  return [...place(qs, slots('q:')), ...place(ss, slots('s:'))]
    .sort((x, y) => x.rank - y.rank)
    .map((r) => r.c);
}

function serializeSection(section: Section, lang: LanguageType, depth = 0): string {
  const indent = '  '.repeat(depth + 1);
  const innerIndent = '  '.repeat(depth + 2);

  const showXml = (section.showExpressions ?? [])
    .map((e) => `${innerIndent}${serializeExpression(e, 'show')}`)
    .join('');
  const hideXml = (section.hideExpressions ?? [])
    .map((e) => `${innerIndent}${serializeExpression(e, 'hide')}`)
    .join('');
  const continueIfXml = (section.continueIfExpressions ?? [])
    .map((e) => `${innerIndent}${serializeExpression(e as ShowExpression, 'continueIf')}`)
    .join('');

  const sectionCode = section.code ?? section.id;
  const titleText = section.titles[lang] ?? '';
  const headingXml = titleText && !section.titleFromDescription
    ? `${innerIndent}<contains xsi:type="questionnaire:Text" code="${esc(sectionTitleCode(sectionCode))}" content="${esc(titleText)}" contentStyle="${SECTION_TITLE_STYLE}" align="left"/>`
    : '';
  const childrenXml = [headingXml, ...orderedChildren(section).map((c) =>
    (c.kind === 'q' ? serializeContains(c.q, lang, innerIndent) : serializeSection(c.s, lang, depth + 1)))]
    .filter(Boolean)
    .join('\n');
  const layoutDataXml = depth > 0 && section.layoutData ? `${innerIndent}${serializeRawLayout('layoutData', section.layoutData)}\n` : '';
  const layoutXml = section.layout ? `\n${innerIndent}${serializeRawLayout('layout', section.layout)}` : '';

  const sectionType = section.type ?? 'NORMAL';
  const sectionTypeAttr = sectionType !== 'NORMAL' ? ` sectionType="${sectionType}"` : '';
  const repeatCodeAttr = section.repeatCode ? ` repeatCode="${esc(section.repeatCode)}"` : '';
  const requiresNewPageAttr = ` requiresNewPage="${section.requiresNewPage === true}"`;
  const backgroundAttr = section.backgroundImage
    ? ` backgroundImage="${esc(section.backgroundImage)}" backgroundRepeat="${esc(section.backgroundRepeat ?? 'noRepeat')}" backgroundPosition="${esc(section.backgroundPosition ?? 'right')}"`
    : `${section.backgroundImage === '' ? ' backgroundImage=""' : ''}${section.backgroundRepeat ? ` backgroundRepeat="${esc(section.backgroundRepeat)}"` : ''}${section.backgroundPosition ? ` backgroundPosition="${esc(section.backgroundPosition)}"` : ''}`;
  // Seksjonsattributter fra modellen som Studio ikke redigerer ennå, men som skal overleve import/eksport
  const optBool = (name: string, v: boolean | undefined) => (v === undefined ? '' : ` ${name}="${v}"`);
  const layoutAttrs = optBool('noPageBreaks', section.noPageBreaks)
    + optBool('matrix', section.matrix)
    + optBool('autonumbering', section.autonumbering)
    + (section.numberingType ? ` numberingType="${esc(section.numberingType)}"` : '')
    + optBool('resetNumbering', section.resetNumbering)
    + (section.startOn !== undefined ? ` startOn="${section.startOn}"` : '')
    + optBool('returnToTOC', section.returnToTOC)
    + (section.returnToElement ? ` returnToElement="${esc(section.returnToElement)}"` : '');

  const tag = depth === 0 ? 'section' : 'contains xsi:type="questionnaire:Section"';
  const closeTag = depth === 0 ? 'section' : 'contains';

  // Section-modellen har ikke 'title'. description beholdes for eldre lesere, men den synlige
  // overskriften er Text-elementet over (sectionTitleCode). Parseren godtar også 'title' fra eldre eksporter.
  return `${indent}<${tag} code="${esc(sectionCode)}"${sectionTypeAttr}${repeatCodeAttr}${requiresNewPageAttr}${layoutAttrs}${backgroundAttr}${titleText || section.titleFromDescription ? ` description="${esc(titleText)}"` : ''}>
${showXml}${hideXml}${continueIfXml}${layoutDataXml}${childrenXml}${layoutXml}
${indent}</${closeTag}>`;
}

// ─── Dimensions ────────────────────────────────────────────────────────────

function serializeDimensions(q: Questionnaire): string {
  const dims = q.dimensions ?? [];
  if (dims.length === 0) return '<dimensions/>';
  const inner = dims.map((d) =>
    `    <dimension code="${esc(d.code)}"${d._noName && !d.name ? '' : ` name="${esc(d.name)}"`} question="${esc(d.questionCodes.join(' '))}"/>`
  ).join('\n');
  return `<dimensions>\n${inner}\n  </dimensions>`;
}

// ─── Main questionnaire serializer ────────────────────────────────────────

export function serializeQuestionnaire(input: Questionnaire): string {
  const q = shareTemplates(input);
  const lang = q.defaultLanguage;
  const langStr = LANG_REVERSE[lang] ?? 'norwegian';

  const sectionsXml = q.sections.map((s) => serializeSection(s, lang, 0)).join('\n');
  const rtXml = serializeResponseTemplates(q, lang);
  const dimsXml = serializeDimensions(q);

  const releaseAttr = q.release ? ` release="${esc(q.release)}"` : '';
  const descAttr = q.description?.[lang] ? ` description="${esc(q.description[lang])}"` : '';
  const clinicianOnlyAttr = q.clinicianOnly ? ' clinicianOnly="true"' : ' clinicianOnly="false"';
  // visualizeProgress er «unsettable» i modellen: skrives bare når den er satt (ekte pakker mangler den ofte)
  const visualizeProgressAttr = q.visualizeProgress ? ` visualizeProgress="${q.visualizeProgress}"` : '';
  const rootType = q.type === 'SCALE' ? 'Scale' : q.type === 'EXERCISE' ? 'Exercise' : 'Questionnaire';

  const b = (v: boolean | undefined, def: boolean) => (v ?? def) ? 'true' : 'false';
  const raw = q._rawRootElements ?? {};

  return `<?xml version="1.0" encoding="UTF-8"?>
<questionnaire:${rootType} ${NS} code="${esc(q.code)}" name="${esc(q.name[lang] ?? '')}"${descAttr} version="${esc(q.version)}"${releaseAttr} exportAllowed="${b(q.exportAllowed, true)}" authorizedDevicesOnly="${b(q.authorizedDevicesOnly, false)}"${clinicianOnlyAttr} language="${langStr}" allowTOC="${b(q.allowTOC, false)}" restrictBackButton="${b(q.restrictBackButton, false)}" allowSingleBackButton="${b(q.allowSingleBackButton, false)}" unresponsiveUI="${b(q.unresponsiveUI, false)}"${visualizeProgressAttr}>
${sectionsXml}${raw.copyright ? `\n  ${raw.copyright}` : ''}
  ${rtXml}
  ${dimsXml}
  <application id="Studio" version="1" fileVersion="1"/>${raw.calculations ? `\n  ${raw.calculations}` : ''}${raw.dictionary ? `\n  ${raw.dictionary}` : ''}
</questionnaire:${rootType}>`;
}

// ─── Calculation serializer (.calculation file) ────────────────────────────

function serializeInnerCalcExpression(
  calc: Calculation,
  questionnaireCode: string,
  questionnaireFile = `${questionnaireCode}.questionnaire`,
): string {
  const { type, innerCalculations } = calc;
  const qRef = (code: string) =>
    `../quiz/${esc(questionnaireFile)}#${esc(code)}`;
  const questionParam = (code: string) => `<parameter name="question" type="Question">
          <elements xsi:type="questionnaire:QuestionType">
            <question href="${qRef(code)}"/>
          </elements>
        </parameter>`;
  const num = (v: number) => `<elements xsi:type="questionnaire:NumberBasicType" value="${v}"/>`;

  /** Ett ledd: spørsmålsverdi, en annen beregning (CalculationType, som ekte pakker) eller et tall. */
  function termEl(ic: InnerCalculation): string {
    if (ic.constantValue !== undefined) return num(ic.constantValue);
    if (ic.calculationCode) return `<elements xsi:type="questionnaire:CalculationType" name="${esc(ic.calculationCode)}"/>`;
    return `<elements xsi:type="questionnaire:Function" name="questionResponseValue">
        ${questionParam(ic.questionCode ?? '')}
      </elements>`;
  }

  function maybeMultiply(ic: InnerCalculation): string {
    const base = termEl(ic);
    if (!ic.multiplier || ic.multiplier === 1) return base;
    return `<elements xsi:type="questionnaire:Operator" type="multiply">
        ${base}
        ${num(ic.multiplier)}
      </elements>`;
  }

  /** Antall besvarte: if(answered(Q) = true, 1, 0) per spørsmål, slik ekte pakker teller. Andre ledd teller som 1. */
  function countEl(ic: InnerCalculation): string {
    if (!ic.questionCode) return num(1);
    return `<elements xsi:type="questionnaire:Function" name="if">
        <parameter name="if" type="Boolean">
          <elements xsi:type="questionnaire:SimpleStatement" type="equal">
            <elements xsi:type="questionnaire:Function" name="answered">
              ${questionParam(ic.questionCode)}
            </elements>
            <elements xsi:type="questionnaire:BooleanBasicType" value="true"/>
          </elements>
        </parameter>
        <parameter name="then" type="Expression">
          ${num(1)}
        </parameter>
        <parameter name="else" type="Expression">
          ${num(0)}
        </parameter>
      </elements>`;
  }

  /** Uttrykket som ett <elements>-element (uten norm). */
  function valueEl(): string {
    if (innerCalculations.length === 0) return num(0);
    if (type === 'COUNT') {
      return `<elements xsi:type="questionnaire:Operator" type="plus">
      ${innerCalculations.map(countEl).join('\n      ')}
    </elements>`;
    }
    const sumExpr = `<elements xsi:type="questionnaire:Operator" type="plus">
      ${innerCalculations.map(maybeMultiply).join('\n      ')}
    </elements>`;
    if (type === 'MEAN') {
      return `<elements xsi:type="questionnaire:Operator" type="divide">
      ${sumExpr}
      ${num(innerCalculations.length)}
    </elements>`;
    }
    // SUM / CUSTOM. Ett enkelt beregningsledd skrives direkte, som verdien til normLookup i ekte pakker.
    if (innerCalculations.length === 1 && innerCalculations[0].calculationCode && !(innerCalculations[0].multiplier && innerCalculations[0].multiplier !== 1)) {
      return termEl(innerCalculations[0]);
    }
    return sumExpr;
  }

  let expr = valueEl();
  if (calc.normCode) {
    // Norm slik ekte pakker bruker den: normLookup(norm, verdi). Calculation har ikke noe norm-attributt i modellen.
    expr = `<elements xsi:type="questionnaire:Function" name="normLookup">
      <parameter name="norm" type="Norm">
        <elements xsi:type="questionnaire:NormType" name="${esc(calc.normCode)}"/>
      </parameter>
      <parameter name="value" type="Number">
        ${expr}
      </parameter>
    </elements>`;
  }
  return expr.replace(/^<elements\b/, '<calculationExpression').replace(/<\/elements>$/, '</calculationExpression>');
}

/**
 * Referansen til kartleggingen som Checkware-serveren leser skjemakoden fra ved installasjon.
 * Mangler den, feiler installasjonen med «Assessment  not found» (tom kode).
 */
export function calculationQuestionnaireRef(questionnaireCode: string, questionnaireFile = `${questionnaireCode}.questionnaire`): string {
  return `<questionnaire href="../quiz/${esc(questionnaireFile)}#${esc(questionnaireCode)}"/>`;
}

/** `questionnaireFile` er filnavnet kartleggingen har i pakken (standard: «KODE.questionnaire»). */
export function serializeCalculation(calc: Calculation, questionnaireCode: string, questionnaireFile?: string): string {
  // Prefer the preserved raw expression for lossless round-trip.
  // Fall back to rebuilding from innerCalculations (e.g. newly created calculations).
  const expr = calc._rawExpression ?? serializeInnerCalcExpression(calc, questionnaireCode, questionnaireFile);
  const assignedAttr = calc.assignedByVariable !== undefined ? ` assignedByVariable="${calc.assignedByVariable}"` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<questionnaire:Calculation ${NS} code="${esc(calc.code)}" name="${esc(calc.name)}"${assignedAttr}>
    ${expr}
  ${calculationQuestionnaireRef(questionnaireCode, questionnaireFile)}
  <application id="Studio" version="1" fileVersion="1"/>
</questionnaire:Calculation>`;
}

// ─── Flag serializer (.flag file) ─────────────────────────────────────────

const FLAG_OP: Record<FlagCondition['operator'], string> = {
  EQ: 'equal', NEQ: 'notEqual', LT: 'less', LTE: 'lessOrEqual',
  GT: 'greater', GTE: 'greaterOrEqual',
};

/** Én sammenligning slik ekte store-pakker skriver den: Operator(type) med CalculationType name + NumberBasicType */
function serializeFlagCondition(cond: FlagCondition, tag: 'flagExpression' | 'elements'): string {
  return `<${tag} xsi:type="questionnaire:Operator" type="${FLAG_OP[cond.operator] ?? 'greaterOrEqual'}">
      <elements xsi:type="questionnaire:CalculationType" name="${esc(cond.calculationCode)}"/>
      <elements xsi:type="questionnaire:NumberBasicType" value="${cond.threshold}"/>
    </${tag}>`;
}

function serializeFlagExpression(flag: Flag): string {
  if (flag.conditions.length === 0) {
    return '<flagExpression xsi:type="questionnaire:BooleanBasicType" value="false"/>';
  }
  if (flag.conditions.length === 1) return serializeFlagCondition(flag.conditions[0], 'flagExpression');
  return `<flagExpression xsi:type="questionnaire:Operator" type="${flag.logic.toLowerCase()}">
    ${flag.conditions.map((c) => serializeFlagCondition(c, 'elements')).join('\n    ')}
  </flagExpression>`;
}

/**
 * Flagg i samme form som ekte store-pakker: kartleggingen som barnenode med «#kode».
 * Uten «#kode» feiler installasjonen med «flag without quest found!».
 */
export function serializeFlag(flag: Flag, questionnaireCode: string, questionnaireFile?: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<questionnaire:Flag ${NS} code="${esc(flag.code)}" name="${esc(flag.name)}">
  ${calculationQuestionnaireRef(questionnaireCode, questionnaireFile)}
  <application id="Studio" version="1" fileVersion="1"/>
  ${serializeFlagExpression(flag)}
</questionnaire:Flag>`;
}

// ─── Norm serializer (.norm file) ─────────────────────────────────────────

export function serializeNorm(norm: Norm): string {
  const header = `<?xml version="1.0" encoding="UTF-8"?>
<questionnaire:Norm ${NS} code="${esc(norm.code)}" title="${esc(norm.name)}"${norm.description ? ` description="${esc(norm.description)}"` : ''}${norm.origin ? ` origin="${esc(norm.origin)}"` : ''}>`;

  if (norm.type === 'ZSCORE') {
    // ZSCORE norms: data[0].score = mean, data[0].normValue = stdDev
    const mean = norm.data[0]?.score ?? 0;
    const sd = norm.data[0]?.normValue ?? 0;
    return `${header}
  <normContent xsi:type="questionnaire:Mean" value="${mean}" stdDev="${sd}"/>
  <application id="Studio" version="1" fileVersion="1"/>
</questionnaire:Norm>`;
  }

  const lookups = norm.data.map((row, i) => {
    const next = norm.data[i + 1];
    // Importerte normer beholder grensene slik de var; nye normer får lookupMax midt mellom radene
    const max = norm._preserveBounds ? row.max : next ? next.score - 0.5 : row.score + 0.5;
    const maxAttr = max !== undefined ? ` lookupMax="${max}"` : '';
    const typeAttr = row.intervalType ? ` type="${esc(row.intervalType)}"` : '';
    return `    <lookup value="${row.normValue}" lookupMin="${row.score}"${maxAttr}${typeAttr}${row.age !== undefined ? ` age="${row.age}"` : ''}${row.gender !== undefined ? ` gender="${row.gender}"` : ''}/>`;
  }).join('\n');

  return `${header}
  <normContent xsi:type="questionnaire:LookupTable">
${lookups}
  </normContent>
  <application id="Studio" version="1" fileVersion="1"/>
</questionnaire:Norm>`;
}

// ─── Translation serializer (.translation file) ────────────────────────────

export function serializeTranslation(
  q: Questionnaire,
  lang: LanguageType,
  questionnaireCode: string,
): string {
  const langStr = LANG_REVERSE[lang] ?? 'english';
  const lines: string[] = [];
  // Som ekte pakker: originalText er teksten på hovedspråket, så oversetteren ser hva som er oversatt
  const src = q.defaultLanguage;
  // Var originalText i den importerte fila en annen (eldre) tekst, og er hovedspråkteksten ikke endret
  // siden, skrives fila sin originalText tilbake.
  const kept = q._extraTranslations?.[lang]?.originalTexts ?? {};
  const orig = (text: string | undefined, code: string, entity: string, property: string) => {
    const k = kept[`${code}|${entity}|${property}`];
    const value = k && k.source === (text ?? '') ? k.original : text;
    return value ? ` originalText="${esc(value)}"` : '';
  };

  // Questionnaire name + description
  if (q.name[lang]) {
    lines.push(`  <translation code="${esc(questionnaireCode)}" entity="Questionnaire" property="name"${orig(q.name[src], questionnaireCode, 'Questionnaire', 'name')} translatedText="${esc(q.name[lang])}"/>`);
  }
  if (q.description?.[lang]) {
    lines.push(`  <translation code="${esc(questionnaireCode)}" entity="Questionnaire" property="description"${orig(q.description?.[src], questionnaireCode, 'Questionnaire', 'description')} translatedText="${esc(q.description[lang])}"/>`);
  }

  // Section titles
  function flattenSects(sects: Section[]): Section[] {
    const result: Section[] = [];
    const stack = [...sects].reverse();
    while (stack.length > 0) {
      const s = stack.pop()!;
      result.push(s);
      if (s.subSections?.length)
        for (let i = s.subSections.length - 1; i >= 0; i--) stack.push(s.subSections[i]);
    }
    return result;
  }
  for (const sec of flattenSects(q.sections)) {
    const titleStr = sec.titles[lang];
    const secCode = sec.code ?? sec.id;
    if (titleStr && secCode) {
      // Overskriften vises fra Text-elementet; Section/description beholdes for eldre lesere.
      if (!sec.titleFromDescription) lines.push(`  <translation code="${esc(sectionTitleCode(secCode))}" entity="Text" property="content"${orig(sec.titles[src], sectionTitleCode(secCode), 'Text', 'content')} translatedText="${esc(titleStr)}"/>`);
      lines.push(`  <translation code="${esc(secCode)}" entity="Section" property="description"${orig(sec.titles[src], secCode, 'Section', 'description')} translatedText="${esc(titleStr)}"/>`);
    }
  }

  // All questions (flat)
  for (const q2 of flattenAllQuestions(q.sections)) {
    // Bilde/lyd har ingen oversettbar tekst i modellen
    // Vedlegg (Attachment@text) har ingen oversettelser i ekte pakker
    if (q2.type !== 'image' && q2.type !== 'audioVideo' && q2.type !== 'attachment' && q2.texts[lang]) {
      const entity = q2.type === 'text' ? 'Text' : 'Question';
      const prop = q2.type === 'text' ? 'content' : 'question';
      lines.push(`  <translation code="${esc(q2.code)}" entity="${entity}" property="${prop}"${orig(q2.texts[src], q2.code, entity, prop)} translatedText="${esc(q2.texts[lang])}"/>`);
    }
    // Help text
    const helpText = q2.helpTexts?.[lang];
    if (helpText) {
      lines.push(`  <translation code="${esc(q2.code)}" entity="Question" property="helpText"${orig(q2.helpTexts?.[src], q2.code, 'Question', 'helpText')} translatedText="${esc(helpText)}"/>`);
    }
  }

  // Svaralternativer: både delte svarmaler og alternativer lagt direkte på spørsmålet
  const seenOptions = new Set<string>();
  const pushOption = (opt: TextOption) => {
    if (!opt.texts?.[lang] || seenOptions.has(opt.code)) return;
    seenOptions.add(opt.code);
    lines.push(`  <translation code="${esc(opt.code)}" entity="TextOption" property="label"${orig(opt.texts[src], opt.code, 'TextOption', 'label')} translatedText="${esc(opt.texts[lang])}"/>`);
  };
  for (const tmpl of q.responseTemplates?.templates ?? []) tmpl.options.forEach(pushOption);
  for (const q2 of flattenAllQuestions(q.sections)) {
    if ('options' in q2 && q2.options) q2.options.forEach(pushOption);
  }

  // Tekster ved verdier på skalaer (endetekster på glidebrytere): TextValueLabel/label
  const seenLabels = new Set<string>();
  const pushLabel = (v: ValueLabel) => {
    if (v.imageFile !== undefined || !v.texts?.[lang] || seenLabels.has(v.code)) return;
    seenLabels.add(v.code);
    lines.push(`  <translation code="${esc(v.code)}" entity="TextValueLabel" property="label"${orig(v.texts[src], v.code, 'TextValueLabel', 'label')} translatedText="${esc(v.texts[lang])}"/>`);
  };
  for (const q2 of flattenAllQuestions(q.sections)) if (q2.type === 'slider') (q2.valueLabels ?? []).forEach(pushLabel);
  for (const tmpl of q.responseTemplates?.templates ?? []) (tmpl.valueLabels ?? []).forEach(pushLabel);

  const extra = q._extraTranslations?.[lang];
  for (const x of extra?.xml ?? []) lines.push(`  ${x}`);
  const qName = extra?.questionnaireName ?? questionnaireCode;

  return `<?xml version="1.0" encoding="UTF-8"?>
<questionnaire:Translations ${NS} language="${langStr}" questionnaireName="${esc(qName)}">
  <application id="Studio" version="1" fileVersion="1"/>
${lines.join('\n')}
</questionnaire:Translations>`;
}
