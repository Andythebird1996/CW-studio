import { useState, useMemo } from 'react';
import { Play, ChevronDown, ChevronRight } from 'lucide-react';
import type {
  Questionnaire,
  Question,
  Section,
  TextOption,
  Calculation,
  Flag,
  FlagCondition,
} from '../../types/questionnaire';
import { useUILang } from '../../i18n';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScoringDebuggerProps {
  questionnaire: Questionnaire;
}

/** Resolved answer entry: raw string value + resolved numeric score */
interface AnswerEntry {
  value: string;   // option code or raw number/text
  score: number;
}

type AnswerState = Map<string, string>;  // questionCode → raw string (option code or number)

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Recursively collect all questions (with a code) from sections and subSections */
function collectQuestions(sections: Section[]): Question[] {
  const result: Question[] = [];
  const queue = [...sections];
  while (queue.length > 0) {
    const sec = queue.shift()!;
    for (const q of sec.questions) {
      if (q.code) result.push(q);
    }
    if (sec.subSections) queue.push(...sec.subSections);
  }
  return result;
}

/** Build option list for a question, falling back to responseTemplate */
function resolveOptions(q: Question, questionnaire: Questionnaire): TextOption[] {
  const tCode = (q as any).responseTemplateCode as string | undefined;
  if (tCode) {
    return questionnaire.responseTemplates?.templates.find((t) => t.code === tCode)?.options ?? [];
  }
  return (q as any).options ?? [];
}

/** Resolve an AnswerState into a map of { score, value } per question code */
function buildAnswerMap(
  answers: AnswerState,
  questions: Question[],
  questionnaire: Questionnaire,
): Map<string, AnswerEntry> {
  const map = new Map<string, AnswerEntry>();
  for (const q of questions) {
    const raw = answers.get(q.code);
    if (raw === undefined || raw === '') continue;

    if (q.type === 'radiobutton' || q.type === 'checkbox' || q.type === 'combobox') {
      const opts = resolveOptions(q, questionnaire);
      const opt = opts.find((o) => o.code === raw);
      if (opt) {
        map.set(q.code, { value: raw, score: opt.score ?? 0 });
      }
    } else {
      const num = parseFloat(raw);
      map.set(q.code, { value: raw, score: isNaN(num) ? 0 : num });
    }
  }
  return map;
}

/** Evaluate a single calculation given an answer map.
 *  allCalcs and cache are used to resolve calculationCode references recursively. */
function evaluateCalc(
  calc: Calculation,
  answerMap: Map<string, AnswerEntry>,
  allCalcs: Calculation[],
  cache: Map<string, number | null> = new Map(),
): number | null {
  if (calc.type === 'CUSTOM') return null;

  // Avoid infinite recursion for circular references
  if (cache.has(calc.code)) return cache.get(calc.code)!;
  // Mark as in-progress with null to break cycles
  cache.set(calc.code, null);

  const scores = calc.innerCalculations
    .map((ic) => {
      const m = ic.multiplier ?? 1;
      if (ic.constantValue !== undefined) {
        return ic.constantValue * m;
      }
      if (ic.calculationCode) {
        const refCalc = allCalcs.find((c) => c.code === ic.calculationCode);
        if (!refCalc) return NaN;
        const refResult = evaluateCalc(refCalc, answerMap, allCalcs, cache);
        if (refResult == null) return NaN;
        return refResult * m;
      }
      if (ic.questionCode) {
        const entry = answerMap.get(ic.questionCode);
        if (entry == null) return NaN;
        return entry.score * m;
      }
      return NaN;
    })
    .filter((s) => !isNaN(s));

  let result: number | null;
  switch (calc.type) {
    case 'SUM':   result = scores.reduce((a, b) => a + b, 0); break;
    case 'MEAN':  result = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0; break;
    case 'COUNT': result = scores.length; break;
    default:      result = null;
  }

  cache.set(calc.code, result);
  return result;
}

/** Compare two numbers using the FlagCondition operator */
function compareNums(a: number, op: FlagCondition['operator'], b: number): boolean {
  switch (op) {
    case 'EQ':  return a === b;
    case 'NEQ': return a !== b;
    case 'LT':  return a < b;
    case 'LTE': return a <= b;
    case 'GT':  return a > b;
    case 'GTE': return a >= b;
    default:    return false;
  }
}

