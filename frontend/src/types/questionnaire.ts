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
  /** Funksjonen på venstre side når det ikke er questionResponseValue, f.eks. 'answered' / 'unanswered' */
  fn?: string;
  /** BooleanBasicType på høyre side, f.eks. answered(Q) == true */
  boolValue?: boolean;
}

/** Uttrykket slik det sto i fila, og fingeravtrykk av det Studio leste ut av det (se expression-raw.ts) */
export interface RawExpression {
  xml: string;
  fingerprint: string;
}

export interface HideExpression {
  statements: SimpleStatement[];
  logic: 'AND' | 'OR';
  _raw?: RawExpression;
}

export interface ShowExpression {
  statements: SimpleStatement[];
  logic: 'AND' | 'OR';
  _raw?: RawExpression;
}

export interface ContinueIfExpression {
  statements: SimpleStatement[];
  logic: 'AND' | 'OR';
  _raw?: RawExpression;
}

// ─── Options / Answer alternatives ────────────────────────────────────────

export interface TextOption {
  code: string;
  score?: number;
  reverseValue?: boolean;
  texts: Record<LanguageType, string>; // language → text
  /** Barneelementer fra fila (f.eks. show på alternativet), skrives tilbake uendret */
  _extraXml?: string;
  /** Alternativet er et bildealternativ (questionnaire:ImageOption@imageFile) */
  imageFile?: string;
}


export interface ImageOption {
  code: string;
  score?: number;
  imagePath: string;
  texts?: Record<LanguageType, string>;
}

export type Option = TextOption | ImageOption;

// ─── Response template ────────────────────────────────────────────────────

/**
 * Verdietikett på en skala (ResponseTemplate.valueLabel i questionnaire.ecore).
 * Ekte pakker bruker TextValueLabel ved min og maks som endetekster på glidebrytere
 * («Ingen smerte» / «Verst tenkelige smerte»), og ImageValueLabel for bilder ved verdiene.
 */
export interface ValueLabel {
  code: string;
  value: number;
  /** Verdien slik den sto i fila («1» / «1.0»), så den skrives likt tilbake */
  _rawValue?: string;
  /** TextValueLabel@label per språk */
  texts?: Record<LanguageType, string>;
  /** ImageValueLabel@imageFile – da er etiketten et bilde */
  imageFile?: string;
  description?: string;
}

export interface ResponseTemplate {
  code: string;
  name: string;
  options: TextOption[];
  /** Widget type as stored in Studio XML, e.g. 'Radiobutton', 'Checkbox', 'Combobox', 'NumericInput', 'NumericSlider', 'StringInput', 'DateInput' */
  widgetType?: string;
  /** Raw widget XML attributes for round-trip fidelity, e.g. { min: '0', max: '100', decimals: '0' } */
  widgetParams?: Record<string, string>;
  /** Verdietiketter (TextValueLabel / ImageValueLabel) */
  valueLabels?: ValueLabel[];
  /** Andre barneelementer i malen, skrives tilbake uendret */
  _extraXml?: string;
}

export interface ResponseTemplates {
  templates: ResponseTemplate[];
}

// ─── Question types ───────────────────────────────────────────────────────

/** Layout/LayoutData fra modellen (f.eks. GridLayout, GridData@horizontalSpan) – bevares uendret ved import/eksport. */
export interface RawLayout {
  /** xsi:type, f.eks. 'questionnaire:GridData' */
  type: string;
  attrs?: Record<string, string>;
}

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
  /** Element.layoutData (f.eks. GridData med horizontalSpan) */
  layoutData?: RawLayout;
  /**
   * Attributter og barneelementer fra fila som Studio ikke redigerer (f.eks. defaultOption,
   * defaultResponseValue, textExpression). Skrives tilbake uendret.
   */
  _extraAttrs?: Record<string, string>;
  _extraXml?: string;
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
  /** Delt svarmal (f.eks. i en matrise). Uten denne får feltet sin egen mal ved eksport. */
  responseTemplateCode?: string;
  size: StringInputSize;
  multiline?: boolean;
}

