/**
 * Checkware Studio XML parser
 *
 * Parses the EMF questionnaire XML format into TypeScript types.
 * XML format: <questionnaire:Questionnaire xmlns:questionnaire="http://questionnaire/1.0">
 */

import type {
  Questionnaire,
  QuestionnaireType,
  Section,
  SectionType,
  Question,
  ResponseTemplate,
  ResponseTemplates,
  TextOption,
  LanguageType,
  ShowExpression,
  HideExpression,
  ContinueIfExpression,
  SimpleStatement,
  Flag,
  FlagCondition,
  Calculation,
  Calculations,
  InnerCalculation,
  CalculationType,
  Dimension,
  PackageMetadata,
} from '../types/questionnaire';

// ─── Language mapping ──────────────────────────────────────────────────────

const LANG_MAP: Record<string, LanguageType> = {
  norwegian: 'NO',
  english: 'EN',
  swedish: 'SV',
  danish: 'DA',
  finnish: 'FI',
  german: 'DE',
  french: 'FR',
  polish: 'PL',
  no: 'NO',
  en: 'EN',
  nb: 'NO',
  nn: 'NO',
};

function mapLang(raw: string): LanguageType {
  return LANG_MAP[raw.toLowerCase()] ?? 'NO';
}

// ─── XML helpers ───────────────────────────────────────────────────────────

function attr(el: Element, name: string): string {
  return el.getAttribute(name) ?? '';
}

function children(el: Element, tagLocalName: string): Element[] {
  return Array.from(el.children).filter(
    (c) => c.localName === tagLocalName,
  );
}

function firstChild(el: Element, tagLocalName: string): Element | null {
  return Array.from(el.children).find((c) => c.localName === tagLocalName) ?? null;
}

function xsiType(el: Element): string {
  return el.getAttribute('xsi:type') ?? '';
}

// ─── Expression parsing ────────────────────────────────────────────────────

function parseSimpleStatement(el: Element): SimpleStatement | null {
  const type = attr(el, 'type');
  const elems = Array.from(el.children);

  const questionRef = elems.find((e) => {
    if (e.localName !== 'elements') return false;
    const t = xsiType(e);
    return t.includes('Function');
  });
  const valueRef = elems.find((e) => {
    if (e.localName !== 'elements') return false;
    const t = xsiType(e);
    return t.includes('OptionType') || t.includes('NumericValue') || t.includes('StringValue');
  });

  if (!questionRef && !valueRef) return null;

  const questionParam = firstChild(questionRef!, 'parameter');
  const questionType = questionParam ? firstChild(questionParam, 'elements') : null;
  const questionCode = questionType ? attr(questionType, 'question') : '';

  const operatorMap: Record<string, SimpleStatement['operator']> = {
    equal: 'EQ',
    notEqual: 'NEQ',
    less: 'LT',
    lessOrEqual: 'LTE',
    greater: 'GT',
    greaterOrEqual: 'GTE',
    hasValue: 'HAS_VALUE',
    noValue: 'NO_VALUE',
  };

  const optionCode = valueRef ? attr(valueRef, 'option') : undefined;

  return {
    questionCode,
    operator: operatorMap[type] ?? 'EQ',
    value: optionCode,
  };
}

function parseShowExpression(showEl: Element): ShowExpression {
  const statements: SimpleStatement[] = [];
  let logic: 'AND' | 'OR' = 'AND';

  const topChildren = Array.from(showEl.children);
  for (const child of topChildren) {
    const t = xsiType(child);
    if (t.includes('Operator')) {
      logic = attr(child, 'type').toLowerCase() === 'or' ? 'OR' : 'AND';
      for (const nested of Array.from(child.children)) {
        if (xsiType(nested).includes('SimpleStatement')) {
          const stmt = parseSimpleStatement(nested);
          if (stmt) statements.push(stmt);
        }
      }
    } else if (t.includes('SimpleStatement')) {
      const stmt = parseSimpleStatement(child);
      if (stmt) statements.push(stmt);
    }
  }

  return { statements, logic };
}

// ─── Response template parsing ─────────────────────────────────────────────

function parseResponseTemplate(el: Element, lang: LanguageType): ResponseTemplate {
  const code = attr(el, 'code');
  const widgetEl = firstChild(el, 'widget');
  const rawWidgetType = widgetEl ? xsiType(widgetEl) : '';

  // Extract the short widget type name (strip namespace prefix)
  const widgetType = rawWidgetType.includes(':')
    ? rawWidgetType.split(':')[1]
    : rawWidgetType;

  // Capture all widget attributes for round-trip fidelity
  const widgetParams: Record<string, string> = {};
  if (widgetEl) {
    for (const attr of Array.from(widgetEl.attributes)) {
      if (attr.name !== 'xsi:type') widgetParams[attr.name] = attr.value;
    }
  }

  const options: TextOption[] = children(el, 'option').map((opt) => ({
    code: attr(opt, 'code'),
    score: attr(opt, 'value') ? parseFloat(attr(opt, 'value')) : undefined,
    texts: { [lang]: attr(opt, 'label') } as Record<LanguageType, string>,
  }));

  return {
    code,
    name: code,
    options,
    widgetType: widgetType || undefined,
    widgetParams: Object.keys(widgetParams).length > 0 ? widgetParams : undefined,
  };
}

// ─── Question / section type determination ────────────────────────────────

function widgetTypeFromTemplate(
  templateCode: string,
  templates: Map<string, ResponseTemplate>,
  templateWidgets: Map<string, string>,
): Question['type'] {
  const widgetType = templateWidgets.get(templateCode) ?? '';
  if (widgetType.includes('Radiobutton')) return 'radiobutton';
  if (widgetType.includes('Checkbox')) return 'checkbox';
  if (widgetType.includes('Combobox')) return 'combobox';
  if (widgetType.includes('StringInput')) return 'stringInput';
  if (widgetType.includes('NumericSlider') || widgetType.includes('Slider')) return 'slider';
  if (widgetType.includes('NumericInput') || widgetType.includes('Numeric')) return 'numericInput';
  if (widgetType.includes('DateInput') || widgetType.includes('Date')) return 'dateInput';
  if (widgetType.includes('Rank')) return 'rank';
  if (widgetType.includes('Image')) return 'image';
  if (widgetType.includes('Country')) return 'country';
  return 'radiobutton'; // default
}

// ─── Contains element parsing ──────────────────────────────────────────────

