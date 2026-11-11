import { useState, useMemo } from 'react';
import { t, tf, useUILang } from '../../i18n';
import type {
  Questionnaire,
  Question,
  Section,
  LanguageType,
  TextOption,
  SimpleStatement,
  HideExpression,
  ShowExpression,
  Calculation,
} from '../../types/questionnaire';

// ── Expression evaluator ──────────────────────────────────────────────────────

export type AnswerMap = Map<string, string | string[]>;

function evalStatement(stmt: SimpleStatement, answers: AnswerMap): boolean {
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

// ── Live-scoring evaluator ───────────────────────────────────────────────────
//  Mirrors the evaluateCalc logic from ScoringDebugger — kept local to avoid
//  circular imports.  Only SUM / MEAN / COUNT are inline-evaluable; CUSTOM → null.

interface AnswerEntry {
  score: number;
}

type AnswerEntryMap = Map<string, AnswerEntry>;

function buildAnswerEntryMap(
  answers: AnswerMap,
  questionnaire: Questionnaire,
): AnswerEntryMap {
  const result: AnswerEntryMap = new Map();
  const allQuestions: Question[] = [];
  const stack = [...questionnaire.sections];
  while (stack.length) {
    const sec = stack.pop()!;
    for (const q of sec.questions) { if (q.code) allQuestions.push(q); }
    if (sec.subSections) stack.push(...sec.subSections);
  }

  const templateMap = new Map<string, TextOption[]>();
  for (const t of questionnaire.responseTemplates?.templates ?? []) {
    templateMap.set(t.code, t.options);
  }

  for (const q of allQuestions) {
    const raw = answers.get(q.code);
    if (raw === undefined || raw === '' || (Array.isArray(raw) && raw.length === 0)) continue;
    const rawStr = Array.isArray(raw) ? raw[0] : raw;

    if (q.type === 'radiobutton' || q.type === 'combobox') {
      const tCode = (q as any).responseTemplateCode as string | undefined;
      const opts: TextOption[] = tCode ? (templateMap.get(tCode) ?? []) : ((q as any).options ?? []);
      const opt = opts.find((o) => o.code === rawStr);
      if (opt) result.set(q.code, { score: opt.score ?? 0 });
    } else if (q.type === 'checkbox') {
      const codes = Array.isArray(raw) ? raw : [rawStr];
      const tCode = (q as any).responseTemplateCode as string | undefined;
      const opts: TextOption[] = tCode ? (templateMap.get(tCode) ?? []) : ((q as any).options ?? []);
      // For checkbox we pick first checked option's score as a simple proxy
      const firstOpt = opts.find((o) => codes.includes(o.code));
      if (firstOpt) result.set(q.code, { score: firstOpt.score ?? 0 });
    } else {
      const num = parseFloat(rawStr);
      result.set(q.code, { score: isNaN(num) ? 0 : num });
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
    .filter((s) => !isNaN(s));

  switch (calc.type) {
    case 'SUM':   return scores.reduce((a, b) => a + b, 0);
    case 'MEAN':  return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    case 'COUNT': return scores.length;
    default:      return null;
  }
}

// ── Constants ────────────────────────────────────────────────────────────────

const CW_BLUE = '#25b8ec';
const CW_DARK = '#1a5276';
const CW_BORDER = '#d0dce8';

// ── Rank widget ───────────────────────────────────────────────────────────────

function RankWidget({
  options,
  lang,
  value,
  onAnswer,
}: {
  options: TextOption[];
  lang: LanguageType;
  value: string;         // comma-separated option codes in current order
  onAnswer: (v: string) => void;
}) {
  const uiLang = useUILang();
  // Derive ordered list from stored value, falling back to original option order
  const orderedCodes: string[] = useMemo(() => {
    if (value) {
      const stored = value.split(',').map((c) => c.trim()).filter(Boolean);
      // Append any options not yet in stored (in case options changed)
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
    const next = [...orderedCodes];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onAnswer(next.join(','));
  }

  if (options.length === 0) return <EmptyOptions />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {orderedCodes.map((code, i) => {
        const opt = optMap.get(code);
        if (!opt) return null;
        return (
          <div
            key={code}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 10px',
              background: '#f8f9fa',
              border: `1px solid ${CW_BORDER}`,
              borderRadius: 4,
              fontSize: 13,
            }}
          >
            <span
              style={{
                color: CW_BLUE,
                fontWeight: 700,
                minWidth: 22,
                flexShrink: 0,
                fontSize: 12,
              }}
            >
              {i + 1}.
            </span>
            <span
              style={{ flex: 1, lineHeight: 1.4 }}
              dangerouslySetInnerHTML={{ __html: cwToHtml(opt.texts[lang] || opt.code) }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                title={t('moveUp', uiLang)}
                style={{
                  width: 22,
                  height: 18,
                  padding: 0,
                  background: i === 0 ? '#f0f0f0' : 'white',
                  border: `1px solid ${i === 0 ? '#ddd' : '#aaa'}`,
                  borderRadius: 3,
                  cursor: i === 0 ? 'default' : 'pointer',
                  fontSize: 11,
                  color: i === 0 ? '#ccc' : '#444',
                  lineHeight: 1,
                }}
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === orderedCodes.length - 1}
                title={t('moveDown', uiLang)}
                style={{
                  width: 22,
                  height: 18,
                  padding: 0,
                  background: i === orderedCodes.length - 1 ? '#f0f0f0' : 'white',
                  border: `1px solid ${i === orderedCodes.length - 1 ? '#ddd' : '#aaa'}`,
                  borderRadius: 3,
                  cursor: i === orderedCodes.length - 1 ? 'default' : 'pointer',
                  fontSize: 11,
                  color: i === orderedCodes.length - 1 ? '#ccc' : '#444',
                  lineHeight: 1,
                }}
              >
                ↓
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Country widget ────────────────────────────────────────────────────────────

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

function CountryWidget({
  value,
  onAnswer,
}: {
  value: string | null;
  onAnswer: (v: string) => void;
}) {
  const uiLang = useUILang();
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onAnswer(e.target.value)}
      style={{
        border: `1px solid ${CW_BORDER}`,
        borderRadius: 4,
        padding: '6px 8px',
        fontSize: 14,
        outline: 'none',
        fontFamily: 'inherit',
        minWidth: 220,
        maxWidth: '100%',
      }}
    >
      <option value="">{t('selectCountry', uiLang)}</option>
      {COUNTRIES_NO.map((c) => (
        <option key={c} value={c}>{c}</option>
      ))}
    </select>
  );
}

// ── Image widget ──────────────────────────────────────────────────────────────

function ImageWidget({
  imageSrc,
  altText,
}: {
  imageSrc?: string;
  altText?: string;
}) {
  const uiLang = useUILang();
  if (!imageSrc) {
    return (
      <span style={{ fontSize: 12, color: '#bbb', fontStyle: 'italic' }}>
        {t('noImageSpecified', uiLang)}
      </span>
    );
  }
  return (
    <div>
      <img
        src={imageSrc}
        alt={altText || ''}
        style={{ maxWidth: '100%', borderRadius: 4, border: `1px solid ${CW_BORDER}` }}
      />
    </div>
  );
}

// ── Radio widget ──────────────────────────────────────────────────────────────

function RadioWidget({
  id,
  options,
  lang,
  selected,
  onSelect,
}: {
  id: string;
  options: TextOption[];
  lang: LanguageType;
  selected: string | null;
  onSelect: (code: string) => void;
}) {
  if (options.length === 0)
    return <EmptyOptions />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {options.map((opt) => {
        const active = selected === opt.code;
        return (
          <label
            key={opt.code}
            style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
            onClick={() => onSelect(active ? '' : opt.code)}
          >
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                border: `2px solid ${active ? CW_BLUE : '#bbb'}`,
                background: active ? CW_BLUE : 'white',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              {active && (
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: 'white',
                    display: 'block',
                  }}
                />
              )}
            </span>
            <span
              style={{ fontSize: 14, color: '#333', lineHeight: 1.4 }}
              dangerouslySetInnerHTML={{ __html: cwToHtml(opt.texts[lang] || opt.code) }}
            />
          </label>
        );
      })}
    </div>
  );
}

// ── Checkbox widget ───────────────────────────────────────────────────────────

function CheckboxWidget({
  options,
  lang,
  selected,
  onToggle,
}: {
  options: TextOption[];
  lang: LanguageType;
  selected: Set<string>;
  onToggle: (code: string) => void;
}) {
  if (options.length === 0)
    return <EmptyOptions />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {options.map((opt) => {
        const active = selected.has(opt.code);
        return (
          <label
            key={opt.code}
            style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
            onClick={() => onToggle(opt.code)}
          >
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: 3,
                border: `2px solid ${active ? CW_BLUE : '#bbb'}`,
                background: active ? CW_BLUE : 'white',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              {active && (
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                  <path
                    d="M1 4L3.5 6.5L9 1"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </span>
            <span
              style={{ fontSize: 14, color: '#333', lineHeight: 1.4 }}
              dangerouslySetInnerHTML={{ __html: cwToHtml(opt.texts[lang] || opt.code) }}
            />
          </label>
        );
      })}
    </div>
  );
}

// ── Combobox widget ───────────────────────────────────────────────────────────

function ComboboxWidget({
  options,
  lang,
  selected,
  onSelect,
}: {
  options: TextOption[];
  lang: LanguageType;
  selected: string | null;
  onSelect: (code: string) => void;
}) {
  if (options.length === 0) return <EmptyOptions />;

  return (
    <select
      value={selected ?? ''}
      onChange={(e) => onSelect(e.target.value)}
      style={{
        border: `1px solid ${CW_BORDER}`,
        borderRadius: 4,
        padding: '6px 8px',
        fontSize: 14,
        outline: 'none',
        fontFamily: 'inherit',
        minWidth: 200,
        maxWidth: '100%',
      }}
    >
      <option value="">—</option>
      {options.map((opt) => (
        <option key={opt.code} value={opt.code}>
          {opt.texts[lang] || opt.code}
        </option>
      ))}
    </select>
  );
}

// ── Slider widget ─────────────────────────────────────────────────────────────

function SliderWidget({
  min,
  max,
  step = 1,
  minLabel,
  maxLabel,
  onAnswer,
}: {
  min: number;
  max: number;
  step?: number;
  minLabel?: string;
  maxLabel?: string;
  onAnswer?: (v: string) => void;
}) {
  const mid = Math.round((min + max) / 2);
  const [value, setValue] = useState<number>(mid);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 12, color: '#888', minWidth: 28, textAlign: 'right' }}>{min}</span>
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => { setValue(+e.target.value); onAnswer?.(e.target.value); }}
            style={{ width: '100%', accentColor: CW_BLUE, cursor: 'pointer' }}
          />
        </div>
        <span style={{ fontSize: 12, color: '#888', minWidth: 28 }}>{max}</span>
        <span
          style={{
            minWidth: 34,
            background: CW_BLUE,
            color: 'white',
            borderRadius: 4,
            padding: '2px 7px',
            fontSize: 13,
            textAlign: 'center',
            fontWeight: 700,
          }}
        >
          {value}
        </span>
      </div>
      {(minLabel || maxLabel) && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 2,
            paddingLeft: 38,
            paddingRight: 80,
          }}
        >
          <span style={{ fontSize: 11, color: '#999' }}>{minLabel}</span>
          <span style={{ fontSize: 11, color: '#999' }}>{maxLabel}</span>
        </div>
      )}
    </div>
  );
}