/** Evaluate a flag given already-computed calculation results */
function evaluateFlag(
  flag: Flag,
  calcResults: Map<string, number | null>,
): boolean {
  if (flag.conditions.length === 0) return false;
  const results = flag.conditions.map((fc) => {
    const val = calcResults.get(fc.calculationCode);
    if (val == null) return false;
    return compareNums(val, fc.operator, fc.threshold);
  });
  return flag.logic === 'AND' ? results.every(Boolean) : results.some(Boolean);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function QuestionRow({
  question,
  questionnaire,
  value,
  onChange,
  lang,
}: {
  question: Question;
  questionnaire: Questionnaire;
  value: string;
  onChange: (code: string, v: string) => void;
  lang: ReturnType<typeof useUILang>;
}) {
  const text = question.texts[questionnaire.defaultLanguage] || question.code;
  const isText = question.type === 'text';
  if (isText) return null;

  const opts = resolveOptions(question, questionnaire);

  return (
    <tr className="border-b border-cw-border last:border-0 hover:bg-cw-gray/50">
      <td className="py-2 px-3">
        <span className="font-mono text-xs font-semibold text-cw-blue">{question.code}</span>
      </td>
      <td className="py-2 px-3 text-xs text-gray-600 max-w-[260px] truncate" title={text}>
        {text}
      </td>
      <td className="py-2 px-3">
        {(question.type === 'radiobutton' || question.type === 'checkbox' || question.type === 'combobox') ? (
          <select
            value={value}
            onChange={(e) => onChange(question.code, e.target.value)}
            className="w-full border border-cw-border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-cw-blue-light bg-white"
          >
            <option value="">— {lang === 'NO' ? 'Velg' : 'Select'} —</option>
            {opts.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.texts[questionnaire.defaultLanguage] || opt.code}
                {opt.score !== undefined ? ` (${opt.score})` : ''}
              </option>
            ))}
          </select>
        ) : question.type === 'numericInput' || question.type === 'slider' ? (
          <input
            type="number"
            value={value}
            min={(question as any).min}
            max={(question as any).max}
            onChange={(e) => onChange(question.code, e.target.value)}
            className="w-28 border border-cw-border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
            placeholder="0"
          />
        ) : question.type === 'stringInput' ? (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(question.code, e.target.value)}
            className="w-40 border border-cw-border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
            placeholder={lang === 'NO' ? 'Tekst...' : 'Text...'}
          />
        ) : question.type === 'dateInput' ? (
          <input
            type={question.includeTime ? 'datetime-local' : 'date'}
            value={value}
            onChange={(e) => onChange(question.code, e.target.value)}
            className="border border-cw-border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
          />
        ) : (
          <span className="text-xs text-gray-400 italic">
            {lang === 'NO' ? '(Ikke støttet)' : '(Not supported)'}
          </span>
        )}
      </td>
    </tr>
  );
}

function SectionGroup({
  section,
  questionnaire,
  answers,
  onAnswerChange,
  lang,
}: {
  section: Section;
  questionnaire: Questionnaire;
  answers: AnswerState;
  onAnswerChange: (code: string, v: string) => void;
  lang: ReturnType<typeof useUILang>;
}) {
  const [open, setOpen] = useState(true);
  const title = section.titles[questionnaire.defaultLanguage] || section.code || (lang === 'NO' ? 'Seksjon' : 'Section');
  const questions = section.questions.filter((q) => q.type !== 'text' && q.code);

  const subGroups = section.subSections ?? [];

  return (
    <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="flex items-center gap-2 px-3 py-2 bg-cw-gray border-b border-cw-border cursor-pointer select-none hover:bg-blue-50/40 list-none">
        {open
          ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          : <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        }
        <span className="text-xs font-semibold text-cw-blue">{title}</span>
        {section.code && (
          <span className="text-[10px] font-mono text-gray-400">[{section.code}]</span>
        )}
        <span className="text-[10px] text-gray-400 ml-auto">
          {questions.length} {lang === 'NO' ? 'spørsmål' : 'questions'}
        </span>
      </summary>

      {questions.length > 0 && (
        <table className="w-full text-left border-collapse">
          <colgroup>
            <col className="w-[110px]" />
            <col />
            <col className="w-[220px]" />
          </colgroup>
          <tbody>
            {questions.map((q) => (
              <QuestionRow
                key={q.id}
                question={q}
                questionnaire={questionnaire}
                value={answers.get(q.code) ?? ''}
                onChange={onAnswerChange}
                lang={lang}
              />
            ))}
          </tbody>
        </table>
      )}

      {subGroups.map((sub) => (
        <div key={sub.id} className="ml-4 border-l-2 border-cw-border">
          <SectionGroup
            section={sub}
            questionnaire={questionnaire}
            answers={answers}
            onAnswerChange={onAnswerChange}
            lang={lang}
          />
        </div>
      ))}
    </details>
  );
}