function parseContains(
  el: Element,
  lang: LanguageType,
  templates: Map<string, ResponseTemplate>,
  templateWidgets: Map<string, string>,
): Question | null {
  const type = xsiType(el);
  const code = attr(el, 'code');
  const id = code || crypto.randomUUID();

  // Optional flags on every question/text element
  const voluntary = attr(el, 'voluntary') === 'true' ? true : undefined;
  const readonly = attr(el, 'readOnly') === 'true' ? true : undefined;
  const reversedScore = attr(el, 'reversedScore') === 'true' ? true : undefined;

  // Help text
  const helpTextStr = attr(el, 'helpText');
  const helpTexts = helpTextStr ? { [lang]: helpTextStr } as Record<LanguageType, string> : undefined;

  // Label position and alignment
  const rawLabelPos = attr(el, 'labelPosition').toUpperCase();
  const labelPositionValues: import('../types/questionnaire').LabelPosition[] = ['ABOVE', 'LEFT', 'RIGHT', 'BELOW'];
  const labelPosition = labelPositionValues.includes(rawLabelPos as import('../types/questionnaire').LabelPosition)
    ? rawLabelPos as import('../types/questionnaire').LabelPosition
    : undefined;
  const rawAlign = attr(el, 'align').toUpperCase();
  const alignValues: import('../types/questionnaire').ElementAlignment[] = ['LEFT', 'CENTER', 'RIGHT'];
  const align = alignValues.includes(rawAlign as import('../types/questionnaire').ElementAlignment)
    ? rawAlign as import('../types/questionnaire').ElementAlignment
    : undefined;

  // Show / hide / continueIf expressions on questions
  const qShowEl = firstChild(el, 'show');
  const qHideEl = firstChild(el, 'hide');
  const qContinueEl = firstChild(el, 'continueIf');
  const showExprs = qShowEl ? [parseShowExpression(qShowEl) as ShowExpression] : undefined;
  const hideExprs = qHideEl ? [parseShowExpression(qHideEl) as HideExpression] : undefined;
  const continueExprs = qContinueEl ? [{ ...parseShowExpression(qContinueEl) } as ContinueIfExpression] : undefined;

  const baseAttrs = {
    id,
    code,
    required: attr(el, 'mandatory') === 'true',
    texts: { [lang]: attr(el, 'question') } as Record<LanguageType, string>,
    ...(helpTexts && { helpTexts }),
    ...(labelPosition && { labelPosition }),
    ...(align && { align }),
    ...(voluntary !== undefined && { voluntary }),
    ...(readonly !== undefined && { readonly }),
    ...(reversedScore !== undefined && { reversedScore }),
    ...(showExprs && { showExpressions: showExprs }),
    ...(hideExprs && { hideExpressions: hideExprs }),
    ...(continueExprs && { continueIfExpressions: continueExprs }),
  };

  // Stand-alone widget elements (not wrapped in questionnaire:Question)
  if (type.includes('Image') || type.includes('ImageWidget')) {
    const imageSrc = attr(el, 'imageSrc') || attr(el, 'src') || undefined;
    const altRaw = attr(el, 'altText') || undefined;
    const altText = altRaw ? { [lang]: altRaw } as Record<string, string> : undefined;
    return {
      ...baseAttrs,
      type: 'image' as const,
      ...(imageSrc && { imageSrc }),
      ...(altText && { altText }),
    };
  }

  if (type.includes('Country') || type.includes('CountryWidget')) {
    return { ...baseAttrs, type: 'country' as const };
  }

  if (type.includes('Text')) {
    const contentStyle = attr(el, 'contentStyle') || undefined;
    return {
      ...baseAttrs,
      type: 'text' as const,
      isQuestion: false,
      texts: { [lang]: attr(el, 'content') } as Record<LanguageType, string>,
      ...(contentStyle && { contentStyle }),
    };
  }

  if (type.includes('Question')) {
    const templateCode = attr(el, 'template');
    const qType = widgetTypeFromTemplate(templateCode, templates, templateWidgets);
    const template = templates.get(templateCode);
    const wp = template?.widgetParams ?? {};

    const base = { ...baseAttrs };

    switch (qType) {
      case 'radiobutton': {
        const rbNumberOfColumns = wp.numberOfColumns !== undefined ? parseInt(wp.numberOfColumns, 10) : undefined;
        const rbIgnoreAnswerOptionCode = wp.ignoreAnswerOptionCode || undefined;
        return {
          ...base, type: 'radiobutton', options: template?.options ?? [], responseTemplateCode: templateCode || undefined,
          ...(rbNumberOfColumns !== undefined && !isNaN(rbNumberOfColumns) && { numberOfColumns: rbNumberOfColumns }),
          ...(rbIgnoreAnswerOptionCode && { ignoreAnswerOptionCode: rbIgnoreAnswerOptionCode }),
        };
      }
      case 'checkbox': {
        const cbNumberOfColumns = wp.numberOfColumns !== undefined ? parseInt(wp.numberOfColumns, 10) : undefined;
        const cbLimit = wp.limit !== undefined ? parseInt(wp.limit, 10) : undefined;
        const cbIgnoreAnswerOptionCode = wp.ignoreAnswerOptionCode || undefined;
        return {
          ...base, type: 'checkbox', options: template?.options ?? [], multiple: true, responseTemplateCode: templateCode || undefined,
          ...(cbNumberOfColumns !== undefined && !isNaN(cbNumberOfColumns) && { numberOfColumns: cbNumberOfColumns }),
          ...(cbLimit !== undefined && !isNaN(cbLimit) && { limit: cbLimit }),
          ...(cbIgnoreAnswerOptionCode && { ignoreAnswerOptionCode: cbIgnoreAnswerOptionCode }),
        };
      }
      case 'combobox':
        return { ...base, type: 'combobox', options: template?.options ?? [], responseTemplateCode: templateCode || undefined };
      case 'stringInput': {
        const validSizes = ['SMALL', 'MEDIUM', 'LARGE', 'XLARGE'] as const;
        const rawSize = (wp.size ?? 'MEDIUM').toUpperCase();
        const size = validSizes.includes(rawSize as typeof validSizes[number]) ? rawSize as typeof validSizes[number] : 'MEDIUM';
        return {
          ...base,
          type: 'stringInput',
          size,
          multiline: wp.multiline === 'true' ? true : undefined,
        };
      }
      case 'numericInput':
        return {
          ...base,
          type: 'numericInput',
          min: wp.min !== undefined ? parseFloat(wp.min) : undefined,
          max: wp.max !== undefined ? parseFloat(wp.max) : undefined,
          decimals: wp.decimals !== undefined ? parseInt(wp.decimals, 10) : undefined,
          unit: wp.unit || undefined,
        };
      case 'dateInput':
        return {
          ...base,
          type: 'dateInput',
          includeTime: wp.includeTime === 'true' ? true : undefined,
        };
      case 'slider': {
        const min = wp.min !== undefined ? parseFloat(wp.min) : 0;
        const max = wp.max !== undefined ? parseFloat(wp.max) : 10;
        const step = wp.step !== undefined ? parseFloat(wp.step) : undefined;
        const minLabel = wp.labelMin ? { [lang]: wp.labelMin } as Record<LanguageType, string> : undefined;
        const maxLabel = wp.labelMax ? { [lang]: wp.labelMax } as Record<LanguageType, string> : undefined;
        const showTicks = wp.showTicks !== undefined ? wp.showTicks === 'true' : undefined;
        const showEndLabels = wp.showEndLabels !== undefined ? wp.showEndLabels === 'true' : undefined;
        const showScaleLabels = wp.showScaleLabels !== undefined ? wp.showScaleLabels === 'true' : undefined;
        const showDigitalPoints = wp.showDigitalPoints !== undefined ? wp.showDigitalPoints === 'true' : undefined;
        const showClear = wp.showClear !== undefined ? wp.showClear === 'true' : undefined;
        const displayValue = wp.displayValue !== undefined ? wp.displayValue === 'true' : undefined;
        const direction = (wp.direction === 'horizontal' || wp.direction === 'vertical') ? wp.direction as 'horizontal' | 'vertical' : undefined;
        const sliderLength = wp.length || undefined;
        const hairline = wp.hairline !== undefined ? wp.hairline === 'true' : undefined;
        return {
          ...base, type: 'slider', min, max,
          ...(step !== undefined && { step }),
          ...(minLabel && { minLabel }),
          ...(maxLabel && { maxLabel }),
          ...(showTicks !== undefined && { showTicks }),
          ...(showEndLabels !== undefined && { showEndLabels }),
          ...(showScaleLabels !== undefined && { showScaleLabels }),
          ...(showDigitalPoints !== undefined && { showDigitalPoints }),
          ...(showClear !== undefined && { showClear }),
          ...(displayValue !== undefined && { displayValue }),
          ...(direction && { direction }),
          ...(sliderLength && { sliderLength }),
          ...(hairline !== undefined && { hairline }),
        };
      }
      case 'rank': {
        const maxRankStr = attr(el, 'maxRank');
        const maxRank = maxRankStr ? parseInt(maxRankStr, 10) : undefined;
        return { ...base, type: 'rank', options: template?.options ?? [], ...(maxRank !== undefined && { maxRank }) };
      }
      case 'image': {
        const imageSrc = wp.imageSrc || wp.src || attr(el, 'imageSrc') || attr(el, 'src') || undefined;
        const altRaw = wp.altText || attr(el, 'altText') || undefined;
        const altText = altRaw ? { [lang]: altRaw } as Record<string, string> : undefined;
        return {
          ...base,
          type: 'image',
          ...(imageSrc && { imageSrc }),
          ...(altText && { altText }),
        };
      }
      case 'country':
        return { ...base, type: 'country' };
      default:
        return { ...base, type: 'radiobutton', options: template?.options ?? [], responseTemplateCode: templateCode || undefined };
    }
  }

  return null;
}

