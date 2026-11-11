import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { countPhrase, t, tf, useUILang, type UILang } from '../../i18n';
import type {
  Questionnaire,
  Question,
  Section,
  LanguageType,
  TextOption,
  HideExpression,
  ShowExpression,
  Calculation,
} from '../../types/questionnaire';

// ── Expression evaluator ──────────────────────────────────────────────────────

export type AnswerMap = Map<string, string | string[]>;

function evalStatement(stmt: { questionCode: string; operator: string; value?: string }, answers: AnswerMap): boolean {
  const raw = answers.get(stmt.questionCode);
  const strVal = Array.isArray(raw) ? raw.join(',') : (raw ?? '');
  const hasVal = strVal !== '' && strVal !== undefined;

  switch (stmt.operator) {
    case 'HAS_VALUE': return hasVal;
    case 'NO_VALUE':  return !hasVal;
    case 'EQ':        return strVal === (stmt.value ?? '');
    case 'NEQ':       return strVal !== (stmt.value ?? '');
    case 'GT':        return parseFloat(strVal) > parseFloat(stmt.value ?? '0');
    case 'GTE':       return parseFloat(strVal) >= parseFloat(stmt.value ?? '0');
    case 'LT':        return parseFloat(strVal) < parseFloat(stmt.value ?? '0');
    case 'LTE':       return parseFloat(strVal) <= parseFloat(stmt.value ?? '0');
    default:          return true;
  }
}

function evalExpression(expr: HideExpression | ShowExpression, answers: AnswerMap): boolean {
  if (expr.statements.length === 0) return false;
  if (expr.logic === 'AND') return expr.statements.every((s) => evalStatement(s, answers));
  return expr.statements.some((s) => evalStatement(s, answers));
}

function isVisible(q: Question | Section, answers: AnswerMap): boolean {
  if (q.hideExpressions?.length) {
    for (const expr of q.hideExpressions) {
      if (evalExpression(expr, answers)) return false;
    }
  }
  if (q.showExpressions?.length) {
    for (const expr of q.showExpressions) {
      if (!evalExpression(expr, answers)) return false;
    }
  }
  return true;
}

/** Returns true if navigation to the next section is allowed (all continueIf conditions met). */
function canContinue(section: Section, answers: AnswerMap): boolean {
  if (!section.continueIfExpressions?.length) return true;
  return section.continueIfExpressions.every((expr) => evalExpression(expr, answers));
}

/**
 * Respondent progress, as a whole percent.
 * The value is how far the end of the current page reaches through every
 * visible item (questions and text blocks alike), rounded. The last page is 100.
 * A 22-item form split 6 / 5 / 5 / 6 therefore reads 27, 50, 73, 100.
 */
export function respondentProgress(pageItemCounts: number[], pageIndex: number): number {
  const total = pageItemCounts.reduce((sum, n) => sum + n, 0);
  if (pageItemCounts.length === 0 || total <= 0) return 0;
  const idx = Math.min(Math.max(pageIndex, 0), pageItemCounts.length - 1);
  if (idx === pageItemCounts.length - 1) return 100;
  let through = 0;
  for (let i = 0; i <= idx; i++) through += pageItemCounts[i];
  return Math.round((through / total) * 100);
}

// ── Live-scoring evaluator ───────────────────────────────────────────────────

interface AnswerEntry {
  score: number;
}

type AnswerEntryMap = Map<string, AnswerEntry>;

function optionList(q: Question, templateMap: Map<string, TextOption[]>): TextOption[] {
  if (q.type === 'radiobutton' || q.type === 'checkbox' || q.type === 'combobox') {
    if (q.responseTemplateCode) return templateMap.get(q.responseTemplateCode) ?? [];
    return q.options ?? [];
  }
  if (q.type === 'rank') return q.options;
  return [];
}

function buildAnswerEntryMap(
  answers: AnswerMap,
  questionnaire: Questionnaire,
): AnswerEntryMap {
  const result: AnswerEntryMap = new Map();
  const allQuestions: Question[] = [];
  const stack = [...questionnaire.sections];
  while (stack.length) {
    const sec = stack.pop();
    if (!sec) break;
    for (const q of sec.questions) { if (q.code) allQuestions.push(q); }
    if (sec.subSections) stack.push(...sec.subSections);
  }

  const templateMap = new Map<string, TextOption[]>();
  for (const tpl of questionnaire.responseTemplates?.templates ?? []) {
    templateMap.set(tpl.code, tpl.options);
  }

  for (const q of allQuestions) {
    const raw = answers.get(q.code);
    if (raw === undefined || raw === '' || (Array.isArray(raw) && raw.length === 0)) continue;
    const rawStr = Array.isArray(raw) ? raw[0] : raw;

    if (q.type === 'radiobutton' || q.type === 'combobox' || q.type === 'checkbox') {
      const opts = optionList(q, templateMap);
      const codes = Array.isArray(raw) ? raw : [rawStr];
      const picked = q.type === 'checkbox'
        ? opts.find((o) => codes.includes(o.code))
        : opts.find((o) => o.code === rawStr);
      if (picked) result.set(q.code, { score: picked.score ?? 0 });
    } else {
      const num = parseFloat(rawStr);
      result.set(q.code, { score: Number.isNaN(num) ? 0 : num });
    }
  }
  return result;
}

