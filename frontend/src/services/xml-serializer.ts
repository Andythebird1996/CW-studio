/**
 * Checkware Studio XML serializer
 *
 * Converts TypeScript types back to the EMF XML format used by the
 * Checkware store server.  Each resource type has its own top-level
 * serialize function so package-builder can create individual files.
 */

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
  StringInputSize,
} from '../types/questionnaire';

// ─── XML escape ────────────────────────────────────────────────────────────

export function esc(s: string | undefined | null): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
        <elements xsi:type="questionnaire:Function" name="questionResponseValue">
          <parameter name="question" type="Question">
            <elements xsi:type="questionnaire:QuestionType" question="${esc(stmt.questionCode)}"/>
          </parameter>
        </elements>
        ${stmt.value ? `<elements xsi:type="questionnaire:OptionType" option="${esc(stmt.value)}" question="${esc(stmt.questionCode)}"/>` : ''}
      </elements>`;
}

function serializeExpression(expr: ShowExpression | HideExpression, tag: string): string {
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
    if (qq.type === 'stringInput' || qq.type === 'numericInput' || qq.type === 'dateInput' || qq.type === 'slider') {
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
        wp.valuePosition = 'after';
        wp.labelPosition = 'after';
        wp.direction = qq.direction ?? 'horizontal';
        if (qq.sliderLength) wp.length = qq.sliderLength;
        wp.displayValue = String(qq.displayValue ?? false);
        wp.showTicks = String(qq.showTicks ?? false);
        wp.showDigitalPoints = String(qq.showDigitalPoints ?? false);
        wp.showClear = String(qq.showClear ?? true);
        wp.hairline = String(qq.hairline ?? false);
      }
      templateMap.set(qq.code, {
        code: qq.code,
        name: qq.code,
        options: [],
        widgetType: WIDGET_TYPE_MAP[qq.type] ?? qq.type,
        widgetParams: Object.keys(wp).length > 0 ? wp : undefined,
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
        (('responseTemplateCode' in qq && qq.responseTemplateCode === tmpl.code) || qq.code === tmpl.code),
      )
      .map((qq) => qq.code)
      .join(' ');

    const opts = tmpl.options.map((o) =>
      `      <option xsi:type="questionnaire:TextOption" code="${esc(o.code)}" value="${o.score ?? 0}" label="${esc(o.texts[lang] ?? '')}"/>`
    ).join('\n');

    // Determine widget xsi:type — prefer stored widgetType, else infer from options
    const widgetShortName = tmpl.widgetType ?? 'Radiobutton';
    const widgetAttrs = tmpl.widgetParams
      ? ' ' + Object.entries(tmpl.widgetParams).map(([k, v]) => `${k}="${esc(v)}"`).join(' ')
      : '';

    return `    <responseTemplate questions="${esc(related)}" code="${esc(tmpl.code)}">
      <widget xsi:type="questionnaire:${widgetShortName}"${widgetAttrs}/>