// ─── Recursive section parser ─────────────────────────────────────────────

/**
 * Parse a section element (either a root `<section>` or a nested
 * `<contains xsi:type="questionnaire:Section">`).
 * Recursively handles nested sub-sections.
 */
function parseSection(
  secEl: Element,
  lang: LanguageType,
  templates: Map<string, ResponseTemplate>,
  templateWidgets: Map<string, string>,
): Section {
  const secCode = attr(secEl, 'code');

  // Section type: NORMAL (default), REPEATED, CONDITIONAL
  const rawSectionType = attr(secEl, 'sectionType').toUpperCase();
  const sectionType: SectionType =
    rawSectionType === 'REPEATED' ? 'REPEATED' :
    rawSectionType === 'CONDITIONAL' ? 'CONDITIONAL' : 'NORMAL';

  const repeatCode = attr(secEl, 'repeatCode') || undefined;
  const requiresNewPage = attr(secEl, 'requiresNewPage') === 'true' ? true : undefined;

  const showEl = firstChild(secEl, 'show');
  const showExpression = showEl ? parseShowExpression(showEl) : undefined;

  const hideEl = firstChild(secEl, 'hide');
  const hideExpression = hideEl ? (parseShowExpression(hideEl) as HideExpression) : undefined;

  const continueIfEl = firstChild(secEl, 'continueIf');
  const continueIfExpression: ContinueIfExpression | undefined = continueIfEl
    ? (() => {
        // reuse the same parsing logic as show expressions (same structure)
        const parsed = parseShowExpression(continueIfEl);
        return { statements: parsed.statements, logic: parsed.logic };
      })()
    : undefined;

  const questions: Question[] = [];
  const subSections: Section[] = [];

  for (const containsEl of children(secEl, 'contains')) {
    const t = xsiType(containsEl);
    if (t.includes('Section')) {
      // Nested section — recurse
      subSections.push(parseSection(containsEl, lang, templates, templateWidgets));
    } else {
      const q = parseContains(containsEl, lang, templates, templateWidgets);
      if (q) questions.push(q);
    }
  }

  return {
    id: secCode || crypto.randomUUID(),
    code: secCode || undefined,
    type: sectionType,
    titles: { [lang]: attr(secEl, 'title') || attr(secEl, 'description') || '' } as Record<LanguageType, string>,
    questions,
    subSections: subSections.length > 0 ? subSections : undefined,
    showExpressions: showExpression ? [showExpression] : undefined,
    hideExpressions: hideExpression ? [hideExpression] : undefined,
    continueIfExpressions: continueIfExpression ? [continueIfExpression] : undefined,
    repeatCode,
    requiresNewPage,
  };
}

// ─── Main parser ───────────────────────────────────────────────────────────