function evaluateCalcLive(calc: Calculation, entryMap: AnswerEntryMap): number | null {
  if (calc.type === 'CUSTOM') return null;
  const scores = calc.innerCalculations
    .map((ic) => {
      const e = entryMap.get(ic.questionCode ?? '');
      if (e == null) return NaN;
      return e.score * (ic.multiplier ?? 1);
    })
    .filter((s) => !Number.isNaN(s));

  switch (calc.type) {
    case 'SUM':   return scores.reduce((a, b) => a + b, 0);
    case 'MEAN':  return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    case 'COUNT': return scores.length;
    default:      return null;
  }
}

// ── Chrome language (print can follow the form language) ─────────────────────

const ChromeLangContext = createContext<UILang | null>(null);

function useChromeLang(): UILang {
  const override = useContext(ChromeLangContext);
  const ui = useUILang();
  return override ?? ui;
}

// ── Rich text ────────────────────────────────────────────────────────────────

function cwToHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/&lt;cwbold&gt;/g, '<strong>')
    .replace(/&lt;\/cwbold&gt;/g, '</strong>')
    .replace(/&lt;cwitalics?&gt;/g, '<em>')
    .replace(/&lt;\/cwitalics?&gt;/g, '</em>')
    .replace(/&lt;cwunderline&gt;/g, '<u>')
    .replace(/&lt;\/cwunderline&gt;/g, '</u>')
    .replace(/&lt;br\s*\/?&gt;/gi, '<br/>')
    .replace(/\n/g, '<br/>');
}

function hasCwTags(text: string): boolean {
  return /<cw|<br/i.test(text);
}

function Rich({ text, className }: { text: string; className?: string }) {
  if (hasCwTags(text)) {
    return <span className={className} dangerouslySetInnerHTML={{ __html: cwToHtml(text) }} />;
  }
  return <span className={className}>{text}</span>;
}

function isNumbered(q: Question): boolean {
  return q.type !== 'text' && q.type !== 'image';
}

function isFilled(value: string | string[] | undefined): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  return value !== '';
}

function answerKeyFor(code: string, rep: number): string {
  return rep === 0 ? code : `${code}_${rep + 1}`;
}

function typeHint(q: Question, lang: UILang): string {
  switch (q.type) {
    case 'numericInput': {
      const parts: string[] = [];
      if (q.min !== undefined) parts.push(`min: ${q.min}`);
      if (q.max !== undefined) parts.push(`max: ${q.max}`);
      if (q.unit) parts.push(q.unit);
      return parts.length > 0 ? `[${parts.join(', ')}]` : t('printNumeric', lang);
    }
    case 'stringInput':
      return q.multiline ? t('printTextArea', lang) : t('printTextField', lang);
    case 'dateInput':
      return t('printDate', lang);
    case 'slider':
      return tf('printSlider', lang, { min: q.min, max: q.max });
    case 'image':
      return t('printImage', lang);
    case 'country':
      return t('printCountry', lang);
    default:
      return '';
  }
}

// ── Icons (portal chrome) ────────────────────────────────────────────────────