${opts}
    </responseTemplate>`;
  }).join('\n');

  return `<responseTemplates>\n${tmplXml}\n  </responseTemplates>`;
}

// ─── Sections & questions ──────────────────────────────────────────────────

function serializeContains(q: Question, lang: LanguageType, indent = '    '): string {
  const shows = (q.showExpressions ?? []).map((e) => serializeExpression(e, 'show')).join('');
  const hides = (q.hideExpressions ?? []).map((e) => serializeExpression(e, 'hide')).join('');
  const continueIfs = (q.continueIfExpressions ?? []).map((e) => serializeExpression(e as ShowExpression, 'continueIf')).join('');

  const alignAttr = q.align ? ` align="${q.align.toLowerCase()}"` : ' align="left"';
  const labelPosAttr = q.labelPosition ? ` labelPosition="${q.labelPosition}"` : '';

  // Elementer (Text, ImageElement, AudioVideo) kan også ha vis/skjul-betingelser som barn.
  const closeEl = (open: string) => (shows || hides ? `${open}>${shows}${hides}</contains>` : `${open}/>`);

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

  if (q.type === 'country') {
    return `${indent}<contains xsi:type="widgets:CountryWidget" code="${esc(q.code)}" question="${esc(q.texts[lang] ?? '')}" mandatory="${q.required}"${alignAttr}${labelPosAttr}/>`;
  }

  const templateCode = 'responseTemplateCode' in q ? (q.responseTemplateCode ?? q.code) : q.code;
  const voluntary = ` voluntary="${q.voluntary === true}"`;
  const readOnly = ` readonly="${q.readonly === true}"`;
  const reversed = ` reversedScore="${q.reversedScore === true}"`;
  const helpText = q.helpTexts?.[lang] ? ` helpText="${esc(q.helpTexts[lang])}"` : '';
  const maxRankAttr = (q.type === 'rank' && q.maxRank !== undefined) ? ` maxRank="${q.maxRank}"` : '';

  return `${indent}<contains xsi:type="questionnaire:Question" code="${esc(q.code)}" question="${esc(q.texts[lang] ?? '')}" mandatory="${q.required}" template="${esc(templateCode)}"${voluntary}${readOnly}${reversed}${helpText}${maxRankAttr}${alignAttr}${labelPosAttr}>${shows}${hides}${continueIfs}</contains>`;
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
  const headingXml = titleText
    ? `${innerIndent}<contains xsi:type="questionnaire:Text" code="${esc(sectionTitleCode(sectionCode))}" content="${esc(titleText)}" contentStyle="${SECTION_TITLE_STYLE}" align="left"/>`
    : '';
  const questionsXml = [headingXml, ...section.questions.map((q) => serializeContains(q, lang, innerIndent))]
    .filter(Boolean)
    .join('\n');

  const subSectionsXml = (section.subSections ?? [])
    .map((sub) => serializeSection(sub, lang, depth + 1))
    .join('\n');

  const sectionType = section.type ?? 'NORMAL';
  const sectionTypeAttr = sectionType !== 'NORMAL' ? ` sectionType="${sectionType}"` : '';
  const repeatCodeAttr = section.repeatCode ? ` repeatCode="${esc(section.repeatCode)}"` : '';
  const requiresNewPageAttr = ` requiresNewPage="${section.requiresNewPage === true}"`;
  const backgroundAttr = section.backgroundImage
    ? ` backgroundImage="${esc(section.backgroundImage)}" backgroundRepeat="${esc(section.backgroundRepeat ?? 'noRepeat')}" backgroundPosition="${esc(section.backgroundPosition ?? 'right')}"`
    : '';

  const tag = depth === 0 ? 'section' : 'contains xsi:type="questionnaire:Section"';
  const closeTag = depth === 0 ? 'section' : 'contains';

  // Section-modellen har ikke 'title'. description beholdes for eldre lesere, men den synlige
  // overskriften er Text-elementet over (sectionTitleCode). Parseren godtar også 'title' fra eldre eksporter.
  return `${indent}<${tag} code="${esc(sectionCode)}"${sectionTypeAttr}${repeatCodeAttr}${requiresNewPageAttr}${backgroundAttr}${titleText ? ` description="${esc(titleText)}"` : ''}>
${showXml}${hideXml}${continueIfXml}${questionsXml}${questionsXml && (subSectionsXml) ? '\n' : ''}${subSectionsXml}
${indent}</${closeTag}>`;
}

// ─── Dimensions ────────────────────────────────────────────────────────────

function serializeDimensions(q: Questionnaire): string {
  const dims = q.dimensions ?? [];
  if (dims.length === 0) return '<dimensions/>';
  const inner = dims.map((d) =>
    `    <dimension code="${esc(d.code)}" name="${esc(d.name)}" question="${esc(d.questionCodes.join(' '))}"/>`
  ).join('\n');
  return `<dimensions>\n${inner}\n  </dimensions>`;
}

// ─── Main questionnaire serializer ────────────────────────────────────────

export function serializeQuestionnaire(q: Questionnaire): string {
  const lang = q.defaultLanguage;
  const langStr = LANG_REVERSE[lang] ?? 'norwegian';

  const sectionsXml = q.sections.map((s) => serializeSection(s, lang, 0)).join('\n');
  const rtXml = serializeResponseTemplates(q, lang);
  const dimsXml = serializeDimensions(q);

  const releaseAttr = q.release ? ` release="${esc(q.release)}"` : '';
  const descAttr = q.description?.[lang] ? ` description="${esc(q.description[lang])}"` : '';
  const clinicianOnlyAttr = q.clinicianOnly ? ' clinicianOnly="true"' : ' clinicianOnly="false"';
  const visualizeProgressAttr = ` visualizeProgress="${q.visualizeProgress ?? 'Percentage'}"`;
  const rootType = q.type === 'SCALE' ? 'Scale' : q.type === 'EXERCISE' ? 'Exercise' : 'Questionnaire';

  const b = (v: boolean | undefined, def: boolean) => (v ?? def) ? 'true' : 'false';

  return `<?xml version="1.0" encoding="UTF-8"?>