export function parseQuestionnaire(xmlText: string): Questionnaire {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  const root = doc.documentElement;

  const lang = mapLang(attr(root, 'language') || 'norwegian');
  const code = attr(root, 'code');
  const name = attr(root, 'name');
  const version = attr(root, 'version');
  const release = attr(root, 'release') || undefined;
  const descAttr = attr(root, 'description') || undefined;
  const clinicianOnly = attr(root, 'clinicianOnly') === 'true' ? true : undefined;

  // Derive questionnaire type from root element local name (Scale, Exercise, or default Questionnaire)
  const rootLocalName = root.localName ?? root.tagName.split(':').pop() ?? '';
  const questionnaireType: QuestionnaireType =
    rootLocalName === 'Scale' ? 'SCALE' :
    rootLocalName === 'Exercise' ? 'EXERCISE' : 'QUESTIONNAIRE';
  const rawVP = attr(root, 'visualizeProgress');
  const visualizeProgress: Questionnaire['visualizeProgress'] =
    rawVP === 'Percentage' ? 'Percentage' :
    rawVP === 'Steps' ? 'Steps' :
    rawVP === 'None' ? 'None' : undefined;

  // Studio boolean flags — parse only if attribute is explicitly present to avoid
  // overriding the serializer defaults with undefined.
  function parseBool(attrName: string, defaultVal: boolean): boolean {
    const v = attr(root, attrName);
    return v === '' ? defaultVal : v === 'true';
  }
  const exportAllowed        = parseBool('exportAllowed', true);
  const authorizedDevicesOnly = parseBool('authorizedDevicesOnly', false);
  const allowTOC             = parseBool('allowTOC', false);
  const restrictBackButton   = parseBool('restrictBackButton', false);
  const allowSingleBackButton = parseBool('allowSingleBackButton', false);
  const unresponsiveUI       = parseBool('unresponsiveUI', false);

  // ── Parse response templates first (needed for question type lookup) ────
  const templateWidgets = new Map<string, string>();
  const templatesMap = new Map<string, ResponseTemplate>();

  const rtContainer = firstChild(root, 'responseTemplates');
  if (rtContainer) {
    for (const rtEl of children(rtContainer, 'responseTemplate')) {
      const tmpl = parseResponseTemplate(rtEl, lang);
      templatesMap.set(tmpl.code, tmpl);

      const widgetEl = firstChild(rtEl, 'widget');
      if (widgetEl) templateWidgets.set(tmpl.code, xsiType(widgetEl));
    }
  }

  // ── Parse sections (recursive) ──────────────────────────────────────────
  const sections: Section[] = children(root, 'section').map((secEl) =>
    parseSection(secEl, lang, templatesMap, templateWidgets)
  );

  // ── Build response templates collection ─────────────────────────────────
  const responseTemplates: ResponseTemplates = {
    templates: Array.from(templatesMap.values()),
  };

  // ── Build flat section list for index-based lookups (calculations etc.) ─
  // Includes nested sub-sections so @section.N refs can find leaf sections.
  const flatSections = flattenSections(sections);

  // ── Parse dimensions ─────────────────────────────────────────────────────
  // Supports two formats:
  //   1. MINI7: <dimension code="AGOR" question="E1a E1b E1c"/>  (space-separated codes)
  //   2. XMI:   <dimension code="..."><question href="#//@section.0/@contains.2"/></dimension>
  const dimensions: Dimension[] = [];
  const dimsContainer = firstChild(root, 'dimensions');
  if (dimsContainer) {
    for (const dimEl of children(dimsContainer, 'dimension')) {
      const dimCode = attr(dimEl, 'code');
      const dimName = attr(dimEl, 'name') || dimCode;
      if (!dimCode) continue;

      const questionCodes: string[] = [];

      // Format 1: space-separated question codes in `question` attribute
      const qAttr = attr(dimEl, 'question');
      if (qAttr) {
        qAttr.trim().split(/\s+/).filter(Boolean).forEach((c) => {
          if (!questionCodes.includes(c)) questionCodes.push(c);
        });
      }

      // Format 2: child <question href="..."> elements (XMI index refs)
      for (const qRefEl of children(dimEl, 'question')) {
        const ref = attr(qRefEl, 'href') || '';
        const fragment = ref.startsWith('#') ? ref.slice(1) : ref;
        const sectionM = fragment.match(/@section\.(\d+)/);
        const containsM = fragment.match(/@contains\.(\d+)/);
        if (sectionM) {
          const sec = flatSections[parseInt(sectionM[1])];
          if (sec && containsM) {
            const qCode = sec.questions[parseInt(containsM[1])]?.code;
            if (qCode && !questionCodes.includes(qCode)) questionCodes.push(qCode);
          }
        }
      }

      dimensions.push({ code: dimCode, name: dimName, questionCodes });
    }
  }

  return {
    code,
    version,
    release,
    type: questionnaireType,
    defaultLanguage: lang,
    supportedLanguages: [lang],
    name: { [lang]: name } as Record<LanguageType, string>,
    ...(descAttr ? { description: { [lang]: descAttr } as Record<LanguageType, string> } : {}),
    sections,
    responseTemplates,
    dimensions: dimensions.length > 0 ? dimensions : undefined,
    clinicianOnly,
    visualizeProgress,
    exportAllowed,
    authorizedDevicesOnly,
    allowTOC,
    restrictBackButton,
    allowSingleBackButton,
    unresponsiveUI,
  };
}

/** Flatten a nested section tree into a single ordered array (BFS order). */
function flattenSections(sections: Section[]): Section[] {
  const result: Section[] = [];
  const queue = [...sections];
  while (queue.length > 0) {
    const sec = queue.shift()!;
    result.push(sec);
    if (sec.subSections) queue.push(...sec.subSections);
  }
  return result;
}

// ─── Calculation file parser ───────────────────────────────────────────────
//
// Each .calculation file is an EMF/XMI document containing a single
// questionnaire:Calculation element.  The calculationExpression is an
// expression tree built from Function, Operator, and reference nodes.
// We walk the tree and map the most common patterns to our flat
// Calculation type (SUM / MEAN / CUSTOM + list of question codes).

export function parseCalculationFile(
  xmlText: string,
  questionnaire: Questionnaire,
): Calculation | null {
  try {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    const root = doc.documentElement;

    const code = attr(root, 'code');
    const name = attr(root, 'name') || code;
    if (!code) return null;

    // normCode is stored as a relative path reference, e.g. "../norms/TOTAL.norm"
    const rawNorm = attr(root, 'norm');
    const normCode = rawNorm
      ? rawNorm.split('/').pop()?.replace(/\.norm$/, '') || undefined
      : undefined;

    const exprEl = firstChild(root, 'calculationExpression');
    if (!exprEl) {
      return { code, name, type: 'CUSTOM', innerCalculations: [], normCode };
    }

    // Preserve the raw XML of the expression for lossless round-trip
    const rawXml = new XMLSerializer().serializeToString(exprEl);
    // Strip redundant xmlns declarations added by XMLSerializer (parent doc already declares them)
    const _rawExpression = rawXml.replace(/ xmlns(?::\w+)?="[^"]*"/g, '');

    const { calcType, innerCalculations } = resolveExpression(exprEl, questionnaire);
    const formula = expressionToFormula(exprEl, questionnaire, 0);
    return { code, name, type: calcType, innerCalculations, formula, normCode, _rawExpression };
  } catch {
    return null;
  }
}

interface ExprResult {
  calcType: CalculationType;
  innerCalculations: InnerCalculation[];
}