// ─── Results panel ────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<Calculation['type'], string> = {
  SUM:    'bg-blue-50 text-blue-700 border-blue-200',
  MEAN:   'bg-purple-50 text-purple-700 border-purple-200',
  COUNT:  'bg-green-50 text-green-700 border-green-200',
  CUSTOM: 'bg-amber-50 text-amber-700 border-amber-200',
};

const FLAG_TYPE_COLORS: Record<string, string> = {
  INFO:     'bg-blue-50 text-blue-700 border-blue-200',
  WARNING:  'bg-amber-50 text-amber-700 border-amber-200',
  CRITICAL: 'bg-red-50 text-red-700 border-red-200',
};

const OP_LABELS: Record<string, string> = {
  EQ: '=', NEQ: '≠', LT: '<', LTE: '≤', GT: '>', GTE: '≥',
};

interface ResultsProps {
  calcResults: Map<string, number | null>;
  flagResults: Map<string, boolean>;
  questionnaire: Questionnaire;
  lang: ReturnType<typeof useUILang>;
}

function ResultsPanel({ calcResults, flagResults, questionnaire, lang }: ResultsProps) {
  const calcs = questionnaire.calculations?.calculations ?? [];
  const flags = questionnaire.flags ?? [];

  return (
    <div className="space-y-6 p-4">
      {/* Calculations table */}
      <section>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          {lang === 'NO' ? 'Beregninger' : 'Calculations'}
        </h3>
        {calcs.length === 0 ? (
          <p className="text-xs text-gray-400 italic">
            {lang === 'NO' ? 'Ingen beregninger definert.' : 'No calculations defined.'}
          </p>
        ) : (
          <div className="border border-cw-border rounded-lg overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-cw-gray border-b border-cw-border">
                  <th className="px-3 py-2 font-semibold text-gray-500">
                    {lang === 'NO' ? 'Kode' : 'Code'}
                  </th>
                  <th className="px-3 py-2 font-semibold text-gray-500">
                    {lang === 'NO' ? 'Navn' : 'Name'}
                  </th>
                  <th className="px-3 py-2 font-semibold text-gray-500">
                    {lang === 'NO' ? 'Type' : 'Type'}
                  </th>
                  <th className="px-3 py-2 font-semibold text-gray-500 text-right">
                    {lang === 'NO' ? 'Resultat' : 'Result'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {calcs.map((calc) => {
                  const result = calcResults.get(calc.code);
                  const isCustom = calc.type === 'CUSTOM';
                  return (
                    <tr key={calc.code} className="border-b border-cw-border last:border-0 hover:bg-cw-gray/40">
                      <td className="px-3 py-2 font-mono font-semibold text-cw-blue">{calc.code}</td>
                      <td className="px-3 py-2 text-gray-600 max-w-[200px] truncate" title={calc.name}>
                        {calc.name}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`text-[10px] font-medium border rounded px-1.5 py-0.5 ${TYPE_COLORS[calc.type]}`}>
                          {calc.type}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {isCustom ? (
                          <span className="text-gray-400 italic text-[10px]">
                            {lang === 'NO' ? 'Ikke evaluerbar' : 'Not evaluable'}
                          </span>
                        ) : result !== null && result !== undefined ? (
                          <span className="font-mono font-bold text-gray-800">
                            {Number.isInteger(result) ? result : result.toFixed(4)}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Flags table */}
      <section>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          {lang === 'NO' ? 'Flagg' : 'Flags'}
        </h3>
        {flags.length === 0 ? (
          <p className="text-xs text-gray-400 italic">
            {lang === 'NO' ? 'Ingen flagg definert.' : 'No flags defined.'}
          </p>
        ) : (
          <div className="border border-cw-border rounded-lg overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-cw-gray border-b border-cw-border">
                  <th className="px-3 py-2 font-semibold text-gray-500">
                    {lang === 'NO' ? 'Kode' : 'Code'}
                  </th>
                  <th className="px-3 py-2 font-semibold text-gray-500">
                    {lang === 'NO' ? 'Navn' : 'Name'}
                  </th>
                  <th className="px-3 py-2 font-semibold text-gray-500">
                    {lang === 'NO' ? 'Type' : 'Type'}
                  </th>
                  <th className="px-3 py-2 font-semibold text-gray-500">
                    {lang === 'NO' ? 'Betingelse(r)' : 'Condition(s)'}
                  </th>
                  <th className="px-3 py-2 font-semibold text-gray-500 text-center">
                    {lang === 'NO' ? 'Resultat' : 'Result'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {flags.map((flag) => {
                  const active = flagResults.get(flag.code) ?? false;
                  return (
                    <tr
                      key={flag.code}
                      className={`border-b border-cw-border last:border-0 ${
                        active ? 'bg-green-50' : 'bg-red-50/30'
                      }`}
                    >
                      <td className="px-3 py-2 font-mono font-semibold text-cw-blue">{flag.code}</td>
                      <td className="px-3 py-2 text-gray-600 max-w-[160px] truncate" title={flag.name}>
                        {flag.name}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`text-[10px] font-medium border rounded px-1.5 py-0.5 ${FLAG_TYPE_COLORS[flag.type] ?? ''}`}>
                          {flag.type}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="space-y-0.5">
                          {flag.conditions.map((fc, i) => (
                            <div key={i} className="text-[10px] font-mono text-gray-500">
                              CALC({fc.calculationCode})
                              {' '}<span className="text-gray-800 font-semibold">{OP_LABELS[fc.operator] ?? fc.operator}</span>
                              {' '}{fc.threshold}
                              {i < flag.conditions.length - 1 && (
                                <span className="ml-1 text-blue-500 font-medium">{flag.logic}</span>
                              )}
                            </div>
                          ))}
                          {flag.conditions.length === 0 && (
                            <span className="text-gray-300 text-[10px]">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span
                          className={`inline-block text-xs font-bold px-2 py-0.5 rounded ${
                            active
                              ? 'bg-green-500 text-white'
                              : 'bg-red-400/80 text-white'
                          }`}
                        >
                          {active ? (lang === 'NO' ? 'SANN' : 'TRUE') : (lang === 'NO' ? 'USANN' : 'FALSE')}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Norm lookups (if any calculations reference norms) */}
      {questionnaire.calculations?.norms && questionnaire.calculations.norms.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            {lang === 'NO' ? 'Normoppslag' : 'Norm lookups'}
          </h3>
          <div className="border border-cw-border rounded-lg overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-cw-gray border-b border-cw-border">
                  <th className="px-3 py-2 font-semibold text-gray-500">
                    {lang === 'NO' ? 'Kode' : 'Code'}
                  </th>
                  <th className="px-3 py-2 font-semibold text-gray-500">
                    {lang === 'NO' ? 'Navn' : 'Name'}
                  </th>
                  <th className="px-3 py-2 font-semibold text-gray-500">
                    {lang === 'NO' ? 'Referert av' : 'Referenced by'}
                  </th>
                  <th className="px-3 py-2 font-semibold text-gray-500 text-right">
                    {lang === 'NO' ? 'Inngangsverdi' : 'Input value'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {questionnaire.calculations.norms.map((norm) => {
                  const referencingCalc = questionnaire.calculations?.calculations.find(
                    (c) => c.normCode === norm.code,
                  );
                  const inputVal = referencingCalc
                    ? calcResults.get(referencingCalc.code)
                    : undefined;
                  return (
                    <tr key={norm.code} className="border-b border-cw-border last:border-0 hover:bg-cw-gray/40">
                      <td className="px-3 py-2 font-mono font-semibold text-cw-blue">{norm.code}</td>
                      <td className="px-3 py-2 text-gray-600">{norm.name}</td>
                      <td className="px-3 py-2 font-mono text-xs text-gray-500">
                        {referencingCalc ? referencingCalc.code : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-gray-800">
                        {inputVal !== undefined && inputVal !== null
                          ? (Number.isInteger(inputVal) ? inputVal : inputVal.toFixed(2))
                          : <span className="text-gray-300">—</span>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ScoringDebugger({ questionnaire }: ScoringDebuggerProps) {
  const lang = useUILang();
  const [answers, setAnswers] = useState<AnswerState>(new Map());
  const [hasRun, setHasRun] = useState(false);

  /** All questions with a code (text elements excluded) */
  const allQuestions = useMemo(
    () => collectQuestions(questionnaire.sections).filter((q) => q.type !== 'text'),
    [questionnaire.sections],
  );

  const calcs = questionnaire.calculations?.calculations ?? [];
  const flags = questionnaire.flags ?? [];

  function handleAnswerChange(code: string, value: string) {
    setAnswers((prev) => {
      const next = new Map(prev);
      if (value === '') {
        next.delete(code);
      } else {
        next.set(code, value);
      }
      return next;
    });
    // Reset results so user must click Beregn again after changing answers
    setHasRun(false);
  }

  function handleReset() {
    setAnswers(new Map());
    setHasRun(false);
  }

  /** Computed results (memoized but only "shown" when hasRun is true) */
  const { calcResults, flagResults } = useMemo(() => {
    const answerMap = buildAnswerMap(answers, allQuestions, questionnaire);

    const calcResults = new Map<string, number | null>();
    const evalCache = new Map<string, number | null>();
    for (const calc of calcs) {
      calcResults.set(calc.code, evaluateCalc(calc, answerMap, calcs, evalCache));
    }

    const flagResults = new Map<string, boolean>();
    for (const flag of flags) {
      flagResults.set(flag.code, evaluateFlag(flag, calcResults));
    }

    return { calcResults, flagResults };
  }, [answers, allQuestions, questionnaire, calcs, flags]);

  const answeredCount = answers.size;
  const totalCount = allQuestions.length;

  return (
    <div className="flex flex-col h-full overflow-hidden min-w-0 min-h-0">
      {/* Header bar */}
      <div className="bg-white border-b border-cw-border px-4 py-3 shrink-0 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-cw-blue">
            {lang === 'NO' ? 'Skårings-debugger' : 'Scoring debugger'}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {answeredCount} / {totalCount}{' '}
            {lang === 'NO' ? 'spørsmål besvart' : 'questions answered'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="px-3 py-1.5 text-xs border border-cw-border rounded text-gray-500 hover:bg-cw-gray transition-colors"
          >
            {lang === 'NO' ? 'Nullstill' : 'Reset'}
          </button>
          <button
            onClick={() => setHasRun(true)}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-cw-blue text-white rounded hover:bg-cw-blue-light transition-colors font-semibold"
          >
            <Play className="w-3.5 h-3.5" />
            {lang === 'NO' ? 'Beregn' : 'Evaluate'}
          </button>
        </div>
      </div>

      {/* Body: split — left inputs, right results */}
      <div className="flex flex-col md:flex-row flex-1 overflow-hidden min-h-0 min-w-0">

        {/* Left: question inputs. Full width on phones, at most half the pane on larger screens. */}
        <div className="w-full max-h-[42vh] md:max-h-none md:w-[480px] md:max-w-[50%] shrink-0 border-b md:border-b-0 md:border-r border-cw-border overflow-auto bg-white min-h-0">
          {allQuestions.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
              {lang === 'NO'
                ? 'Ingen spørsmål med kode funnet.'
                : 'No questions with a code found.'}
            </div>
          ) : (
            questionnaire.sections.map((section) => (
              <SectionGroup
                key={section.id}
                section={section}
                questionnaire={questionnaire}
                answers={answers}
                onAnswerChange={handleAnswerChange}
                lang={lang}
              />
            ))
          )}
        </div>

        {/* Right: results */}
        <div className="flex-1 overflow-auto bg-cw-gray/30 min-w-0 min-h-0">
          {!hasRun ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 select-none gap-3">
              <Play className="w-10 h-10 opacity-30" />
              <p className="text-sm">
                {lang === 'NO'
                  ? 'Sett inn testverdier og klikk «Beregn»'
                  : 'Enter test values and click «Evaluate»'}
              </p>
              {calcs.length === 0 && flags.length === 0 && (
                <p className="text-xs text-gray-300">
                  {lang === 'NO'
                    ? '(Ingen beregninger eller flagg definert ennå)'
                    : '(No calculations or flags defined yet)'}
                </p>
              )}
            </div>
          ) : (
            <ResultsPanel
              calcResults={calcResults}
              flagResults={flagResults}
              questionnaire={questionnaire}
              lang={lang}
            />
          )}
        </div>
      </div>
    </div>
  );
}