export interface NumericInputQuestion extends BaseQuestion {
  type: 'numericInput';
  /** Delt svarmal (f.eks. i en matrise). Uten denne får feltet sin egen mal ved eksport. */
  responseTemplateCode?: string;
  min?: number;
  max?: number;
  decimals?: number;
  unit?: string;
}

export interface DateInputQuestion extends BaseQuestion {
  type: 'dateInput';
  /** Delt svarmal (f.eks. i en matrise). Uten denne får feltet sin egen mal ved eksport. */
  responseTemplateCode?: string;
  includeTime?: boolean;
  /** Årsgrenser (DateInput i questionnaire.ecore). Relativ = i forhold til inneværende år, f.eks. -120 / 0. */
  minAbsoluteYear?: number;
  maxAbsoluteYear?: number;
  minRelativeYear?: number;
  maxRelativeYear?: number;
}

export interface SliderQuestion extends BaseQuestion {
  type: 'slider';
  /** Delt svarmal (f.eks. i en matrise). Uten denne får feltet sin egen mal ved eksport. */
  responseTemplateCode?: string;
  min: number;
  max: number;
  step?: number;
  /** NumericSlider.labelStep – avstand mellom skalaetiketter (standard = step) */
  labelStep?: number;
  /**
   * Tekster ved verdier på skalaen (ResponseTemplate.valueLabel). Endetekstene er etikettene
   * med verdi lik min og maks. Eldre Studio-filer med labelMin/labelMax leses inn hit.
   */
  valueLabels?: ValueLabel[];
  showTicks?: boolean;
  showEndLabels?: boolean;
  showScaleLabels?: boolean;
  showDigitalPoints?: boolean;
  showClear?: boolean;
  displayValue?: boolean;
  direction?: 'horizontal' | 'vertical';
  /** NumericSlider.valuePosition / labelPosition (TextPosition: before | after) */
  valuePosition?: 'before' | 'after';
  scaleLabelPosition?: 'before' | 'after';
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

/** Lyd/video-element (questionnaire:AudioVideo) – spiller av en mediefil (mp3) i pakken. */
export interface AudioVideoQuestion extends BaseQuestion {
  type: 'audioVideo';
  /** Filnavn i media/ eller full URL */
  mediaFile?: string;
}

export type AttachmentFileType = 'ANY' | 'IMAGE' | 'DOCUMENT';

/**
 * Vedlegg (questionnaire:Attachment): respondenten laster opp filer. Teksten står i `texts`
 * (Attachment@text). Brukes i 180 av ~25 000 pakker i store.
 */
export interface AttachmentQuestion extends BaseQuestion {
  type: 'attachment';
  fileType?: AttachmentFileType;
  maxFiles?: number;
  /** Største filstørrelse slik modellen har den (Attachment@maxFileSize) */
  maxFileSize?: number;
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
  | AudioVideoQuestion
  | AttachmentQuestion
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
  /** EMF Section.matrix – spørsmålene vises som en matrise (felles svaralternativer som kolonner) */
  matrix?: boolean;
  noPageBreaks?: boolean;
  autonumbering?: boolean;
  numberingType?: string;
  resetNumbering?: boolean;
  startOn?: number;
  returnToTOC?: boolean;
  returnToElement?: string;
  /**
   * Tittelen kom fra Section@description i fila, ikke fra et overskriftselement. Da skrives den bare
   * tilbake som description, slik at eksporten ikke legger til en synlig overskrift som ikke fantes.
   */
  titleFromDescription?: boolean;
  /** Container.layout (f.eks. GridLayout) */
  layout?: RawLayout;
  /** Element.layoutData når seksjonen ligger inne i en annen seksjon */
  layoutData?: RawLayout;
  /**
   * Rekkefølgen på spørsmål og underseksjoner slik de lå i fila ('q:KODE' / 's:KODE').
   * Uten denne skrives spørsmålene først og underseksjonene etter.
   */
  childOrder?: string[];
  /** Bildefil i media/ som vises i seksjonen (EMF Container.backgroundImage) */
  backgroundImage?: string;
  backgroundRepeat?: string;
  backgroundPosition?: string;
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
  data: Array<{
    score: number;
    normValue: number;
    age?: number;
    gender?: string;
    /** lookupMax slik den stod i den importerte filen */
    max?: number;
    /** Intervalltype (Lookup@type), f.eks. «[)» */
    intervalType?: string;
  }>;
  /** Importert norm: skriv grensene slik de var, i stedet for å regne ut lookupMax */
  _preserveBounds?: boolean;
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
  /** EMF Calculation.assignedByVariable, beholdes ved import/eksport */
  assignedByVariable?: boolean;
}

export interface Calculations {
  calculations: Calculation[];
  norms: Norm[];
}

// ─── Dimensions ───────────────────────────────────────────────────────────

export interface Dimension {
  code: string;
  /** Tomt navn finnes i ekte pakker og beholdes (vis koden i editoren i stedet) */
  name: string;
  /** Fila hadde ikke name-attributtet i det hele tatt */
  _noName?: boolean;
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
  /**
   * Fra de importerte .translation-filene, per språk: questionnaireName og oversettelser Studio ikke
   * redigerer (f.eks. Phrase/name fra ordboka, Flag/name). Skrives tilbake uendret.
   */
  _extraTranslations?: Partial<Record<LanguageType, {
    questionnaireName?: string;
    xml: string[];
    /** «kode|entitet|egenskap» → originalText fra fila og hovedspråkteksten den hørte til ved import */
    originalTexts?: Record<string, { original: string; source: string }>;
  }>>;
  /** Rå XML for rotelementer Studio ikke redigerer (copyright, dictionary, calculations), beholdes ved eksport */
  _rawRootElements?: { copyright?: string; dictionary?: string; calculations?: string };
}

// ─── Package metadata (from .manifest file) ───────────────────────────────

export interface PackageMetadata {
  code: string;
  description?: string;
  requiredSkills?: string;
  isPublic: boolean;
  /**
   * Pakkens navn, versjon og utgivelse fra manifestet. Store bruker disse, og de kan være ulike
   * kartleggingens egne (f.eks. pakke 3.2 med kartlegging versjon 1). Mangler de, brukes kartleggingens.
   */
  name?: string;
  version?: string;
  release?: string;
  /**
   * Andre kartlegginger i samme pakke (f.eks. statuslys-pakker med én kartlegging per farge).
   * Studio redigerer bare den første; disse skrives tilbake uendret ved eksport og publisering.
   */
  extraQuestionnaires?: Array<{ fileName: string; content: string }>;
  /**
   * Dokumentlenker: filer i media/ som kartleggingen viser som lenker i menyen i portalen
   * (manifest: file@reference på .questionnaire-fila, mellomromsseparerte id-er). Filnavn her.
   */
  documentLinks?: string[];
  /** .project fra den importerte pakken (Eclipse-prosjektfila), skrives tilbake uendret */
  projectXml?: string;
  /** reference på andre filer i manifestet (f.eks. rapporter), filnavn → filnavn de peker på */
  otherReferences?: Record<string, string[]>;
  /**
   * Filnavnene fra den importerte pakken, så eksporten ikke gir filene nye navn:
   * kartleggingen (og koden den hadde da) og oversettelsene per språk.
   */
  sourceFileNames?: {
    questionnaire?: { fileName: string; code: string };
    translations?: Partial<Record<LanguageType, string>>;
    /** Rekkefølgen filene hadde i manifestet (filnavn) */
    order?: string[];
    /** Filer som sto uten code i manifestet */
    noCode?: string[];
    /** Manifestet hadde ikke requiredSkills */
    noRequiredSkills?: boolean;
  };
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