function resolveExpression(el: Element, questionnaire: Questionnaire): ExprResult {
  const type = xsiType(el);
  const fnName = attr(el, 'name');

  if (type.includes('Function')) {
    switch (fnName) {
      case 'sumSection':
        return { calcType: 'SUM', innerCalculations: questionsFromSectionParam(el, questionnaire) };
      case 'sumDimension':
        return { calcType: 'SUM', innerCalculations: questionsFromDimensionParam(el, questionnaire) };
      case 'averageSection':
      case 'meanSection':
        return { calcType: 'MEAN', innerCalculations: questionsFromSectionParam(el, questionnaire) };
      case 'meanDimension':
      case 'averageDimension':
        return { calcType: 'MEAN', innerCalculations: questionsFromDimensionParam(el, questionnaire) };
      case 'questionResponseValue':
        return { calcType: 'CUSTOM', innerCalculations: [questionFromFunctionParam(el, questionnaire)] };
      case 'if': {
        // Conditional: extract all question refs from condition and branches
        const refs = extractQuestionRefs(el, questionnaire);
        return { calcType: 'CUSTOM', innerCalculations: refs };
      }
      default: {
        const refs = extractQuestionRefs(el, questionnaire);
        return { calcType: 'CUSTOM', innerCalculations: refs };
      }
    }
  }

  if (type.includes('SimpleStatement')) {
    // Recurse into child elements
    const allInner: InnerCalculation[] = [];
    for (const child of Array.from(el.children).filter((c) => c.localName === 'elements')) {
      allInner.push(...resolveExpression(child, questionnaire).innerCalculations);
    }
    return { calcType: 'CUSTOM', innerCalculations: allInner };
  }

  if (type.includes('Operator')) {
    const opType = attr(el, 'type'); // 'plus', 'minus', 'multiply', 'divide', 'and', 'or', etc.
    const childEls = Array.from(el.children).filter((c) => c.localName === 'elements');
    const allInner: InnerCalculation[] = [];
    for (const child of childEls) {
      const { innerCalculations } = resolveExpression(child, questionnaire);
      allInner.push(...innerCalculations);
    }
    const isSimpleSum = (opType === 'plus' || opType === 'add') && allInner.every((ic) => !ic.multiplier || ic.multiplier === 1);
    return { calcType: isSimpleSum ? 'SUM' : 'CUSTOM', innerCalculations: allInner };
  }

  return { calcType: 'CUSTOM', innerCalculations: [] };
}

// ─── Formula string generator ─────────────────────────────────────────────

const OP_SYMBOL: Record<string, string> = {
  plus: '+', add: '+', minus: '−', subtract: '−',
  multiply: '×', divide: '÷',
  equal: '=', notEqual: '≠', less: '<', lessOrEqual: '≤',
  greater: '>', greaterOrEqual: '≥',
  and: 'AND', or: 'OR', not: 'NOT',
  max: 'MAX', min: 'MIN',
};

function expressionToFormula(el: Element, questionnaire: Questionnaire, depth: number): string {
  const type = xsiType(el);
  const indent = '  '.repeat(depth);

  // Function node
  if (type.includes('Function')) {
    const fnName = attr(el, 'name');
    const params = Array.from(el.children).filter((c) => c.localName === 'parameter');

    if (fnName === 'if') {
      const ifParam = params.find((p) => attr(p, 'name') === 'if');
      const thenParam = params.find((p) => attr(p, 'name') === 'then');
      const elseParam = params.find((p) => attr(p, 'name') === 'else');
      const cond = ifParam ? paramFormula(ifParam, questionnaire, depth + 1) : '?';
      const thenVal = thenParam ? paramFormula(thenParam, questionnaire, depth + 1) : '?';
      const elseVal = elseParam ? paramFormula(elseParam, questionnaire, depth + 1) : '?';
      return `if (${cond})\n${indent}  → ${thenVal}\n${indent}else ${elseVal}`;
    }

    if (fnName === 'sumSection' || fnName === 'meanSection' || fnName === 'averageSection' ||
        fnName === 'sumDimension' || fnName === 'meanDimension' || fnName === 'averageDimension' ||
        fnName === 'maxSection' || fnName === 'maxDimension' || fnName === 'minSection' || fnName === 'minDimension' ||
        fnName === 'numberOfResponsesInSection' || fnName === 'numberOfResponsesInDimension' ||
        fnName === 'stdDevSampleDimension' || fnName === 'stdDevPopulationDimension') {
      const target = fnTargetName(el, questionnaire);
      return `${fnName}(${target})`;
    }

    if (fnName === 'questionResponseValue' || fnName === 'questionResponseLabel' || fnName === 'questionResponseOptionSelected') {
      const qParam = params.find((p) => attr(p, 'name') === 'question');
      const qCode = qParam ? questionCodeFromParam(qParam, questionnaire) : '?';
      return `${fnName}(${qCode})`;
    }

    // Generic function
    const argStrs = params.map((p) => paramFormula(p, questionnaire, depth + 1));
    return `${fnName}(${argStrs.join(', ')})`;
  }

  // Operator node
  if (type.includes('Operator')) {
    const opType = attr(el, 'type');
    const sym = OP_SYMBOL[opType] ?? opType;
    const parts = Array.from(el.children)
      .filter((c) => c.localName === 'elements')
      .map((c) => expressionToFormula(c, questionnaire, depth));
    return parts.join(` ${sym} `);
  }

  // SimpleStatement (same as Operator but explicit)
  if (type.includes('SimpleStatement')) {
    const opType = attr(el, 'type');
    const sym = OP_SYMBOL[opType] ?? opType;
    const parts = Array.from(el.children)
      .filter((c) => c.localName === 'elements')
      .map((c) => expressionToFormula(c, questionnaire, depth));
    return parts.join(` ${sym} `);
  }

  // CalculationType — reference to another calculation
  if (type.includes('CalculationType')) {
    const calcName = attr(el, 'name') || attr(el, 'href') || '';
    return calcName || '[beregning]';
  }

  // DimensionType — reference to a dimension
  if (type.includes('DimensionType')) {
    const child = firstChild(el, 'dimension');
    if (child) {
      const ref = attr(child, 'href') || '';
      const fragment = ref.includes('#') ? ref.split('#')[1] : ref;
      const m = fragment.match(/@dimension\.(\d+)/);
      const dim = m
        ? questionnaire.dimensions?.[parseInt(m[1])]
        : questionnaire.dimensions?.find((d) => d.code === fragment);
      return dim?.code ?? fragment;
    }
    return '[dimensjon]';
  }

  // QuestionType — reference to a question
  if (type.includes('QuestionType')) {
    const child = firstChild(el, 'question');
    if (child) {
      const ref = attr(child, 'href') || '';
      const code = resolveQuestionCode(ref, questionnaire) || resolveQuestionCodeFromHash(ref);
      return code || ref;
    }
    return '[spørsmål]';
  }

  // NumberBasicType
  if (type.includes('NumberBasicType') || type.includes('Number')) {
    return attr(el, 'value') || '?';
  }

  // OptionType
  if (type.includes('OptionType')) {
    const optEl = firstChild(el, 'option');
    if (optEl) {
      const ref = attr(optEl, 'href') || '';
      const fragment = ref.includes('#') ? ref.split('#')[1] : ref;
      return fragment || '[alternativ]';
    }
    return '[alternativ]';
  }

  return `[${type}]`;
}