function MenuGlyph() {
  return (
    <svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true">
      <path d="M1 1.2h16M1 7h16M1 12.8h16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function HomeGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none">
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5.2v-6.2H10.2V21H5a1 1 0 0 1-1-1v-9.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function BackGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none">
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.6" />
      <path d="M13.8 8.6 10 12l3.8 3.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TasksGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none">
      <rect x="6" y="3.5" width="12" height="17" rx="1.4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 3.5h6v2.2H9z" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 11h6M9 14.5h6M9 18h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ArrowGlyph({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none">
      {dir === 'right' ? (
        <path d="M4 12h15M14 6.5 19.5 12 14 17.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M20 12H5M10 6.5 4.5 12 10 17.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

// ── Widgets ──────────────────────────────────────────────────────────────────

function EmptyOptions() {
  const ui = useChromeLang();
  return <span className="cw-resp-muted">{t('noOptionsYet', ui)}</span>;
}

function ChoiceList({
  questionId,
  kind,
  options,
  lang,
  selected,
  onChange,
  columns,
}: {
  questionId: string;
  kind: 'radio' | 'checkbox';
  options: TextOption[];
  lang: LanguageType;
  selected: string | string[] | null;
  onChange?: (code: string, checked: boolean) => void;
  columns?: number;
}) {
  if (options.length === 0) return <div className="cw-resp-options"><EmptyOptions /></div>;
  const grid = columns && columns > 1;
  const chosen = Array.isArray(selected) ? selected : [];
  return (
    <div
      className={grid ? 'cw-resp-options is-grid' : 'cw-resp-options'}
      style={grid ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
    >
      {options.map((opt) => {
        const on = kind === 'radio' ? selected === opt.code : chosen.includes(opt.code);
        return (
          <label key={opt.code} className="cw-resp-opt">
            <input
              className="cw-resp-choice"
              type={kind === 'radio' ? 'radio' : 'checkbox'}
              name={questionId}
              checked={on}
              onChange={() => onChange?.(opt.code, !on)}
            />
            <Rich className="cw-resp-opt-label" text={opt.texts[lang] || opt.code} />
          </label>
        );
      })}
    </div>
  );
}

const COUNTRIES_NO = [
  'Norge', 'Sverige', 'Danmark', 'Finland', 'Island',
  'Storbritannia', 'Irland', 'USA', 'Canada', 'Australia', 'New Zealand',
  'Tyskland', 'Frankrike', 'Spania', 'Italia', 'Portugal', 'Belgia',
  'Nederland', 'Sveits', 'Østerrike', 'Polen', 'Tsjekkia', 'Slovakia',
  'Ungarn', 'Romania', 'Bulgaria', 'Kroatia', 'Serbia', 'Ukraina', 'Russland',
  'Tyrkia', 'Kina', 'Japan', 'Sør-Korea', 'India', 'Pakistan', 'Afghanistan',
  'Iran', 'Irak', 'Syria', 'Israel', 'Saudi-Arabia', 'De forente arabiske emirater',
  'Egypt', 'Marokko', 'Tunisia', 'Nigeria', 'Etiopia', 'Somalia', 'Eritrea',
  'Sør-Afrika', 'Brasil', 'Argentina', 'Chile', 'Colombia', 'Mexico',
  'Andre',
];

function RankWidget({
  options,
  lang,
  value,
  onAnswer,
}: {
  options: TextOption[];
  lang: LanguageType;
  value: string;
  onAnswer?: (v: string) => void;
}) {
  const ui = useChromeLang();
  const orderedCodes = useMemo(() => {
    if (value) {
      const stored = value.split(',').map((c) => c.trim()).filter(Boolean);
      const extra = options.map((o) => o.code).filter((c) => !stored.includes(c));
      return [...stored, ...extra];
    }
    return options.map((o) => o.code);
  }, [value, options]);

  const optMap = useMemo(() => {
    const m = new Map<string, TextOption>();
    for (const o of options) m.set(o.code, o);
    return m;
  }, [options]);

  function move(index: number, direction: -1 | 1) {
    if (!onAnswer) return;
    const next = [...orderedCodes];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    const a = next[index];
    const b = next[target];
    if (a === undefined || b === undefined) return;
    next[index] = b;
    next[target] = a;
    onAnswer(next.join(','));
  }

  if (options.length === 0) return <EmptyOptions />;

  return (
    <div className="cw-resp-options">
      {orderedCodes.map((code, i) => {
        const opt = optMap.get(code);
        if (!opt) return null;
        return (
          <div key={code} className="cw-resp-opt" style={{ cursor: 'default' }}>
            <span className="cw-resp-q-label" style={{ minWidth: 22 }}>{i + 1}.</span>
            <Rich className="cw-resp-opt-label" text={opt.texts[lang] || opt.code} />
            {onAnswer && (
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                <button type="button" className="cw-resp-link" onClick={() => move(i, -1)} disabled={i === 0} title={t('moveUp', ui)}>↑</button>
                <button type="button" className="cw-resp-link" onClick={() => move(i, 1)} disabled={i === orderedCodes.length - 1} title={t('moveDown', ui)}>↓</button>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function QuestionBlock({
  question,
  lang,
  index,
  showIndex,
  options,
  answers,
  answerCode,
  rep,
  hot,
  expert,
  interactive,
  onAnswer,
}: {
  question: Question;
  lang: LanguageType;
  index: number;
  showIndex: boolean;
  options: TextOption[];
  answers: AnswerMap;
  answerCode: string;
  rep: number;
  hot: boolean;
  expert: boolean;
  interactive: boolean;
  onAnswer?: (code: string, value: string | string[]) => void;
}) {
  const ui = useChromeLang();
  const text = question.texts[lang] || '';
  const help = question.helpTexts?.[lang];
  const raw = answerCode ? answers.get(answerCode) : undefined;
  const hint = expert ? typeHint(question, ui) : '';

  if (question.type === 'text') {
    if (!text && !expert) {
      return interactive ? <p className="cw-resp-muted">{t('textBlockEmpty', ui)}</p> : null;
    }
    const style = question.contentStyle;
    if (style === 'header') {
      return <h3 className="cw-resp-section-title"><Rich text={text} /></h3>;
    }
    return (
      <div className="cw-resp-info" style={style === 'italic' ? { fontStyle: 'italic' } : undefined}>
        {expert && question.code ? <span className="cw-resp-code">{question.code}</span> : null}
        {text ? <Rich text={text} /> : <span className="cw-resp-muted">{t('textBlockEmpty', ui)}</span>}
      </div>
    );
  }

  if (question.type === 'image') {
    return (
      <div className="cw-resp-q" data-qid={`${question.id}-${rep}`}>
        {question.imageSrc ? (
          <img src={question.imageSrc} alt={question.altText?.[lang] || ''} style={{ maxWidth: '100%', borderRadius: 2 }} />
        ) : (
          <span className="cw-resp-muted">{expert ? t('printImage', ui) : t('noImageSpecified', ui)}</span>
        )}
      </div>
    );
  }

  function commit(value: string | string[]) {
    if (!interactive || !onAnswer || !answerCode) return;
    onAnswer(answerCode, value);
  }

  const label = (
    <span className="cw-resp-q-label">
      {expert && question.code ? <span className="cw-resp-code">{question.code}</span> : null}
      {showIndex ? `${index}. ` : ''}
      {text ? <Rich text={text} /> : <span className="cw-resp-muted">{t('noQuestionText', ui)}</span>}
      {hint ? <span className="cw-resp-code"> {hint}</span> : null}
    </span>
  );

  return (
    <div className={hot ? 'cw-resp-q is-hot' : 'cw-resp-q'} data-qid={`${question.id}-${rep}`}>
      {label}
      {help ? <div className="cw-resp-help">{help}</div> : null}

      {question.type === 'radiobutton' && (
        <ChoiceList
          questionId={`${question.id}-${rep}`}
          kind="radio"
          options={options}
          lang={lang}
          selected={typeof raw === 'string' ? raw : null}
          columns={question.numberOfColumns}
          onChange={(code) => commit(code)}
        />
      )}
      {question.type === 'checkbox' && (
        <ChoiceList
          questionId={`${question.id}-${rep}`}
          kind="checkbox"
          options={options}
          lang={lang}
          selected={Array.isArray(raw) ? raw : []}
          columns={question.numberOfColumns}
          onChange={(code, checked) => {
            const cur = new Set(Array.isArray(raw) ? raw : []);
            if (checked) cur.add(code);
            else cur.delete(code);
            commit(Array.from(cur));
          }}
        />
      )}
      {question.type === 'combobox' && (
        options.length === 0 ? <div className="cw-resp-options"><EmptyOptions /></div> : (
          <select
            className="cw-resp-field"
            value={typeof raw === 'string' ? raw : ''}
            onChange={(e) => commit(e.target.value)}
          >
            <option value="">—</option>
            {options.map((opt) => (
              <option key={opt.code} value={opt.code}>{opt.texts[lang] || opt.code}</option>
            ))}
          </select>
        )
      )}
      {question.type === 'slider' && (
        <SliderField
          min={question.min}
          max={question.max}
          step={question.step}
          minLabel={question.minLabel?.[lang]}
          maxLabel={question.maxLabel?.[lang]}
          value={typeof raw === 'string' ? raw : undefined}
          onAnswer={(v) => commit(v)}
        />
      )}
      {question.type === 'numericInput' && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <input
            className="cw-resp-field"
            style={{ width: 120, marginLeft: 26 }}
            type="number"
            min={question.min}
            max={question.max}
            value={typeof raw === 'string' ? raw : ''}
            placeholder={question.min !== undefined && question.max !== undefined ? `${question.min}–${question.max}` : '0'}
            onChange={(e) => commit(e.target.value)}
          />
          {question.unit ? <span className="cw-resp-opt-label">{question.unit}</span> : null}
        </span>
      )}
      {question.type === 'stringInput' && (
        question.multiline ? (
          <textarea
            className="cw-resp-field"
            rows={3}
            value={typeof raw === 'string' ? raw : ''}
            placeholder={t('enterText', ui)}
            onChange={(e) => commit(e.target.value)}
          />
        ) : (
          <input
            className="cw-resp-field"
            type="text"
            value={typeof raw === 'string' ? raw : ''}
            placeholder={t('enterShort', ui)}
            onChange={(e) => commit(e.target.value)}
            style={{
              width: question.size === 'SMALL' ? 140 : question.size === 'MEDIUM' ? 240 : question.size === 'LARGE' ? 360 : 'calc(100% - 26px)',
            }}
          />
        )
      )}
      {question.type === 'dateInput' && (
        <input
          className="cw-resp-field"
          type={question.includeTime ? 'datetime-local' : 'date'}
          value={typeof raw === 'string' ? raw : ''}
          onChange={(e) => commit(e.target.value)}
        />
      )}
      {question.type === 'rank' && (
        <RankWidget
          options={question.options}
          lang={lang}
          value={typeof raw === 'string' ? raw : ''}
          onAnswer={interactive ? (v) => commit(v) : undefined}
        />
      )}
      {question.type === 'country' && (
        <select
          className="cw-resp-field"
          value={typeof raw === 'string' ? raw : ''}
          onChange={(e) => commit(e.target.value)}
        >
          <option value="">{t('selectCountry', ui)}</option>
          {COUNTRIES_NO.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      )}
    </div>
  );
}

function SliderField({
  min,
  max,
  step = 1,
  minLabel,
  maxLabel,
  value,
  onAnswer,
}: {
  min: number;
  max: number;
  step?: number;
  minLabel?: string;
  maxLabel?: string;
  value?: string;
  onAnswer?: (v: string) => void;
}) {
  const parsed = value !== undefined && value !== '' ? Number(value) : Math.round((min + max) / 2);
  const current = Number.isNaN(parsed) ? min : parsed;
  return (
    <div className="cw-resp-slider">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="cw-resp-opt-label">{min}</span>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={current}
          onChange={(e) => onAnswer?.(e.target.value)}
        />
        <span className="cw-resp-opt-label">{max}</span>
        <span className="cw-resp-btn cw-resp-btn-primary" style={{ minHeight: 26, padding: '0 8px', cursor: 'default' }}>{current}</span>
      </div>
      {(minLabel || maxLabel) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
          <span className="cw-resp-help">{minLabel}</span>
          <span className="cw-resp-help">{maxLabel}</span>
        </div>
      )}
    </div>
  );
}

// ── Sheet (one section, or the whole assessment for print) ──────────────────

interface Attention {
  id: string;
  rep: number;
  code: string;
}

interface SheetBase {
  questionnaire: Questionnaire;
  lang: LanguageType;
  answers: AnswerMap;
  onAnswer?: (code: string, value: string | string[]) => void;
  interactive?: boolean;
  expertMode?: boolean;
  chromeLang?: UILang;
  /** Print lists every question. The live form honours show/hide. */
  showAll?: boolean;
  repetitionCounts?: Map<string, number>;
  onChangeRepetitions?: (next: Map<string, number>) => void;
  onChangeAnswers?: (next: AnswerMap) => void;
  highlight?: Attention | null;
}

interface PageSheetProps extends SheetBase {
  mode: 'page';
  section: Section;
  sectionOrdinal: number;
  questionStart: number;
  actions?: ReactNode;
  showCopyright?: boolean;
}

interface DocumentSheetProps extends SheetBase {
  mode: 'document';
}

export type RespondentSheetProps = PageSheetProps | DocumentSheetProps;

function sectionReps(section: Section, counts: Map<string, number> | undefined): number {
  if (section.type !== 'REPEATED') return 1;
  return counts?.get(section.id) ?? 1;
}

function SectionQuestions({
  section,
  lang,
  start,
  answers,
  templateMap,
  showAll,
  interactive,
  expert,
  highlight,
  onAnswer,
  onChangeRepetitions,
  onChangeAnswers,
  repetitionCounts,
}: {
  section: Section;
  lang: LanguageType;
  start: number;
  answers: AnswerMap;
  templateMap: Map<string, TextOption[]>;
  showAll: boolean;
  interactive: boolean;
  expert: boolean;
  highlight?: Attention | null;
  onAnswer?: (code: string, value: string | string[]) => void;
  onChangeRepetitions?: (next: Map<string, number>) => void;
  onChangeAnswers?: (next: AnswerMap) => void;
  repetitionCounts?: Map<string, number>;
}) {
  const ui = useChromeLang();
  const visible = section.questions.filter((q) => showAll || isVisible(q, answers));
  const reps = sectionReps(section, repetitionCounts);
  const blocks: ReactNode[] = [];
  let n = start;

  for (let ri = 0; ri < reps; ri++) {
    if (ri > 0) {
      blocks.push(
        <div key={`rep-${ri}`} className="cw-resp-rep">
          <span className="line" />
          <span>{tf('repetition', ui, { n: ri + 1 })}</span>
          <span className="line" />
          {interactive && onChangeRepetitions && onChangeAnswers && (
            <button
              type="button"
              className="cw-resp-link"
              onClick={() => {
                const total = reps;
                onChangeAnswers((() => {
                  const next = new Map(answers);
                  for (const q of section.questions) {
                    if (!q.code) continue;
                    for (let k = ri; k < total - 1; k++) {
                      const fromKey = k + 1 === 1 ? q.code : `${q.code}_${k + 1}`;
                      const toKey = k === 0 ? q.code : `${q.code}_${k}`;
                      const val = next.get(fromKey);
                      if (val !== undefined) next.set(toKey, val);
                      else next.delete(toKey);
                    }
                    const lastKey = total - 1 === 0 ? q.code : `${q.code}_${total - 1}`;
                    next.delete(lastKey);
                  }
                  return next;
                })());
                const map = new Map(repetitionCounts ?? []);
                map.set(section.id, Math.max(1, total - 1));
                onChangeRepetitions(map);
              }}
            >
              × {t('remove', ui)}
            </button>
          )}
        </div>,
      );
    }
    for (const q of visible) {
      const numbered = isNumbered(q);
      if (numbered) n += 1;
      const code = answerKeyFor(q.code, ri);
      blocks.push(
        <QuestionBlock
          key={`${q.id}-${ri}`}
          question={q}
          lang={lang}
          index={n}
          showIndex={numbered}
          options={optionList(q, templateMap)}
          answers={answers}
          answerCode={code}
          rep={ri}
          hot={!!highlight && highlight.id === q.id && highlight.rep === ri}
          expert={expert}
          interactive={interactive}
          onAnswer={onAnswer}
        />,
      );
    }
  }

  return (
    <>
      {visible.length === 0 && interactive ? (
        <p className="cw-resp-muted" style={{ textAlign: 'center' }}>{t('noQuestionsInSection', ui)}</p>
      ) : blocks}
      {interactive && section.type === 'REPEATED' && onChangeRepetitions && (
        <button
          type="button"
          className="cw-resp-link"
          onClick={() => {
            const map = new Map(repetitionCounts ?? []);
            map.set(section.id, reps + 1);
            onChangeRepetitions(map);
          }}
        >
          + {t('addRepetition', ui)}
        </button>
      )}
    </>
  );
}

function SectionBlock(props: {
  sheet: SheetBase;
  section: Section;
  ordinal: number;
  questionStart: number;
  actions?: ReactNode;
  showCopyright?: boolean;
  templateMap: Map<string, TextOption[]>;
}) {
  const { sheet, section, ordinal, questionStart, actions, showCopyright, templateMap } = props;
  const ui = useChromeLang();
  const name = sheet.questionnaire.name[sheet.lang] || sheet.questionnaire.code || t('tabQuiz', ui);
  const description = ordinal === 0 ? sheet.questionnaire.description?.[sheet.lang] : undefined;
  const sectionTitle = section.titles?.[sheet.lang] || '';
  const copyright = showCopyright ? sheet.questionnaire.copyright : undefined;

  return (
    <section className={section.requiresNewPage && ordinal > 0 ? 'cw-resp-section cw-resp-break' : 'cw-resp-section'}>
      <h1 className="cw-resp-title">{name}</h1>
      {description ? (
        <div className="cw-resp-info"><Rich text={description} /></div>
      ) : null}
      {sectionTitle ? <h2 className="cw-resp-section-title"><Rich text={sectionTitle} /></h2> : null}
      <SectionQuestions
        section={section}
        lang={sheet.lang}
        start={questionStart}
        answers={sheet.answers}
        templateMap={templateMap}
        showAll={!!sheet.showAll}
        interactive={!!sheet.interactive}
        expert={!!sheet.expertMode}
        highlight={sheet.highlight}
        onAnswer={sheet.onAnswer}
        onChangeRepetitions={sheet.onChangeRepetitions}
        onChangeAnswers={sheet.onChangeAnswers}
        repetitionCounts={sheet.repetitionCounts}
      />
      {actions}
      {copyright ? <p className="cw-resp-foot">{copyright}</p> : null}
    </section>
  );
}

/** Shared respondent document. `page` is one portal page; `document` is the print form. */
export function RespondentSheet(props: RespondentSheetProps) {
  const templateMap = useMemo(() => {
    const map = new Map<string, TextOption[]>();
    for (const tpl of props.questionnaire.responseTemplates?.templates ?? []) map.set(tpl.code, tpl.options);
    return map;
  }, [props.questionnaire.responseTemplates]);

  const body = props.mode === 'page' ? (
    <SectionBlock
      sheet={props}
      section={props.section}
      ordinal={props.sectionOrdinal}
      questionStart={props.questionStart}
      actions={props.actions}
      showCopyright={props.showCopyright}
      templateMap={templateMap}
    />
  ) : (
    <DocumentBody sheet={props} templateMap={templateMap} />
  );

  return (
    <ChromeLangContext.Provider value={props.chromeLang ?? null}>
      {body}
    </ChromeLangContext.Provider>
  );
}

function DocumentBody({ sheet, templateMap }: { sheet: DocumentSheetProps; templateMap: Map<string, TextOption[]> }) {
  const sections = flattenSections(sheet.questionnaire.sections).filter((s) => sheet.showAll || isVisible(s, sheet.answers));
  let start = 0;
  return (
    <>
      {sections.map((section, ordinal) => {
        const mine = start;
        const reps = sectionReps(section, sheet.repetitionCounts);
        const numbered = section.questions.filter((q) => (sheet.showAll || isVisible(q, sheet.answers)) && isNumbered(q)).length;
        start += numbered * reps;
        return (
          <SectionBlock
            key={section.id}
            sheet={sheet}
            section={section}
            ordinal={ordinal}
            questionStart={mine}
            showCopyright
            templateMap={templateMap}
          />
        );
      })}
    </>
  );
}

function flattenSections(secs: Section[]): Section[] {
  const result: Section[] = [];
  const stack = [...secs].reverse();
  while (stack.length > 0) {
    const s = stack.pop();
    if (!s) break;
    result.push(s);
    if (s.subSections?.length) {
      for (let i = s.subSections.length - 1; i >= 0; i--) {
        const child = s.subSections[i];
        if (child) stack.push(child);
      }
    }
  }
  return result;
}

// ── Interactive shell (preview + simulator) ──────────────────────────────────

interface PreviewProps {
  questionnaire: Questionnaire;
  lang: LanguageType;
  onAnswerChange?: (answers: AnswerMap) => void;
}

interface PendingNav {
  count: number;
  targetIndex: number;
  finish: boolean;
}

function listMissing(section: Section, answers: AnswerMap, counts: Map<string, number>): Attention[] {
  const reps = sectionReps(section, counts);
  const missing: Attention[] = [];
  const visible = section.questions.filter((q) => isVisible(q, answers));
  for (let ri = 0; ri < reps; ri++) {
    for (const q of visible) {
      if (!isNumbered(q) || q.voluntary || !q.code) continue;
      const key = answerKeyFor(q.code, ri);
      if (!isFilled(answers.get(key))) missing.push({ id: q.id, rep: ri, code: q.code });
    }
  }
  return missing;
}

export function AssessmentPreview({ questionnaire, lang, onAnswerChange }: PreviewProps) {
  const uiLang = useUILang();
  const [sectionIndex, setSectionIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerMap>(new Map());
  const [repetitionCounts, setRepetitionCounts] = useState<Map<string, number>>(new Map());
  const [scoringOpen, setScoringOpen] = useState(false);
  const [pending, setPending] = useState<PendingNav | null>(null);
  const [attention, setAttention] = useState<Attention | null>(null);
  const [finished, setFinished] = useState(false);
  const yesRef = useRef<HTMLButtonElement>(null);

  const allSections = useMemo(() => flattenSections(questionnaire.sections), [questionnaire.sections]);
  const sections = allSections.filter((s) => isVisible(s, answers));
  const total = sections.length;
  const idx = Math.min(sectionIndex, Math.max(0, total - 1));
  const currentSection = sections[idx];

  const pageCounts = sections.map((s) => sectionReps(s, repetitionCounts) * s.questions.filter((q) => isVisible(q, answers)).length);
  const progress = respondentProgress(pageCounts, idx);
  const progressMode = questionnaire.visualizeProgress ?? 'Percentage';
  const hasItems = pageCounts.some((n) => n > 0);

  let questionStart = 0;
  for (let i = 0; i < idx; i++) {
    const s = sections[i];
    if (!s) continue;
    const reps = sectionReps(s, repetitionCounts);
    questionStart += s.questions.filter((q) => isVisible(q, answers) && isNumbered(q)).length * reps;
  }

  const allowed = currentSection ? canContinue(currentSection, answers) : true;

  function handleAnswer(code: string, value: string | string[]) {
    setAnswers((prev) => {
      const next = new Map(prev);
      if (code) next.set(code, value);
      if (code) onAnswerChange?.(next);
      return next;
    });
    setFinished(false);
  }

  function replaceAnswers(next: AnswerMap) {
    setAnswers(next);
    onAnswerChange?.(next);
    setFinished(false);
  }

  useEffect(() => {
    if (!attention) return;
    if (isFilled(answers.get(answerKeyFor(attention.code, attention.rep)))) setAttention(null);
  }, [answers, attention]);

  useEffect(() => {
    if (!attention) return;
    document.querySelector(`[data-qid="${attention.id}-${attention.rep}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [attention]);

  useEffect(() => {
    if (!pending) return;
    yesRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPending(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending]);

  function goBack() {
    if (idx <= 0) return;
    setPending(null);
    setAttention(null);
    setFinished(false);
    setSectionIndex(idx - 1);
  }

  function goHome() {
    setPending(null);
    setAttention(null);
    setFinished(false);
    setSectionIndex(0);
  }

  function requestForward() {
    if (!currentSection || !allowed) return;
    const missing = listMissing(currentSection, answers, repetitionCounts);
    const target = idx + 1;
    const finish = target >= total;
    if (missing.length > 0) {
      const first = missing[0];
      if (first) setAttention(first);
      setPending({ count: missing.length, targetIndex: finish ? idx : target, finish });
      return;
    }
    if (finish) setFinished(true);
    else setSectionIndex(target);
  }

  function confirmPending() {
    if (!pending) return;
    const next = pending;
    setPending(null);
    setAttention(null);
    if (next.finish) setFinished(true);
    else setSectionIndex(next.targetIndex);
  }

  const liveCalcResults = useMemo(() => {
    const calcs = questionnaire.calculations?.calculations ?? [];
    if (calcs.length === 0) return new Map<string, number | null>();
    const entryMap = buildAnswerEntryMap(answers, questionnaire);
    const out = new Map<string, number | null>();
    for (const calc of calcs) out.set(calc.code, evaluateCalcLive(calc, entryMap));
    return out;
  }, [answers, questionnaire]);

  const actions = currentSection ? (
    <>
      {finished && <div className="cw-resp-info">{t('previewFinished', uiLang)}</div>}
      <div className="cw-resp-actions">
        {idx > 0 && (
          <button type="button" className="cw-resp-btn cw-resp-btn-ghost" data-testid="respondent-prev" onClick={goBack}>
            {t('previousPage', uiLang)}
          </button>
        )}
        {idx < total - 1 ? (
          <button
            type="button"
            className="cw-resp-btn cw-resp-btn-primary"
            data-testid="respondent-next"
            onClick={requestForward}
            disabled={!allowed}
            title={!allowed ? t('cannotContinue', uiLang) : undefined}
          >
            {t('nextPage', uiLang)}
          </button>
        ) : (
          <button
            type="button"
            className="cw-resp-btn cw-resp-btn-finish"
            data-testid="respondent-finish"
            onClick={requestForward}
            disabled={!allowed}
            title={!allowed ? t('cannotContinue', uiLang) : undefined}
          >
            {t('finishAssessment', uiLang)}
          </button>
        )}
      </div>
    </>
  ) : null;

  const calcs = questionnaire.calculations?.calculations ?? [];

  return (
    <div className={pending ? 'cw-resp is-validating' : 'cw-resp'} data-testid="respondent-view">
      <header className="cw-resp-top">
        <button type="button" className="cw-resp-menu" aria-label={t('respMenu', uiLang)}>
          <MenuGlyph />
        </button>
        <div className="cw-resp-tools">
          <button type="button" className="cw-resp-icon" aria-label={t('respHome', uiLang)} onClick={goHome} disabled={total === 0}>
            <HomeGlyph />
          </button>
          <button type="button" className="cw-resp-icon" aria-label={t('respBack', uiLang)} onClick={goBack} disabled={idx === 0}>
            <BackGlyph />
          </button>
          <button type="button" className="cw-resp-icon cw-resp-icon-extra" aria-label={t('respTasks', uiLang)} tabIndex={-1}>
            <TasksGlyph />
          </button>
        </div>
        {total > 0 && (
          <div className="cw-resp-progress">
            {idx > 0 && (
              <button type="button" className="cw-resp-arrow cw-resp-arrow-left" aria-label={t('respBack', uiLang)} onClick={goBack}>
                <ArrowGlyph dir="left" />
              </button>
            )}
            {progressMode === 'Steps' ? (
              <span className="cw-resp-pct" data-testid="respondent-progress">
                {tf('progressSteps', uiLang, { page: idx + 1, total })}
              </span>
            ) : progressMode === 'Percentage' && hasItems ? (
              <span className="cw-resp-pct" data-testid="respondent-progress">{progress}%</span>
            ) : null}
            {idx < total - 1 && (
              <button
                type="button"
                className="cw-resp-arrow cw-resp-arrow-right"
                aria-label={t('respForward', uiLang)}
                onClick={requestForward}
                disabled={!allowed}
              >
                <ArrowGlyph dir="right" />
              </button>
            )}
          </div>
        )}
      </header>

      <div className="cw-resp-scroll">
        {total === 0 || !currentSection ? (
          <div className="cw-resp-card">
            <h1 className="cw-resp-title">{questionnaire.name[lang] || questionnaire.code || t('tabQuiz', uiLang)}</h1>
            <div className="cw-resp-empty">
              <p>{t('addSectionsHint', uiLang)}</p>
              <p>{t('previewEmptyHint', uiLang)}</p>
            </div>
          </div>
        ) : (
          <div className="cw-resp-card">
            {pending && <div className="cw-resp-dim" />}
            <RespondentSheet
              mode="page"
              questionnaire={questionnaire}
              lang={lang}
              section={currentSection}
              sectionOrdinal={idx}
              questionStart={questionStart}
              answers={answers}
              onAnswer={handleAnswer}
              interactive
              repetitionCounts={repetitionCounts}
              onChangeRepetitions={setRepetitionCounts}
              onChangeAnswers={replaceAnswers}
              highlight={attention}
              actions={actions}
              showCopyright
            />
            {calcs.length > 0 && (
              <details className="cw-resp-score" open={scoringOpen} onToggle={(e) => setScoringOpen(e.currentTarget.open)}>
                <summary>{t('showCalculations', uiLang)}</summary>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8, fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '4px 8px' }}>{t('name', uiLang)}</th>
                      <th style={{ textAlign: 'left', padding: '4px 8px' }}>{t('code', uiLang)}</th>
                      <th style={{ textAlign: 'right', padding: '4px 8px' }}>{t('result', uiLang)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calcs.map((calc) => {
                      const result = liveCalcResults.get(calc.code);
                      return (
                        <tr key={calc.code}>
                          <td style={{ padding: '4px 8px' }}>{calc.name || calc.code}</td>
                          <td style={{ padding: '4px 8px', fontFamily: 'monospace', color: 'var(--color-cw-blue)' }}>{calc.code}</td>
                          <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace' }}>
                            {calc.type === 'CUSTOM' || result == null
                              ? '—'
                              : Number.isInteger(result) ? result : result.toFixed(3)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </details>
            )}
          </div>
        )}
      </div>

      {pending && (
        <div className="cw-resp-dialog-layer">
          <div
            className="cw-resp-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cw-unanswered-title"
            data-testid="respondent-unanswered"
          >
            <h2 id="cw-unanswered-title">{t('unansweredTitle', uiLang)}</h2>
            <hr />
            <p>
              {countPhrase(pending.count, uiLang, 'unansweredOne', 'unansweredMany')}
              <br />
              {t('unansweredAsk', uiLang)}
            </p>
            <div className="cw-resp-dialog-actions">
              <button type="button" ref={yesRef} className="cw-resp-btn cw-resp-btn-primary" data-testid="respondent-confirm" onClick={confirmPending}>
                {t('confirmYes', uiLang)}
              </button>
              <button type="button" className="cw-resp-btn cw-resp-btn-neutral" data-testid="respondent-cancel" onClick={() => setPending(null)}>
                {t('confirmNo', uiLang)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