<questionnaire:${rootType} ${NS} code="${esc(q.code)}" name="${esc(q.name[lang] ?? '')}"${descAttr} version="${esc(q.version)}"${releaseAttr} exportAllowed="${b(q.exportAllowed, true)}" authorizedDevicesOnly="${b(q.authorizedDevicesOnly, false)}"${clinicianOnlyAttr} language="${langStr}" allowTOC="${b(q.allowTOC, false)}" restrictBackButton="${b(q.restrictBackButton, false)}" allowSingleBackButton="${b(q.allowSingleBackButton, false)}" unresponsiveUI="${b(q.unresponsiveUI, false)}"${visualizeProgressAttr}>
${sectionsXml}
  ${rtXml}
  ${dimsXml}
  <application id="Studio" version="1" fileVersion="1"/>
</questionnaire:${rootType}>`;
}

// ─── Calculation serializer (.calculation file) ────────────────────────────

function serializeInnerCalcExpression(
  calc: Calculation,
  questionnaireCode: string,
): string {
  const { type, innerCalculations } = calc;
  const qRef = (code: string) =>
    `../quiz/${esc(questionnaireCode)}.questionnaire#${esc(code)}`;

  function questionValueEl(ic: InnerCalculation): string {
    return `<elements xsi:type="questionnaire:Function" name="questionResponseValue">
        <parameter name="question" type="Question">
          <elements xsi:type="questionnaire:QuestionType">
            <question href="${qRef(ic.questionCode ?? '')}"/>
          </elements>
        </parameter>
      </elements>`;
  }

  function maybeMultiply(ic: InnerCalculation): string {
    const base = questionValueEl(ic);
    if (!ic.multiplier || ic.multiplier === 1) return base;
    return `<elements xsi:type="questionnaire:Operator" type="multiply">
        ${base}
        <elements xsi:type="questionnaire:NumberBasicType" value="${ic.multiplier}"/>
      </elements>`;
  }

  if (innerCalculations.length === 0) {
    return `<calculationExpression xsi:type="questionnaire:NumberBasicType" value="0"/>`;
  }

  if (innerCalculations.length === 1) {
    const single = maybeMultiply(innerCalculations[0]);
    if (type === 'MEAN') {
      return `<calculationExpression xsi:type="questionnaire:Operator" type="divide">
      ${single}
      <elements xsi:type="questionnaire:NumberBasicType" value="1"/>
    </calculationExpression>`;
    }
    return `<calculationExpression xsi:type="questionnaire:Operator" type="plus">
      ${single}
    </calculationExpression>`;
  }

  const sumParts = innerCalculations.map(maybeMultiply).join('\n      ');
  const sumExpr = `<elements xsi:type="questionnaire:Operator" type="plus">
      ${sumParts}
    </elements>`;

  if (type === 'MEAN') {
    return `<calculationExpression xsi:type="questionnaire:Operator" type="divide">
      ${sumExpr}
      <elements xsi:type="questionnaire:NumberBasicType" value="${innerCalculations.length}"/>
    </calculationExpression>`;
  }

  if (type === 'COUNT') {
    // numberOfResponsesInSection — approximated as count of answered questions
    return `<calculationExpression xsi:type="questionnaire:Operator" type="plus">
      ${innerCalculations.map((ic) =>
        `<elements xsi:type="questionnaire:Function" name="answered">
        <parameter name="question" type="Question">
          <elements xsi:type="questionnaire:QuestionType">
            <question href="${qRef(ic.questionCode ?? '')}"/>
          </elements>
        </parameter>
      </elements>`
      ).join('\n      ')}
    </calculationExpression>`;
  }

  // SUM / CUSTOM
  return `<calculationExpression xsi:type="questionnaire:Operator" type="plus">
      ${sumParts}
    </calculationExpression>`;
}