function paramFormula(paramEl: Element, questionnaire: Questionnaire, depth: number): string {
  const children = Array.from(paramEl.children).filter((c) => c.localName === 'elements');
  if (children.length === 0) return '?';
  if (children.length === 1) return expressionToFormula(children[0], questionnaire, depth);
  return children.map((c) => expressionToFormula(c, questionnaire, depth)).join(', ');
}

function fnTargetName(fnEl: Element, questionnaire: Questionnaire): string {
  for (const paramEl of Array.from(fnEl.children).filter((c) => c.localName === 'parameter')) {
    const elemEl = firstChild(paramEl, 'elements');
    if (!elemEl) continue;
    const t = xsiType(elemEl);
    if (t.includes('DimensionType')) {
      const dimEl = firstChild(elemEl, 'dimension');
      if (dimEl) {
        const ref = attr(dimEl, 'href') || '';
        const fragment = ref.includes('#') ? ref.split('#')[1] : ref;
        const m = fragment.match(/@dimension\.(\d+)/);
        const dim = m
          ? questionnaire.dimensions?.[parseInt(m[1])]
          : questionnaire.dimensions?.find((d) => d.code === fragment);
        return dim?.code ?? fragment;
      }
    }
    const sectionRef = attr(elemEl, 'section') || attr(elemEl, 'href') || '';
    if (sectionRef) {
      const section = resolveSection(sectionRef, questionnaire);
      return section?.code ?? sectionRef;
    }
  }
  return '?';
}

function questionCodeFromParam(paramEl: Element, questionnaire: Questionnaire): string {
  const elemEl = firstChild(paramEl, 'elements');
  if (!elemEl) return '?';
  const t = xsiType(elemEl);
  if (t.includes('QuestionType')) {
    const qEl = firstChild(elemEl, 'question');
    if (qEl) {
      const ref = attr(qEl, 'href') || '';
      return resolveQuestionCode(ref, questionnaire) || resolveQuestionCodeFromHash(ref) || ref;
    }
  }
  return attr(elemEl, 'href') || '?';
}

/** sumSection / meanSection: find the section param and expand to all question codes */
function questionsFromSectionParam(fnEl: Element, questionnaire: Questionnaire): InnerCalculation[] {
  for (const paramEl of children(fnEl, 'parameter')) {
    if (attr(paramEl, 'name') !== 'section') continue;
    const elemEl = firstChild(paramEl, 'elements');
    if (!elemEl) continue;
    const sectionRef = attr(elemEl, 'section') || attr(elemEl, 'href') || '';
    const section = resolveSection(sectionRef, questionnaire);
    if (!section) continue;
    return section.questions
      .filter((q) => q.type !== 'text' && q.code)
      .map((q) => ({ questionCode: q.code, multiplier: 1 }));
  }
  return [];
}

/** sumDimension / meanDimension: look up the dimension and return its question codes */
function questionsFromDimensionParam(fnEl: Element, questionnaire: Questionnaire): InnerCalculation[] {
  for (const paramEl of children(fnEl, 'parameter')) {
    if (attr(paramEl, 'name') !== 'dimension') continue;
    const elemEl = firstChild(paramEl, 'elements');
    if (!elemEl) continue;
    // href is on the child <dimension> element (DimensionType pattern), not on <elements> itself
    const dimChild = firstChild(elemEl, 'dimension');
    const rawRef = (dimChild ? attr(dimChild, 'href') : null)
      || attr(elemEl, 'dimension')
      || attr(elemEl, 'href')
      || '';
    const fragment = rawRef.includes('#') ? rawRef.split('#')[1] : rawRef;
    const m = fragment.match(/@dimension\.(\d+)/);
    const dim = m
      ? questionnaire.dimensions?.[parseInt(m[1])]
      : questionnaire.dimensions?.find((d) => d.code === fragment);
    if (dim) {
      return dim.questionCodes.map((code) => ({ questionCode: code, multiplier: 1 }));
    }
  }
  return [];
}

/** questionResponseValue: extract the single question code */
function questionFromFunctionParam(fnEl: Element, questionnaire: Questionnaire): InnerCalculation {
  for (const paramEl of children(fnEl, 'parameter')) {
    if (attr(paramEl, 'name') !== 'question') continue;
    const elemEl = firstChild(paramEl, 'elements');
    if (!elemEl) continue;
    const qRef = attr(elemEl, 'question') || attr(elemEl, 'href') || '';
    const code = resolveQuestionCode(qRef, questionnaire);
    if (code) return { questionCode: code, multiplier: 1 };
    // Also check for <question href="..."> child (QuestionType pattern)
    const qChild = firstChild(elemEl, 'question');
    if (qChild) {
      const childRef = attr(qChild, 'href') || '';
      const childCode = resolveQuestionCode(childRef, questionnaire) || resolveQuestionCodeFromHash(childRef);
      if (childCode) return { questionCode: childCode, multiplier: 1 };
    }
  }
  return { questionCode: '', multiplier: 1 };
}

/**
 * Recursively walk any expression subtree and collect all distinct question refs.
 * Used for `if` functions and other complex expressions.
 */
function extractQuestionRefs(el: Element, questionnaire: Questionnaire): InnerCalculation[] {
  const seen = new Set<string>();
  const results: InnerCalculation[] = [];

  function walk(node: Element) {
    // <question href="..."> pattern (QuestionType child)
    if (node.localName === 'question') {
      const ref = attr(node, 'href') || '';
      const code = ref
        ? (resolveQuestionCode(ref, questionnaire) || resolveQuestionCodeFromHash(ref))
        : '';
      if (code && !seen.has(code)) {
        seen.add(code);
        results.push({ questionCode: code, multiplier: 1 });
      }
    }
    // questionResponseValue function
    const t = xsiType(node);
    if (t.includes('Function') && attr(node, 'name') === 'questionResponseValue') {
      const inner = questionFromFunctionParam(node, questionnaire);
      if (inner.questionCode && !seen.has(inner.questionCode)) {
        seen.add(inner.questionCode);
        results.push(inner);
      }
    }
    for (const child of Array.from(node.children)) {
      walk(child);
    }
  }

  walk(el);
  return results;
}

/**
 * Extract question code from a fragment href like "../quiz/MINI7.questionnaire#E6"
 * where the fragment is just the question code directly (not an XMI path).
 */
function resolveQuestionCodeFromHash(ref: string): string {
  if (!ref.includes('#')) return '';
  const fragment = ref.split('#')[1];
  // If it's a plain code (no @-paths), return it directly
  if (fragment && !fragment.includes('@')) return fragment;
  return '';
}

/**
 * Resolve a cross-document section reference.
 * Ref examples:
 *   "AGOR-AA.questionnaire#//@section.0"
 *   "//@section.0"
 * Uses a flat (BFS) traversal of the possibly-nested section tree.
 */
