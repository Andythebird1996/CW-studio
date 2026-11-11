/**
 * TypeScript types derived from Checkware Studio EMF model
 * (checkware-studio-master/src/questionnaire/*.java)
 */

// ─── Enums ────────────────────────────────────────────────────────────────

export type QuestionnaireType = 'QUESTIONNAIRE' | 'SCALE' | 'EXERCISE';
export type SectionType = 'NORMAL' | 'REPEATED' | 'CONDITIONAL';
export type StringInputSize = 'SMALL' | 'MEDIUM' | 'LARGE' | 'XLARGE';
export type OptionType = 'TEXT' | 'IMAGE';
export type FlagType = 'INFO' | 'WARNING' | 'CRITICAL';
export type NormType = 'NORM' | 'PERCENTILE' | 'ZSCORE';
export type CalculationType = 'SUM' | 'MEAN' | 'COUNT' | 'CUSTOM';
export type OperatorType = 'ADD' | 'SUBTRACT' | 'MULTIPLY' | 'DIVIDE' | 'MODULO';
export type FunctionName = 'ABS' | 'ROUND' | 'FLOOR' | 'CEIL' | 'MIN' | 'MAX' | 'IF';
export type LanguageType = 'NO' | 'EN' | 'SV' | 'DA' | 'FI' | 'DE' | 'FR' | 'PL';
export type ElementAlignment = 'LEFT' | 'CENTER' | 'RIGHT';
export type LabelPosition = 'ABOVE' | 'LEFT' | 'RIGHT' | 'BELOW';

// ─── Core expressions ─────────────────────────────────────────────────────

export interface SimpleStatement {
  questionCode: string;
  operator: 'EQ' | 'NEQ' | 'LT' | 'LTE' | 'GT' | 'GTE' | 'HAS_VALUE' | 'NO_VALUE';
  value?: string;
}

export interface HideExpression {
  statements: SimpleStatement[];
  logic: 'AND' | 'OR';
}

export interface ShowExpression {
  statements: SimpleStatement[];
  logic: 'AND' | 'OR';
}

export interface ContinueIfExpression {
  statements: SimpleStatement[];
  logic: 'AND' | 'OR';
}

// ─── Options / Answer alternatives ────────────────────────────────────────

export interface TextOption {
  code: string;
  score?: number;
  reverseValue?: boolean;
  texts: Record<LanguageType, string>; // language → text
}


export interface ImageOption {
  code: string;
  score?: number;
  imagePath: string;
  texts?: Record<LanguageType, string>;
}

export type Option = TextOption | ImageOption;

// ─── Response template ────────────────────────────────────────────────────

export interface ResponseTemplate {
  code: string;
  name: string;
  options: TextOption[];
  /** Widget type as stored in Studio XML, e.g. 'Radiobutton', 'Checkbox', 'Combobox', 'NumericInput', 'NumericSlider', 'StringInput', 'DateInput' */
  widgetType?: string;
  /** Raw widget XML attributes for round-trip fidelity, e.g. { min: '0', max: '100', decimals: '0' } */
  widgetParams?: Record<string, string>;
}

export interface ResponseTemplates {
  templates: ResponseTemplate[];
}

// ─── Question types ───────────────────────────────────────────────────────

interface BaseQuestion {
  id: string;
  code: string;
  required: boolean;
  texts: Record<LanguageType, string>;
  helpTexts?: Record<LanguageType, string>;
  hideExpressions?: HideExpression[];
  showExpressions?: ShowExpression[];
  continueIfExpressions?: ContinueIfExpression[];
  labelPosition?: LabelPosition;
  /** Element alignment within the form layout */
  align?: ElementAlignment;
  /** Question answer is optional (not counted toward mandatory completion) */
  voluntary?: boolean;
  /** Field is read-only (pre-filled, not editable by respondent) */
  readonly?: boolean;
  /** Score is reversed (high score = low value) */
  reversedScore?: boolean;
}

export interface CheckboxQuestion extends BaseQuestion {
  type: 'checkbox';
  options?: TextOption[];
  responseTemplateCode?: string;
  multiple: boolean;
  numberOfColumns?: number;
  limit?: number; // max number of selections allowed
  ignoreAnswerOptionCode?: string; // option code to exclude from logic
}

export interface RadiobuttonQuestion extends BaseQuestion {
  type: 'radiobutton';
  options?: TextOption[];
  responseTemplateCode?: string;
  numberOfColumns?: number;
  ignoreAnswerOptionCode?: string;
}

export interface ComboboxQuestion extends BaseQuestion {
  type: 'combobox';
  options?: TextOption[];
  responseTemplateCode?: string;
}

export interface StringInputQuestion extends BaseQuestion {
  type: 'stringInput';
  size: StringInputSize;
  multiline?: boolean;
}

export interface NumericInputQuestion extends BaseQuestion {
  type: 'numericInput';
  min?: number;
  max?: number;
  decimals?: number;
  unit?: string;
}

export interface DateInputQuestion extends BaseQuestion {
  type: 'dateInput';
  includeTime?: boolean;
}

export interface SliderQuestion extends BaseQuestion {
  type: 'slider';
  min: number;
  max: number;
  step?: number;
  minLabel?: Record<LanguageType, string>;
  maxLabel?: Record<LanguageType, string>;
  showTicks?: boolean;
  showEndLabels?: boolean;
  showScaleLabels?: boolean;
  showDigitalPoints?: boolean;
  showClear?: boolean;
  displayValue?: boolean;
  direction?: 'horizontal' | 'vertical';
  sliderLength?: string; // CSS length like "300px"
  hairline?: boolean;
}