// ── CW rich-text renderer ─────────────────────────────────────────────────────

/** Convert Checkware custom tags to safe HTML for display */
function cwToHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // restore CW tags as real HTML after escaping
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

// ── Small helpers ─────────────────────────────────────────────────────────────

function EmptyOptions() {
  const uiLang = useUILang();
  return (
    <span style={{ fontSize: 12, color: '#bbb', fontStyle: 'italic' }}>
      {t('noOptionsYet', uiLang)}
    </span>
  );
}

// ── Question preview ──────────────────────────────────────────────────────────

function QuestionPreview({
  question,
  lang,
  index,
  resolvedOptions,
  answers,
  onAnswer,
}: {
  question: Question;
  lang: LanguageType;
  index: number;
  resolvedOptions: TextOption[];
  answers: AnswerMap;
  onAnswer: (code: string, value: string | string[]) => void;
}) {
  const uiLang = useUILang();
  const text = question.texts[lang] || '';
  const isText = question.type === 'text';

  return (
    <div
      style={{
        marginBottom: 22,
        paddingBottom: 22,
        borderBottom: `1px solid #f0f0f0`,
      }}
    >
      {/* Label row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        {!isText && (
          <span
            style={{
              color: CW_BLUE,
              fontWeight: 700,
              fontSize: 14,
              minWidth: 22,
              flexShrink: 0,
            }}
          >
            {index}.
          </span>
        )}
        <div style={{ flex: 1 }}>
          {text ? (
            hasCwTags(text) ? (
              <span
                style={{ fontSize: 14, fontWeight: isText ? 400 : 500, color: isText ? '#555' : '#222', lineHeight: 1.5 }}
                dangerouslySetInnerHTML={{ __html: cwToHtml(text) }}
              />
            ) : (
              <span
                style={{ fontSize: 14, fontWeight: isText ? 400 : 500, color: isText ? '#555' : '#222', lineHeight: 1.5 }}
              >
                {text}
              </span>
            )
          ) : (
            <span style={{ fontSize: 13, color: '#ccc', fontStyle: 'italic' }}>
              {isText ? t('textBlockEmpty', uiLang) : t('noQuestionText', uiLang)}
            </span>
          )}
          {!isText && question.required && (
            <span style={{ color: '#e74c3c', marginLeft: 4, fontSize: 13 }}>*</span>
          )}
          {question.helpTexts?.[lang] && (
            <div style={{ fontSize: 12, color: '#888', marginTop: 4, fontStyle: 'italic' }}>
              {question.helpTexts[lang]}
            </div>
          )}
        </div>
      </div>

      {/* Widget */}
      {isText && (
        <textarea
          rows={3}
          value={(answers.get(question.code) as string) ?? ''}
          placeholder={t('enterAnswer', uiLang)}
          onChange={(e) => onAnswer(question.code, e.target.value)}
          style={{
            width: '100%',
            border: `1px solid ${CW_BORDER}`,
            borderRadius: 4,
            padding: '6px 8px',
            fontSize: 14,
            resize: 'vertical',
            outline: 'none',
            fontFamily: 'inherit',
            color: '#333',
          }}
        />
      )}
      {!isText && (
        <div style={{ paddingLeft: 30 }}>
          {question.type === 'radiobutton' && (
            <RadioWidget
              id={question.id}
              options={resolvedOptions}
              lang={lang}
              selected={(answers.get(question.code) as string) ?? null}
              onSelect={(v) => onAnswer(question.code, v)}
            />
          )}
          {question.type === 'checkbox' && (
            <CheckboxWidget
              options={resolvedOptions}
              lang={lang}
              selected={new Set(answers.get(question.code) as string[] ?? [])}
              onToggle={(v) => {
                const cur = new Set(answers.get(question.code) as string[] ?? []);
                cur.has(v) ? cur.delete(v) : cur.add(v);
                onAnswer(question.code, Array.from(cur));
              }}
            />
          )}
          {question.type === 'combobox' && (
            <ComboboxWidget
              options={resolvedOptions}
              lang={lang}
              selected={(answers.get(question.code) as string) ?? null}
              onSelect={(v) => onAnswer(question.code, v)}
            />
          )}
          {question.type === 'slider' && (
            <SliderWidget
              min={question.min}
              max={question.max}
              step={question.step}
              minLabel={question.minLabel?.[lang]}
              maxLabel={question.maxLabel?.[lang]}
              onAnswer={(v) => onAnswer(question.code, v)}
            />
          )}
          {question.type === 'numericInput' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="number"
                min={question.min}
                max={question.max}
                value={(answers.get(question.code) as string) ?? ''}
                onChange={(e) => onAnswer(question.code, e.target.value)}
                placeholder={
                  question.min !== undefined && question.max !== undefined
                    ? `${question.min} – ${question.max}`
                    : '0'
                }
                style={{
                  width: 110,
                  border: `1px solid ${CW_BORDER}`,
                  borderRadius: 4,
                  padding: '6px 8px',
                  fontSize: 14,
                  outline: 'none',
                  fontFamily: 'inherit',
                }}
              />
              {question.unit && (
                <span style={{ fontSize: 13, color: '#666' }}>{question.unit}</span>
              )}
            </div>
          )}
          {question.type === 'stringInput' &&
            (question.multiline ? (
              <textarea
                rows={3}
                value={(answers.get(question.code) as string) ?? ''}
                placeholder={t('enterText', uiLang)}
                onChange={(e) => onAnswer(question.code, e.target.value)}
                style={{
                  width: '100%',
                  border: `1px solid ${CW_BORDER}`,
                  borderRadius: 4,
                  padding: '6px 8px',
                  fontSize: 14,
                  resize: 'vertical',
                  outline: 'none',
                  fontFamily: 'inherit',
                }}
              />
            ) : (
              <input
                type="text"
                value={(answers.get(question.code) as string) ?? ''}
                placeholder={t('enterShort', uiLang)}
                onChange={(e) => onAnswer(question.code, e.target.value)}
                style={{
                  width:
                    question.size === 'SMALL'
                      ? 120
                      : question.size === 'MEDIUM'
                        ? 220
                        : question.size === 'LARGE'
                          ? 320
                          : '100%',
                  border: `1px solid ${CW_BORDER}`,
                  borderRadius: 4,
                  padding: '6px 8px',
                  fontSize: 14,
                  outline: 'none',
                  fontFamily: 'inherit',
                }}
              />
            ))}
          {question.type === 'dateInput' && (
            <input
              type={question.includeTime ? 'datetime-local' : 'date'}
              value={(answers.get(question.code) as string) ?? ''}
              onChange={(e) => onAnswer(question.code, e.target.value)}
              style={{
                border: `1px solid ${CW_BORDER}`,
                borderRadius: 4,
                padding: '6px 8px',
                fontSize: 14,
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
          )}
          {question.type === 'rank' && (
            <RankWidget
              options={question.options}
              lang={lang}
              value={(answers.get(question.code) as string) ?? ''}
              onAnswer={(v) => onAnswer(question.code, v)}
            />
          )}
          {question.type === 'country' && (
            <CountryWidget
              value={(answers.get(question.code) as string) ?? null}
              onAnswer={(v) => onAnswer(question.code, v)}
            />
          )}
          {question.type === 'image' && (
            <ImageWidget
              imageSrc={question.imageSrc}
              altText={question.altText?.[lang]}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  questionnaire: Questionnaire;
  lang: LanguageType;
  onAnswerChange?: (answers: AnswerMap) => void;
}

function flattenSections(secs: Section[]): Section[] {
  const result: Section[] = [];
  const stack = [...secs].reverse();
  while (stack.length > 0) {
    const s = stack.pop()!;
    result.push(s);
    if (s.subSections?.length) {
      for (let i = s.subSections.length - 1; i >= 0; i--) stack.push(s.subSections[i]);
    }
  }
  return result;
}

export function AssessmentPreview({ questionnaire, lang, onAnswerChange }: Props) {
  const uiLang = useUILang();
  const [sectionIndex, setSectionIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerMap>(new Map());
  // sectionId → number of repetitions (default 1 — always show first instance)
  const [repetitionCounts, setRepetitionCounts] = useState<Map<string, number>>(new Map());
  // Live-scoring panel open/closed
  const [scoringOpen, setScoringOpen] = useState(false);

  // Flatten nested sections — only recomputed when section structure changes
  const allSections = useMemo(() => flattenSections(questionnaire.sections), [questionnaire.sections]);

  // Template lookup map — only recomputed when templates change
  const templateMap = useMemo(() => {
    const map = new Map<string, TextOption[]>();
    for (const t of questionnaire.responseTemplates?.templates ?? []) {
      map.set(t.code, t.options);
    }
    return map;
  }, [questionnaire.responseTemplates]);

  const sections = allSections.filter((s) => isVisible(s, answers));
  const total = sections.length;
  const idx = Math.min(sectionIndex, Math.max(0, total - 1));
  const currentSection = sections[idx];
  const progress = total > 0 ? ((idx + 1) / total) * 100 : 0;
  const name = questionnaire.name[lang] || questionnaire.code || 'Kartlegging';

  function handleAnswer(code: string, value: string | string[]) {
    setAnswers((prev) => {
      const next = new Map(prev);
      if (code) next.set(code, value);
      if (code) onAnswerChange?.(next);
      return next;
    });
  }

  function resolveOptions(q: Question): TextOption[] {
    const tCode = (q as any).responseTemplateCode as string | undefined;
    if (tCode) return templateMap.get(tCode) ?? [];
    return (q as any).options ?? [];
  }

  // Live scoring — recomputed whenever answers change
  const liveCalcResults = useMemo(() => {
    const calcs = questionnaire.calculations?.calculations ?? [];
    if (calcs.length === 0) return new Map<string, number | null>();
    const entryMap = buildAnswerEntryMap(answers, questionnaire);
    const out = new Map<string, number | null>();
    for (const calc of calcs) {
      out.set(calc.code, evaluateCalcLive(calc, entryMap));
    }
    return out;
  }, [answers, questionnaire]);

  return (
    <div
      style={{
        fontFamily: 'Calibri, "Segoe UI", Roboto, sans-serif',
        background: '#e8edf3',
        height: '100%',
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
        fontSize: 14,
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          background: CW_DARK,
          color: 'white',
          padding: '10px 16px',
          flexShrink: 0,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600 }}>{name}</div>
        {total > 0 && (
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>
            {tf('pageOf', uiLang, { page: idx + 1, total })}
          </div>
        )}
      </div>

      {/* ── Progress bar ── */}
      <div style={{ height: 4, background: '#b5c9d8', flexShrink: 0 }}>
        <div
          style={{
            height: '100%',
            width: `${progress}%`,
            background: CW_BLUE,
            transition: 'width 0.3s ease',
          }}
        />
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, padding: 16, overflow: 'auto' }}>
        {total === 0 ? (
          <div style={{ textAlign: 'center', color: '#aaa', marginTop: 60 }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📋</div>
            <p style={{ fontSize: 13 }}>{t('addSectionsHint', uiLang)}</p>
            <p style={{ fontSize: 11, marginTop: 4 }}>{t('previewEmptyHint', uiLang)}</p>
          </div>
        ) : (
          <div
            style={{
              background: 'white',
              borderRadius: 6,
              boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
              padding: '20px 24px',
            }}
          >
            {/* Section title */}
            {currentSection.titles[lang] && (
              <h2
                style={{ fontSize: 16, fontWeight: 700, color: CW_DARK, margin: '0 0 20px 0', paddingBottom: 10, borderBottom: `2px solid ${CW_BLUE}` }}
                dangerouslySetInnerHTML={{ __html: cwToHtml(currentSection.titles[lang]) }}
              />
            )}

            {/* Questions — with REPEATED section support */}
            {currentSection.questions.length === 0 ? (
              <p style={{ color: '#ccc', fontStyle: 'italic', textAlign: 'center', padding: '24px 0', fontSize: 13 }}>
                {t('noQuestionsInSection', uiLang)}
              </p>
            ) : currentSection.type === 'REPEATED' ? (
              (() => {
                const repCount = repetitionCounts.get(currentSection.id) ?? 1;
                const reps = Array.from({ length: repCount }, (_, ri) => ri);
                return (
                  <div>
                    {reps.map((ri) => {
                      // For repetition ri, answer keys are suffixed _<ri+1> (first rep has no suffix)
                      const suffix = ri === 0 ? '' : `_${ri + 1}`;
                      // Build a proxy AnswerMap with suffixed keys mapped back to base keys for isVisible
                      const proxiedAnswers: AnswerMap = new Map(
                        Array.from(answers.entries()).map(([k, v]) => {
                          // Strip suffix from existing keys to check visibility of base question
                          return [k, v];
                        }),
                      );
                      let qNum = 0;
                      return (
                        <div key={ri}>
                          {ri > 0 && (
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                margin: '18px 0 12px',
                              }}
                            >
                              <div style={{ flex: 1, height: 1, background: CW_BORDER }} />
                              <span style={{ fontSize: 12, color: '#888', fontStyle: 'italic' }}>
                                {tf('repetition', uiLang, { n: ri + 1 })}
                              </span>
                              <div style={{ flex: 1, height: 1, background: CW_BORDER }} />
                              <button
                                type="button"
                                onClick={() => {
                                  // Remove answers for this repetition and shift later reps
                                  setAnswers((prev) => {
                                    const next = new Map(prev);
                                    const total = repetitionCounts.get(currentSection.id) ?? 1;
                                    // Shift answers for reps after ri down by one
                                    for (const q of currentSection.questions) {
                                      if (!q.code) continue;
                                      for (let k = ri; k < total - 1; k++) {
                                        const fromKey = k + 1 === 1 ? q.code : `${q.code}_${k + 1}`;
                                        const toKey = k === 0 ? q.code : `${q.code}_${k}`;
                                        const val = next.get(fromKey);
                                        if (val !== undefined) { next.set(toKey, val); } else { next.delete(toKey); }
                                      }
                                      const lastKey = total - 1 === 0 ? q.code : `${q.code}_${total - 1}`;
                                      next.delete(lastKey);
                                    }
                                    return next;
                                  });
                                  setRepetitionCounts((prev) => {
                                    const next = new Map(prev);
                                    next.set(currentSection.id, Math.max(1, (prev.get(currentSection.id) ?? 1) - 1));
                                    return next;
                                  });
                                }}
                                style={{
                                  fontSize: 11,
                                  color: '#e74c3c',
                                  background: 'white',
                                  border: `1px solid #e74c3c`,
                                  borderRadius: 3,
                                  padding: '2px 8px',
                                  cursor: 'pointer',
                                }}
                              >
                                × {t('remove', uiLang)}
                              </button>
                            </div>
                          )}
                          {currentSection.questions
                            .filter((q) => isVisible(q, proxiedAnswers))
                            .map((q) => {
                              if (q.type !== 'text') qNum++;
                              const answerKey = ri === 0 ? q.code : `${q.code}${suffix}`;
                              // Proxy question with modified code so answers go to suffixed key
                              const proxiedQ = ri === 0 ? q : { ...q, code: answerKey };
                              return (
                                <QuestionPreview
                                  key={`${q.id}_${ri}`}
                                  question={proxiedQ as Question}
                                  lang={lang}
                                  index={qNum}
                                  resolvedOptions={resolveOptions(q)}
                                  answers={answers}
                                  onAnswer={handleAnswer}
                                />
                              );
                            })}
                        </div>
                      );
                    })}
                    {/* Add repetition button */}
                    <button
                      type="button"
                      onClick={() =>
                        setRepetitionCounts((prev) => {
                          const next = new Map(prev);
                          next.set(currentSection.id, (prev.get(currentSection.id) ?? 1) + 1);
                          return next;
                        })
                      }
                      style={{
                        marginTop: 14,
                        padding: '7px 14px',
                        background: 'white',
                        border: `1px dashed ${CW_BLUE}`,
                        borderRadius: 4,
                        color: CW_BLUE,
                        fontSize: 13,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      + {t('addRepetition', uiLang)}
                    </button>
                  </div>
                );
              })()
            ) : (
              (() => {
                let qNum = 0;
                return currentSection.questions
                  .filter((q) => isVisible(q, answers))
                  .map((q) => {
                    if (q.type !== 'text') qNum++;
                    return (
                      <QuestionPreview
                        key={q.id}
                        question={q}
                        lang={lang}
                        index={qNum}
                        resolvedOptions={resolveOptions(q)}
                        answers={answers}
                        onAnswer={handleAnswer}
                      />
                    );
                  });
              })()
            )}

            {/* Live scoring panel */}
            {(questionnaire.calculations?.calculations?.length ?? 0) > 0 && (
              <div
                style={{
                  marginTop: 18,
                  borderTop: `1px solid ${CW_BORDER}`,
                  paddingTop: 12,
                }}
              >
                <button
                  type="button"
                  onClick={() => setScoringOpen((v) => !v)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 12,
                    color: '#666',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: 0,
                    fontFamily: 'inherit',
                  }}
                >
                  <span style={{ fontSize: 10, display: 'inline-block', transform: scoringOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
                    ▸
                  </span>
                  {t('showCalculations', uiLang)}
                </button>
                {scoringOpen && (
                  <div
                    style={{
                      marginTop: 10,
                      border: `1px solid ${CW_BORDER}`,
                      borderRadius: 4,
                      overflow: 'hidden',
                      fontSize: 12,
                    }}
                  >
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#f4f7fa', borderBottom: `1px solid ${CW_BORDER}` }}>
                          <th style={{ padding: '5px 10px', textAlign: 'left', fontWeight: 600, color: '#555', fontSize: 11 }}>{t('name', uiLang)}</th>
                          <th style={{ padding: '5px 10px', textAlign: 'left', fontWeight: 600, color: '#555', fontSize: 11 }}>{t('code', uiLang)}</th>
                          <th style={{ padding: '5px 10px', textAlign: 'right', fontWeight: 600, color: '#555', fontSize: 11 }}>{t('result', uiLang)}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(questionnaire.calculations?.calculations ?? []).map((calc, ci) => {
                          const result = liveCalcResults.get(calc.code);
                          const isCustom = calc.type === 'CUSTOM';
                          return (
                            <tr
                              key={calc.code}
                              style={{
                                borderBottom: ci < (questionnaire.calculations!.calculations.length - 1) ? `1px solid ${CW_BORDER}` : 'none',
                                background: ci % 2 === 0 ? 'white' : '#fafbfc',
                              }}
                            >
                              <td style={{ padding: '5px 10px', color: '#333' }}>{calc.name || calc.code}</td>
                              <td style={{ padding: '5px 10px', fontFamily: 'monospace', color: CW_BLUE, fontSize: 11 }}>{calc.code}</td>
                              <td style={{ padding: '5px 10px', textAlign: 'right', fontWeight: 700, color: '#222', fontFamily: 'monospace' }}>
                                {isCustom ? (
                                  <span style={{ color: '#aaa', fontWeight: 400, fontFamily: 'inherit', fontStyle: 'italic' }}>—</span>
                                ) : result !== null && result !== undefined ? (
                                  Number.isInteger(result) ? result : result.toFixed(3)
                                ) : (
                                  <span style={{ color: '#ccc' }}>—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Navigation footer ── */}
      {total > 0 && (
        <div
          style={{
            flexShrink: 0,
            background: 'white',
            borderTop: `1px solid ${CW_BORDER}`,
            padding: '10px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <button
            onClick={() => { setSectionIndex((i) => Math.max(0, i - 1)); }}
            disabled={idx === 0}
            style={{
              padding: '7px 16px',
              background: idx === 0 ? '#f5f5f5' : 'white',
              border: `1px solid ${idx === 0 ? '#ddd' : '#aaa'}`,
              borderRadius: 4,
              cursor: idx === 0 ? 'default' : 'pointer',
              fontSize: 13,
              color: idx === 0 ? '#ccc' : '#444',
            }}
          >
            ← {t('previous', uiLang)}
          </button>

          {/* Page indicator: dots for few pages, numeric counter for many */}
          {total <= 12 ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {sections.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setSectionIndex(i)}
                  title={sections[i].titles[lang] || tf('pageTitle', uiLang, { n: i + 1 })}
                  style={{
                    width: i === idx ? 10 : 8,
                    height: i === idx ? 10 : 8,
                    borderRadius: '50%',
                    background: i === idx ? CW_BLUE : '#ccc',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    flexShrink: 0,
                    transition: 'background 0.2s, width 0.2s, height 0.2s',
                  }}
                />
              ))}
            </div>
          ) : (
            <span style={{ fontSize: 13, color: '#666', fontVariantNumeric: 'tabular-nums' }}>
              {idx + 1} / {total}
            </span>
          )}

          <button
            onClick={() => setSectionIndex((i) => Math.min(total - 1, i + 1))}
            disabled={idx === total - 1 || !canContinue(currentSection, answers)}
            title={!canContinue(currentSection, answers) ? t('cannotContinue', uiLang) : undefined}
            style={{
              padding: '7px 16px',
              background: (idx === total - 1 || !canContinue(currentSection, answers)) ? '#f5f5f5' : CW_BLUE,
              border: 'none',
              borderRadius: 4,
              cursor: (idx === total - 1 || !canContinue(currentSection, answers)) ? 'default' : 'pointer',
              fontSize: 13,
              fontWeight: 600,
              color: (idx === total - 1 || !canContinue(currentSection, answers)) ? '#ccc' : 'white',
            }}
          >
            {t('next', uiLang)} →
          </button>
        </div>
      )}
    </div>
  );
}