function resolveSection(ref: string, questionnaire: Questionnaire): Section | null {
  const fragment = ref.includes('#') ? ref.split('#')[1] : ref;
  const m = fragment.match(/@section\.(\d+)/);
  if (!m) return null;
  const flat = flattenSections(questionnaire.sections);
  return flat[parseInt(m[1])] ?? null;
}

/**
 * Resolve a cross-document question reference.
 * Ref examples:
 *   "AGOR-AA.questionnaire#//@section.0/@contains.2"
 *   "//@section.0/@contains.2"
 */
function resolveQuestionCode(ref: string, questionnaire: Questionnaire): string {
  const fragment = ref.includes('#') ? ref.split('#')[1] : ref;
  const sectionM = fragment.match(/@section\.(\d+)/);
  const containsM = fragment.match(/@contains\.(\d+)/);
  if (!sectionM) return '';
  const flat = flattenSections(questionnaire.sections);
  const section = flat[parseInt(sectionM[1])];
  if (!section) return '';
  if (containsM) {
    return section.questions[parseInt(containsM[1])]?.code ?? '';
  }
  return '';
}

// ─── Flag file parser ──────────────────────────────────────────────────────
//
// Flag ecore model: code, name, questionnaire (ref), flagExpression (ExpressionElement)
// Note: there is NO severity/type attribute in the original model — the flag
// name typically encodes severity (e.g. "CRITICAL-..." prefix) or it is INFO by default.

export function parseFlagFile(xmlText: string, questionnaire: Questionnaire): Flag | null {
  try {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    const root = doc.documentElement;

    const code = attr(root, 'code');
    const name = attr(root, 'name') || code;
    if (!code) return null;

    // Deduce severity from name/code prefix if present (not in model, best-effort)
    const upper = (name || code).toUpperCase();
    const flagType: Flag['type'] =
      upper.includes('CRITICAL') ? 'CRITICAL' :
      upper.includes('WARNING') || upper.includes('WARN') ? 'WARNING' : 'INFO';

    const flagExprEl = firstChild(root, 'flagExpression');
    const { conditions, logic } = flagExprEl
      ? extractFlagConditions(flagExprEl, questionnaire)
      : { conditions: [] as FlagCondition[], logic: 'AND' as const };

    return { code, name, type: flagType, conditions, logic };
  } catch {
    return null;
  }
}

function extractFlagConditions(
  el: Element,
  questionnaire: Questionnaire,
): { conditions: FlagCondition[]; logic: 'AND' | 'OR' } {
  const type = xsiType(el);

  // Operator node — wraps multiple SimpleStatements
  if (type.includes('Operator')) {
    const opType = attr(el, 'type').toLowerCase(); // 'and', 'or'
    const logic: 'AND' | 'OR' = opType === 'or' ? 'OR' : 'AND';
    const conditions: FlagCondition[] = [];
    for (const child of Array.from(el.children).filter((c) => c.localName === 'elements')) {
      const { conditions: inner } = extractFlagConditions(child, questionnaire);
      conditions.push(...inner);
    }
    return { conditions, logic };
  }

  // SimpleStatement — a single comparison
  if (type.includes('SimpleStatement')) {
    const operatorMap: Record<string, FlagCondition['operator']> = {
      equal: 'EQ', notEqual: 'NEQ', less: 'LT', lessOrEqual: 'LTE',
      greater: 'GT', greaterOrEqual: 'GTE',
    };
    const opType = attr(el, 'type');

    let calcCode = '';
    let threshold = 0;

    for (const e of Array.from(el.children)) {
      if (e.localName !== 'elements') continue;
      const t = xsiType(e);
      if (t.includes('CalculationType') || t.includes('InnerCalculation')) {
        const ref = attr(e, 'calculation') || attr(e, 'href') || '';
        calcCode = resolveCalcCode(ref, questionnaire);
      } else if (t.includes('NumericValue') || t.includes('Numeric')) {
        threshold = parseFloat(attr(e, 'value') || '0');
      }
    }

    if (calcCode) {
      return {
        conditions: [{ calculationCode: calcCode, operator: operatorMap[opType] ?? 'GTE', threshold }],
        logic: 'AND',
      };
    }
  }

  return { conditions: [], logic: 'AND' };
}

function resolveCalcCode(ref: string, _questionnaire: Questionnaire): string {
  if (!ref.includes('/') && !ref.includes('#')) return ref;
  const fileName = ref.split('#')[0].split('/').pop() ?? '';
  const dotIdx = fileName.lastIndexOf('.');
  return dotIdx >= 0 ? fileName.slice(0, dotIdx) : fileName;
}

// ─── Norm file parser ──────────────────────────────────────────────────────
//
// Norm ecore model: code, title, description, origin, normContent (Mean | LookupTable)
// LookupTable.lookup[]: value, lookupMin, lookupMax, name

export function parseNormFile(xmlText: string): import('../types/questionnaire').Norm | null {
  try {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    const root = doc.documentElement;

    const code = attr(root, 'code');
    const name = attr(root, 'title') || attr(root, 'name') || code;
    const description = attr(root, 'description') || undefined;
    const origin = attr(root, 'origin') || undefined;
    if (!code) return null;

    const contentEl = firstChild(root, 'normContent');
    const data: Array<{ score: number; normValue: number }> = [];
    let normType: import('../types/questionnaire').NormType = 'NORM';

    if (contentEl) {
      const contentType = xsiType(contentEl);

      if (contentType.includes('LookupTable')) {
        // Each <lookup> child: lookupMin → score, value → normValue
        for (const lookupEl of children(contentEl, 'lookup')) {
          const min = parseFloat(attr(lookupEl, 'lookupMin') || '0');
          const val = parseFloat(attr(lookupEl, 'value') || '0');
          const ageStr = attr(lookupEl, 'age');
          const genderStr = attr(lookupEl, 'gender');
          data.push({
            score: min,
            normValue: val,
            ...(ageStr ? { age: parseFloat(ageStr) } : {}),
            ...(genderStr ? { gender: genderStr } : {}),
          });
        }
        // Detect PERCENTILE vs NORM from code/title
        const codeUpper = (code + ' ' + name).toUpperCase();
        normType = codeUpper.includes('PERCENTIL') ? 'PERCENTILE' : 'NORM';
      } else if (contentType.includes('Mean')) {
        // ZSCORE norms store mean + stdDev; we encode them as score=mean, normValue=stdDev
        const mean = parseFloat(attr(contentEl, 'value') || '0');
        const sd = parseFloat(attr(contentEl, 'stdDev') || '0');
        data.push({ score: mean, normValue: sd });
        normType = 'ZSCORE';
      }
    }

    return { code, name, type: normType, description, origin, data };
  } catch {
    return null;
  }
}

