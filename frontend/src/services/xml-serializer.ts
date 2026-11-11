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
} from '../types/questionnaire';

// ─── XML escape ────────────────────────────────────────────────────────────

function esc(s: string | undefined | null): string {
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
      if (qq.type === 'stringInput') {
        wp.size = qq.size ?? 'MEDIUM';
        if (qq.multiline) wp.multiline = 'true';
      } else if (qq.type === 'numericInput') {
        if (qq.min !== undefined) wp.min = String(qq.min);
        if (qq.max !== undefined) wp.max = String(qq.max);
        if (qq.decimals !== undefined) wp.decimals = String(qq.decimals);
        if (qq.unit) wp.unit = qq.unit;
      } else if (qq.type === 'dateInput') {
        if (qq.includeTime) wp.includeTime = 'true';
      } else if (qq.type === 'slider') {
        if (qq.min !== undefined) wp.min = String(qq.min);
        if (qq.max !== undefined) wp.max = String(qq.max);
        if (qq.step !== undefined) wp.step = String(qq.step);
        if (qq.minLabel?.[lang]) wp.labelMin = qq.minLabel[lang];
        if (qq.maxLabel?.[lang]) wp.labelMax = qq.maxLabel[lang];
        if (qq.showTicks !== undefined) wp.showTicks = String(qq.showTicks);
        if (qq.showEndLabels !== undefined) wp.showEndLabels = String(qq.showEndLabels);
        if (qq.showScaleLabels !== undefined) wp.showScaleLabels = String(qq.showScaleLabels);
        if (qq.showDigitalPoints !== undefined) wp.showDigitalPoints = String(qq.showDigitalPoints);
        if (qq.showClear !== undefined) wp.showClear = String(qq.showClear);
        if (qq.displayValue !== undefined) wp.displayValue = String(qq.displayValue);
        if (qq.direction) wp.direction = qq.direction;
        if (qq.sliderLength) wp.length = qq.sliderLength;
        if (qq.hairline !== undefined) wp.hairline = String(qq.hairline);
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

  if (q.type === 'text') {
    const style = q.contentStyle ? ` contentStyle="${esc(q.contentStyle)}"` : ' contentStyle="normal"';
    return `${indent}<contains xsi:type="questionnaire:Text" code="${esc(q.code)}" content="${esc(q.texts[lang] ?? '')}"${style}${alignAttr}${labelPosAttr}/>`;
  }

  if (q.type === 'image') {
    const srcAttr = q.imageSrc ? ` imageSrc="${esc(q.imageSrc)}"` : '';
    const altAttr = q.altText?.[lang] ? ` altText="${esc(q.altText[lang])}"` : '';
    return `${indent}<contains xsi:type="widgets:ImageWidget" code="${esc(q.code)}"${srcAttr}${altAttr}${alignAttr}${labelPosAttr}/>`;
  }

  if (q.type === 'country') {
    return `${indent}<contains xsi:type="widgets:CountryWidget" code="${esc(q.code)}" question="${esc(q.texts[lang] ?? '')}" mandatory="${q.required}"${alignAttr}${labelPosAttr}/>`;
  }

  const templateCode = 'responseTemplateCode' in q ? (q.responseTemplateCode ?? q.code) : q.code;
  const voluntary = q.voluntary ? ' voluntary="true"' : '';
  const readOnly = q.readonly ? ' readOnly="true"' : '';
  const reversed = q.reversedScore ? ' reversedScore="true"' : '';
  const helpText = q.helpTexts?.[lang] ? ` helpText="${esc(q.helpTexts[lang])}"` : '';
  const maxRankAttr = (q.type === 'rank' && q.maxRank !== undefined) ? ` maxRank="${q.maxRank}"` : '';

  return `${indent}<contains xsi:type="questionnaire:Question" code="${esc(q.code)}" question="${esc(q.texts[lang] ?? '')}" mandatory="${q.required}" template="${esc(templateCode)}"${voluntary}${readOnly}${reversed}${helpText}${maxRankAttr}${alignAttr}${labelPosAttr}>${shows}${hides}${continueIfs}</contains>`;
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

  const questionsXml = section.questions
    .map((q) => serializeContains(q, lang, innerIndent))
    .join('\n');

  const subSectionsXml = (section.subSections ?? [])
    .map((sub) => serializeSection(sub, lang, depth + 1))
    .join('\n');

  const sectionType = section.type ?? 'NORMAL';
  const sectionTypeAttr = sectionType !== 'NORMAL' ? ` sectionType="${sectionType}"` : '';
  const repeatCodeAttr = section.repeatCode ? ` repeatCode="${esc(section.repeatCode)}"` : '';
  const requiresNewPageAttr = section.requiresNewPage ? ` requiresNewPage="true"` : '';
  const titleText = section.titles[lang] ?? '';

  const tag = depth === 0 ? 'section' : 'contains xsi:type="questionnaire:Section"';
  const closeTag = depth === 0 ? 'section' : 'contains';

  // Desktop Studio EMF uses 'title' attribute; parser accepts 'title' || 'description' for round-trip compat
  return `${indent}<${tag} code="${esc(section.code ?? section.id)}"${sectionTypeAttr}${repeatCodeAttr}${requiresNewPageAttr}${titleText ? ` title="${esc(titleText)}"` : ''}>
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

export function serializeCalculation(calc: Calculation, questionnaireCode: string): string {
  // Prefer the preserved raw expression for lossless round-trip.
  // Fall back to rebuilding from innerCalculations (e.g. newly created calculations).
  const expr = calc._rawExpression ?? serializeInnerCalcExpression(calc, questionnaireCode);
  const normAttr = calc.normCode ? ` norm="../norms/${esc(calc.normCode)}.norm"` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<questionnaire:Calculation ${NS} code="${esc(calc.code)}" name="${esc(calc.name)}"${normAttr}>
    ${expr}
</questionnaire:Calculation>`;
}

// ─── Flag serializer (.flag file) ─────────────────────────────────────────

const FLAG_OP: Record<FlagCondition['operator'], string> = {
  EQ: 'equal', NEQ: 'notEqual', LT: 'less', LTE: 'lessOrEqual',
  GT: 'greater', GTE: 'greaterOrEqual',
};

function serializeFlagExpression(flag: Flag, questionnaireCode: string): string {
  if (flag.conditions.length === 0) {
    return '<flagExpression xsi:type="questionnaire:BooleanBasicType" value="false"/>';
  }

  const condEl = (cond: FlagCondition) =>
    `<elements xsi:type="questionnaire:SimpleStatement" type="${FLAG_OP[cond.operator] ?? 'greaterOrEqual'}">
      <elements xsi:type="questionnaire:CalculationType">
        <calculation href="../calculations/${esc(cond.calculationCode)}.calculation"/>
      </elements>
      <elements xsi:type="questionnaire:NumberBasicType" value="${cond.threshold}"/>
    </elements>`;

  if (flag.conditions.length === 1) {
    return `<flagExpression xsi:type="questionnaire:SimpleStatement" type="${FLAG_OP[flag.conditions[0].operator] ?? 'greaterOrEqual'}">
      <elements xsi:type="questionnaire:CalculationType">
        <calculation href="../calculations/${esc(flag.conditions[0].calculationCode)}.calculation"/>
      </elements>
      <elements xsi:type="questionnaire:NumberBasicType" value="${flag.conditions[0].threshold}"/>
    </flagExpression>`;
  }

  return `<flagExpression xsi:type="questionnaire:Operator" type="${flag.logic.toLowerCase()}">
    ${flag.conditions.map(condEl).join('\n    ')}
  </flagExpression>`;
}

export function serializeFlag(flag: Flag, questionnaireCode: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<questionnaire:Flag ${NS} code="${esc(flag.code)}" name="${esc(flag.name)}" questionnaire="../quiz/${esc(questionnaireCode)}.questionnaire">
  ${serializeFlagExpression(flag, questionnaireCode)}
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
    if (titleStr && sec.code) {
      lines.push(`  <translation code="${esc(sec.code)}" entity="Section" property="description" translatedText="${esc(titleStr)}"/>`);
    }
  }

  // All questions (flat)
  for (const q2 of flattenAllQuestions(q.sections)) {
    if (q2.texts[lang]) {
      const entity = q2.type === 'text' ? 'Text' : 'Question';
      const prop = q2.type === 'text' ? 'content' : 'question';
      lines.push(`  <translation code="${esc(q2.code)}" entity="${entity}" property="${prop}" translatedText="${esc(q2.texts[lang])}"/>`);
    }
    // Help text
    const helpText = q2.helpTexts?.[lang];
    if (helpText) {
      lines.push(`  <translation code="${esc(q2.code)}" entity="Question" property="helpText" translatedText="${esc(helpText)}"/>`);
    }
    // Slider min/max labels
    if (q2.type === 'slider') {
      const minLabel = q2.minLabel?.[lang];
      if (minLabel) lines.push(`  <translation code="${esc(q2.code)}" entity="Question" property="labelMin" translatedText="${esc(minLabel)}"/>`);
      const maxLabel = q2.maxLabel?.[lang];
      if (maxLabel) lines.push(`  <translation code="${esc(q2.code)}" entity="Question" property="labelMax" translatedText="${esc(maxLabel)}"/>`);
    }
  }

  // Response template options
  for (const tmpl of q.responseTemplates?.templates ?? []) {
    for (const opt of tmpl.options) {
      if (opt.texts[lang]) {
        lines.push(`  <translation code="${esc(opt.code)}" entity="TextOption" property="label" translatedText="${esc(opt.texts[lang])}"/>`);
      }
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<questionnaire:Translations ${NS} language="${langStr}" questionnaireName="${esc(questionnaireCode)}">
${lines.join('\n')}
</questionnaire:Translations>`;
}