export interface RankQuestion extends BaseQuestion {
  type: 'rank';
  options: TextOption[];
  maxRank?: number;
}

export interface TextElement extends BaseQuestion {
  type: 'text';
  isQuestion: false;
  /** Studio text element style: 'normal' | 'bold' | 'italic' | 'header' etc. */
  contentStyle?: string;
}

export interface ImageQuestion extends BaseQuestion {
  type: 'image';
  /** Relative path to media file in the package */
  imageSrc?: string;
  /** Accessible alt text per language */
  altText?: Record<string, string>;
}

export interface CountryQuestion extends BaseQuestion {
  type: 'country';
  multiSelect?: boolean;
}

export type Question =
  | CheckboxQuestion
  | RadiobuttonQuestion
  | ComboboxQuestion
  | StringInputQuestion
  | NumericInputQuestion
  | DateInputQuestion
  | SliderQuestion
  | RankQuestion
  | TextElement
  | ImageQuestion
  | CountryQuestion;

// ─── Section ──────────────────────────────────────────────────────────────

export interface Section {
  id: string;
  code?: string;
  type: SectionType;
  titles: Record<LanguageType, string>;
  questions: Question[];
  subSections?: Section[];    // nested sections (e.g. MINI7 contains xsi:type="questionnaire:Section")
  hideExpressions?: HideExpression[];
  showExpressions?: ShowExpression[];
  continueIfExpressions?: ContinueIfExpression[];
  repeatCode?: string;       // for REPEATED sections
  requiresNewPage?: boolean; // force page-break before this section (EMF Container.requiresNewPage)
}

// ─── Calculations ─────────────────────────────────────────────────────────

export interface InnerCalculation {
  id?: string;
  questionCode?: string;      // reference to a question
  calculationCode?: string;   // reference to another calculation
  constantValue?: number;     // fixed numeric constant
  operator?: OperatorType;
  multiplier?: number;
}

export interface Norm {
  code: string;
  name: string;
  type: NormType;
  description?: string;
  origin?: string;
  data: Array<{ score: number; normValue: number; age?: number; gender?: string }>;
}

export interface Calculation {
  code: string;
  name: string;
  type: CalculationType;
  innerCalculations: InnerCalculation[];
  formula?: string;       // Human-readable expression (imported from XML, read-only)
  normCode?: string;
  remoteScoring?: { serviceCode: string; parameters: Record<string, string> };
  /** Preserved raw XML of the <calculationExpression> element for round-trip fidelity */
  _rawExpression?: string;
}

export interface Calculations {
  calculations: Calculation[];
  norms: Norm[];
}

// ─── Dimensions ───────────────────────────────────────────────────────────

export interface Dimension {
  code: string;
  name: string;
  questionCodes: string[];
}

// ─── Flags ────────────────────────────────────────────────────────────────

export interface FlagCondition {
  calculationCode: string;
  operator: 'EQ' | 'NEQ' | 'LT' | 'LTE' | 'GT' | 'GTE';
  threshold: number;
}

export interface Flag {
  code: string;
  name: string;
  type: FlagType;
  description?: string;
  conditions: FlagCondition[];
  logic: 'AND' | 'OR';
}

// ─── Translations ─────────────────────────────────────────────────────────

export interface Phrase {
  key: string;
  texts: Record<LanguageType, string>;
}

export interface Translation {
  language: LanguageType;
  phrases: Phrase[];
}

// ─── Remote Scoring ───────────────────────────────────────────────────────

export interface RemoteScoring {
  url: string;
  parameters?: Array<{ name: string; value: string }>;
}

// ─── Questionnaire root ───────────────────────────────────────────────────

export interface Questionnaire {
  code: string;
  version: string;
  release?: string;
  name: Record<LanguageType, string>;
  description?: Record<LanguageType, string>;
  type: QuestionnaireType;
  defaultLanguage: LanguageType;
  supportedLanguages: LanguageType[];
  sections: Section[];
  responseTemplates?: ResponseTemplates;
  calculations?: Calculations;
  dimensions?: Dimension[];
  flags?: Flag[];
  translations?: Translation[];
  /** Only clinicians can administer this assessment */
  clinicianOnly?: boolean;
  /** How respondents see their progress through the assessment */
  visualizeProgress?: 'Percentage' | 'Steps' | 'None';
  // Studio XML boolean flags — preserved for round-trip fidelity
  exportAllowed?: boolean;
  authorizedDevicesOnly?: boolean;
  allowTOC?: boolean;
  restrictBackButton?: boolean;
  allowSingleBackButton?: boolean;
  unresponsiveUI?: boolean;
  /** Copyright string — available in RAP as $COPYRIGHT */
  copyright?: string;
  /** Remote scoring configuration — sends results to external service after completion */
  remoteScoring?: RemoteScoring;
}

// ─── Package metadata (from .manifest file) ───────────────────────────────

export interface PackageMetadata {
  code: string;
  description?: string;
  requiredSkills?: string;
  isPublic: boolean;
}

// ─── Media file ────────────────────────────────────────────────────────────

export interface MediaFile {
  fileName: string;
  extension: string;
  mimeType: string;
  dataUrl: string;   // data:mime;base64,... or ''
  sizeKb: number;
}

// ─── Package / Manifest ───────────────────────────────────────────────────

export interface PackageIdentifier {
  code: string;
  name: string;
  version: string;
  release: string;
  isPublic: boolean;
}

export interface StudioPackageFile {
  fileName: string;
  path: string;
  extension: string;
  code: string;
  content: string;
}

export interface StudioPackage {
  uid?: number;
  identifier: PackageIdentifier;
  files: StudioPackageFile[];
}