// ─── Translation file parser ───────────────────────────────────────────────
//
// Translations ecore model: language, questionnaireName, translation[]
// Each Translation: code, entity (Question|TextOption|Questionnaire|...), property, translatedText
//
// We apply translations directly to the questionnaire's multilingual text fields
// so that the TranslationEditor and SimulatorEditor can show the correct language.

export function applyTranslationFile(
  questionnaire: Questionnaire,
  xmlText: string,
): Questionnaire {
  try {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    const root = doc.documentElement;

    const langRaw = attr(root, 'language'); // e.g. "norwegian", "english", "swedish"
    const lang = mapLang(langRaw);

    // Collect all translations first, then apply in a single pass
    let nameTranslation: string | null = null;
    let descTranslation: string | null = null;
    for (const t of children(root, 'translation')) {
      if (attr(t, 'entity') === 'Questionnaire') {
        const prop = attr(t, 'property');
        const txt = attr(t, 'translatedText') || null;
        if (prop === 'name') nameTranslation = txt;
        else if (prop === 'description') descTranslation = txt;
      }
    }

    // Build flat maps of all translations: code → translatedText
    const translByCode = new Map<string, string>();        // question/text codes
    const optionByCode = new Map<string, string>();        // option codes
    const sectionByCode = new Map<string, string>();       // section codes
    const helpTextByCode = new Map<string, string>();      // question helpText codes
    const sliderMinByCode = new Map<string, string>();     // slider labelMin codes
    const sliderMaxByCode = new Map<string, string>();     // slider labelMax codes
    for (const translEl of children(root, 'translation')) {
      const code = attr(translEl, 'code');
      const entity = attr(translEl, 'entity');
      const property = attr(translEl, 'property');
      const translated = attr(translEl, 'translatedText');
      if (!translated || !code) continue;
      if ((entity === 'Question' && property === 'question') || (entity === 'Text' && property === 'content')) {
        translByCode.set(code, translated);
      } else if (entity === 'Question' && property === 'helpText') {
        helpTextByCode.set(code, translated);
      } else if (entity === 'Question' && property === 'labelMin') {
        sliderMinByCode.set(code, translated);
      } else if (entity === 'Question' && property === 'labelMax') {
        sliderMaxByCode.set(code, translated);
      } else if (entity === 'TextOption' && property === 'label') {
        optionByCode.set(code, translated);
      } else if (entity === 'Section' && (property === 'description' || property === 'title')) {
        sectionByCode.set(code, translated);
      }
    }

    // Apply translations lazily — only clone objects that actually have a translation
    function applyToSection(s: import('../types/questionnaire').Section): import('../types/questionnaire').Section {
      const titleTrans = s.code ? sectionByCode.get(s.code) : undefined;

      const newQuestions = s.questions.map((q) => {
        const qTrans = translByCode.get(q.code);
        const helpTrans = helpTextByCode.get(q.code);
        const sliderMin = q.type === 'slider' ? sliderMinByCode.get(q.code) : undefined;
        const sliderMax = q.type === 'slider' ? sliderMaxByCode.get(q.code) : undefined;
        const hasOptionTrans = (q.type === 'radiobutton' || q.type === 'checkbox' || q.type === 'combobox') &&
          (q.options ?? []).some((o) => optionByCode.has(o.code));
        if (!qTrans && !helpTrans && !sliderMin && !sliderMax && !hasOptionTrans) return q;
        let updated: import('../types/questionnaire').Question = { ...q };
        if (qTrans) updated = { ...updated, texts: { ...q.texts, [lang]: qTrans } };
        if (helpTrans) updated = { ...updated, helpTexts: { ...(q.helpTexts ?? {}), [lang]: helpTrans } as Record<LanguageType, string> };
        if (sliderMin && updated.type === 'slider') updated = { ...updated, minLabel: { ...(updated.minLabel ?? {}), [lang]: sliderMin } as Record<LanguageType, string> };
        if (sliderMax && updated.type === 'slider') updated = { ...updated, maxLabel: { ...(updated.maxLabel ?? {}), [lang]: sliderMax } as Record<LanguageType, string> };
        if (hasOptionTrans && (updated.type === 'radiobutton' || updated.type === 'checkbox' || updated.type === 'combobox')) {
          updated = {
            ...updated,
            options: (updated.options ?? []).map((o) => {
              const oTrans = optionByCode.get(o.code);
              return oTrans ? { ...o, texts: { ...o.texts, [lang]: oTrans } } : o;
            }),
          };
        }
        return updated;
      });

      const newSubs = s.subSections?.map(applyToSection);
      const questionsChanged = newQuestions.some((q, i) => q !== s.questions[i]);
      const subsChanged = newSubs && newSubs.some((ss, i) => ss !== s.subSections![i]);
      if (!titleTrans && !questionsChanged && !subsChanged) return s;
      return {
        ...s,
        ...(titleTrans ? { titles: { ...s.titles, [lang]: titleTrans } } : {}),
        questions: newQuestions,
        subSections: newSubs,
      };
    }

    const updatedSections = questionnaire.sections.map(applyToSection);

    // Apply to response templates
    const updatedTemplates = questionnaire.responseTemplates
      ? {
          templates: questionnaire.responseTemplates.templates.map((tpl) => {
            const hasChange = tpl.options.some((o) => optionByCode.has(o.code));
            if (!hasChange) return tpl;
            return {
              ...tpl,
              options: tpl.options.map((o) => {
                const t = optionByCode.get(o.code);
                return t ? { ...o, texts: { ...o.texts, [lang]: t } } : o;
              }),
            };
          }),
        }
      : questionnaire.responseTemplates;

    const updatedName = nameTranslation ? { ...questionnaire.name, [lang]: nameTranslation } : questionnaire.name;
    const updatedDescription = descTranslation
      ? { ...(questionnaire.description ?? {}), [lang]: descTranslation } as Record<LanguageType, string>
      : questionnaire.description;

    const supportedLanguages = questionnaire.supportedLanguages.includes(lang)
      ? questionnaire.supportedLanguages
      : [...questionnaire.supportedLanguages, lang];

    return {
      ...questionnaire,
      name: updatedName,
      ...(updatedDescription ? { description: updatedDescription } : {}),
      sections: updatedSections,
      responseTemplates: updatedTemplates,
      supportedLanguages,
    };
  } catch {
    return questionnaire;
  }
}

// ─── Manifest file parser ──────────────────────────────────────────────────
//
// Manifest ecore model: code, description, requiredSkills, public

export function parseManifestFile(xmlText: string): PackageMetadata | null {
  try {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    const root = doc.documentElement;
    const code = attr(root, 'code');
    if (!code) return null;
    return {
      code,
      description: attr(root, 'description') || undefined,
      requiredSkills: attr(root, 'requiredSkills') || undefined,
      isPublic: attr(root, 'public') === 'true',
    };
  } catch {
    return null;
  }
}