/**
 * Referansen til kartleggingen som Checkware-serveren leser skjemakoden fra ved installasjon.
 * Mangler den, feiler installasjonen med «Assessment  not found» (tom kode).
 */
export function calculationQuestionnaireRef(questionnaireCode: string): string {
  return `<questionnaire href="../quiz/${esc(questionnaireCode)}.questionnaire#${esc(questionnaireCode)}"/>`;
}

export function serializeCalculation(calc: Calculation, questionnaireCode: string): string {
  // Prefer the preserved raw expression for lossless round-trip.
  // Fall back to rebuilding from innerCalculations (e.g. newly created calculations).
  const expr = calc._rawExpression ?? serializeInnerCalcExpression(calc, questionnaireCode);
  const normAttr = calc.normCode ? ` norm="../norms/${esc(calc.normCode)}.norm"` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<questionnaire:Calculation ${NS} code="${esc(calc.code)}" name="${esc(calc.name)}"${normAttr}>
    ${expr}
  ${calculationQuestionnaireRef(questionnaireCode)}
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
export function serializeFlag(flag: Flag, questionnaireCode: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<questionnaire:Flag ${NS} code="${esc(flag.code)}" name="${esc(flag.name)}">
  ${calculationQuestionnaireRef(questionnaireCode)}
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
    const max = next ? next.score - 0.5 : row.score + 0.5;
    return `    <lookup value="${row.normValue}" lookupMin="${row.score}" lookupMax="${max}"${row.age !== undefined ? ` age="${row.age}"` : ''}${row.gender !== undefined ? ` gender="${row.gender}"` : ''}/>`;
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

  // Questionnaire name + description
  if (q.name[lang]) {
    lines.push(`  <translation code="${esc(questionnaireCode)}" entity="Questionnaire" property="name" translatedText="${esc(q.name[lang])}"/>`);
  }
  if (q.description?.[lang]) {
    lines.push(`  <translation code="${esc(questionnaireCode)}" entity="Questionnaire" property="description" translatedText="${esc(q.description[lang])}"/>`);
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
      lines.push(`  <translation code="${esc(sectionTitleCode(secCode))}" entity="Text" property="content" translatedText="${esc(titleStr)}"/>`);
      lines.push(`  <translation code="${esc(secCode)}" entity="Section" property="description" translatedText="${esc(titleStr)}"/>`);
    }
  }

  // All questions (flat)
  for (const q2 of flattenAllQuestions(q.sections)) {
    // Bilde/lyd har ingen oversettbar tekst i modellen
    if (q2.type !== 'image' && q2.type !== 'audioVideo' && q2.texts[lang]) {
      const entity = q2.type === 'text' ? 'Text' : 'Question';
      const prop = q2.type === 'text' ? 'content' : 'question';
      lines.push(`  <translation code="${esc(q2.code)}" entity="${entity}" property="${prop}" translatedText="${esc(q2.texts[lang])}"/>`);
    }
    // Help text
    const helpText = q2.helpTexts?.[lang];
    if (helpText) {
      lines.push(`  <translation code="${esc(q2.code)}" entity="Question" property="helpText" translatedText="${esc(helpText)}"/>`);
    }
  }

  // Svaralternativer: både delte svarmaler og alternativer lagt direkte på spørsmålet
  const seenOptions = new Set<string>();
  const pushOption = (opt: TextOption) => {
    if (!opt.texts?.[lang] || seenOptions.has(opt.code)) return;
    seenOptions.add(opt.code);
    lines.push(`  <translation code="${esc(opt.code)}" entity="TextOption" property="label" translatedText="${esc(opt.texts[lang])}"/>`);
  };
  for (const tmpl of q.responseTemplates?.templates ?? []) tmpl.options.forEach(pushOption);
  for (const q2 of flattenAllQuestions(q.sections)) {
    if ('options' in q2 && q2.options) q2.options.forEach(pushOption);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<questionnaire:Translations ${NS} language="${langStr}" questionnaireName="${esc(questionnaireCode)}">
  <application id="Studio" version="1" fileVersion="1"/>
${lines.join('\n')}
</questionnaire:Translations>`;
}
