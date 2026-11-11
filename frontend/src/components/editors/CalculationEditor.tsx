import { useState, useMemo, useEffect } from 'react';
import { ChevronDown, ChevronRight, Copy, FileInput, Pencil, PlusCircle, Trash2, X } from 'lucide-react';
import type { Questionnaire, Calculation, Calculations, InnerCalculation, Norm } from '../../types/questionnaire';
import { t, useUILang } from '../../i18n';
import { ImportCalculationsDialog } from '../dialogs/ImportCalculationsDialog';
import { ItemContextMenu } from './ItemContextMenu';

interface Props {
  questionnaire: Questionnaire;
  onChange: (q: Questionnaire) => void;
}

const TYPE_COLORS: Record<Calculation['type'], string> = {
  SUM: 'bg-blue-50 text-blue-700 border-blue-200',
  MEAN: 'bg-purple-50 text-purple-700 border-purple-200',
  COUNT: 'bg-green-50 text-green-700 border-green-200',
  CUSTOM: 'bg-amber-50 text-amber-700 border-amber-200',
};

function getCalcTypeLabel(type: Calculation['type'], lang: ReturnType<typeof useUILang>): string {
  if (type === 'MEAN')   return t('calcTypeMean', lang);
  if (type === 'COUNT')  return t('calcTypeCount', lang);
  if (type === 'CUSTOM') return t('calcTypeCustom', lang);
  return 'Sum';
}

function newCalculation(): Calculation {
  return { code: '', name: '', type: 'SUM', innerCalculations: [] };
}

function newInner(): InnerCalculation {
  return { id: crypto.randomUUID(), questionCode: '', multiplier: 1 };
}

// ─── Imported (read-only) calc card ──────────────────────────────────────

function ImportedCalcCard({
  calc,
  onDelete,
  onEdit,
}: {
  calc: Calculation;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const uiLang = useUILang();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-cw-border rounded-lg bg-white mb-2 overflow-hidden">
      {/* Header row */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-cw-gray select-none"
        onClick={() => setExpanded((e) => !e)}
      >
        {expanded
          ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          : <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        }
        <span className="font-mono text-sm font-semibold text-cw-blue">{calc.code}</span>
        <span className={`text-[10px] font-medium border rounded px-1.5 py-0.5 ${TYPE_COLORS[calc.type]}`}>
          {getCalcTypeLabel(calc.type, uiLang)}
        </span>
        <span className="flex-1 text-xs text-gray-500 truncate">{calc.name}</span>
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="p-1 text-gray-300 hover:text-cw-blue transition-colors"
          title={t('editCalc', uiLang)}
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="text-gray-300 hover:text-red-500 p-1"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Formula */}
      {expanded && calc.formula && (
        <div className="border-t border-cw-border px-3 py-2 bg-gray-50">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{t('importedFormula', uiLang)}</p>
          <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap leading-relaxed">
            {calc.formula}
          </pre>
          <button
            onClick={onEdit}
            className="mt-2 flex items-center gap-1 text-xs text-cw-blue-light hover:underline"
          >
            <Pencil className="w-3 h-3" /> {t('editCalc', uiLang)}
          </button>
        </div>
      )}
      {expanded && !calc.formula && (
        <div className="border-t border-cw-border px-3 py-2 bg-gray-50">
          <p className="text-xs text-gray-400 italic">{t('noFormula', uiLang)}</p>
        </div>
      )}
    </div>
  );
}

/** Build a human-readable formula string from innerCalculations */
function buildFormulaPreview(calc: Calculation): string {
  const parts = calc.innerCalculations.map((ic) => {
    const m = ic.multiplier ?? 1;
    let base: string;
    if (ic.constantValue !== undefined) {
      base = String(ic.constantValue);
    } else if (ic.calculationCode) {
      base = `CALC(${ic.calculationCode})`;
    } else {
      base = ic.questionCode ?? '';
    }
    return m === 1 ? base : `${base} × ${m}`;
  });
  if (parts.length === 0) return '(–)';
  if (calc.type === 'SUM')   return parts.join(' + ');
  if (calc.type === 'MEAN')  return `(${parts.join(' + ')}) / ${parts.length}`;
  if (calc.type === 'COUNT') return `count(${parts.join(', ')})`;
  return parts.join(', ');
}

// ─── Editable calc card (manually created) ───────────────────────────────

function EditableCalcCard({
  calc,
  questions,
  calcCodes,
  validQuestionCodes,
  validCalcCodes,
  norms,
  onChange,
  onDelete,
  onClose,
}: {
  calc: Calculation;
  questions: string[];
  calcCodes: string[];
  validQuestionCodes: Set<string>;
  validCalcCodes: Set<string>;
  norms: Norm[];
  onChange: (c: Calculation) => void;
  onDelete: () => void;
  onClose?: () => void;
}) {
  const uiLang = useUILang();
  const [expanded, setExpanded] = useState(true);
  const [showRemote, setShowRemote] = useState(!!calc.remoteScoring);

  const calcTypes: Array<{ value: Calculation['type']; label: string }> = [
    { value: 'SUM',    label: 'Sum' },
    { value: 'MEAN',   label: t('calcTypeMean', uiLang) },
    { value: 'COUNT',  label: t('calcTypeCount', uiLang) },
    { value: 'CUSTOM', label: t('calcTypeCustom', uiLang) },
  ];

  function updateInner(i: number, ic: InnerCalculation) {
    onChange({ ...calc, innerCalculations: calc.innerCalculations.map((x, idx) => idx === i ? ic : x), _rawExpression: undefined });
  }
  function deleteInner(i: number) {
    onChange({ ...calc, innerCalculations: calc.innerCalculations.filter((_, idx) => idx !== i), _rawExpression: undefined });
  }
  function addInner() {
    onChange({ ...calc, innerCalculations: [...calc.innerCalculations, newInner()], _rawExpression: undefined });
  }

  const formulaPreview = calc.type !== 'CUSTOM' ? buildFormulaPreview(calc) : null;

  return (
    <div className="border border-cw-border rounded-lg bg-white mb-2 overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-cw-gray select-none"
        onClick={() => setExpanded((e) => !e)}
      >
        {expanded
          ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          : <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        }
        <span className="font-mono text-sm font-semibold text-cw-blue">
          {calc.code || <span className="text-gray-400 font-normal italic">{t('newCalcPH', uiLang)}</span>}
        </span>
        <span className={`text-[10px] font-medium border rounded px-1.5 py-0.5 ${TYPE_COLORS[calc.type]}`}>
          {getCalcTypeLabel(calc.type, uiLang)}
        </span>
        <span className="flex-1 text-xs text-gray-500 truncate">{calc.name}</span>
        {calc.normCode && (
          <span className="text-[10px] font-mono bg-violet-50 text-violet-700 border border-violet-200 rounded px-1.5 py-0.5">
            norm:{calc.normCode}
          </span>
        )}
        {onClose && (
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="p-1 text-gray-300 hover:text-gray-600 transition-colors"
            title={t('closeEdit', uiLang)}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="text-gray-300 hover:text-red-500 p-1"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Body */}
      {expanded && (
        <div className="border-t border-cw-border px-3 py-3 space-y-3">
          {/* Basic fields */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t('code', uiLang)}</label>
              <input
                type="text"
                value={calc.code}
                onChange={(e) => onChange({ ...calc, code: e.target.value })}
                className="w-full border border-cw-border rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
                placeholder="TOTAL"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t('name', uiLang)}</label>
              <input
                type="text"
                value={calc.name}
                onChange={(e) => onChange({ ...calc, name: e.target.value })}
                className="w-full border border-cw-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
                placeholder={uiLang === 'NO' ? 'Totalskår' : 'Total score'}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t('typeLabel', uiLang)}</label>
              <select
                value={calc.type}
                onChange={(e) => onChange({ ...calc, type: e.target.value as Calculation['type'], _rawExpression: undefined })}
                className="w-full border border-cw-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
              >
                {calcTypes.map((ct) => (
                  <option key={ct.value} value={ct.value}>{ct.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Norm reference */}
          {norms.length > 0 && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t('linkedNorm', uiLang)}</label>
              <select
                value={calc.normCode ?? ''}
                onChange={(e) => onChange({ ...calc, normCode: e.target.value || undefined })}
                className="w-full border border-cw-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
              >
                <option value="">{t('noNormOption', uiLang)}</option>
                {norms.map((n) => (
                  <option key={n.code} value={n.code}>{n.name || n.code}</option>
                ))}
              </select>
            </div>
          )}

          {/* Questions (SUM / MEAN / COUNT) */}
          {calc.type !== 'CUSTOM' && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">{t('includedQuestions', uiLang)}</label>
              <div className="space-y-1.5">
                {calc.innerCalculations.map((ic, i) => {
                  // Determine which mode this row is in
                  const mode: 'question' | 'calculation' | 'constant' =
                    ic.constantValue !== undefined
                      ? 'constant'
                      : ic.calculationCode !== undefined
                      ? 'calculation'
                      : 'question';

                  const qError = mode === 'question' && ic.questionCode && !validQuestionCodes.has(ic.questionCode)
                    ? ic.questionCode
                    : null;
                  const cError = mode === 'calculation' && ic.calculationCode && !validCalcCodes.has(ic.calculationCode)
                    ? ic.calculationCode
                    : null;

                  return (
                    <div key={ic.id ?? i} className="space-y-1">
                      <div className="flex items-center gap-2">
                        {/* Mode toggle */}
                        <div className="flex border border-cw-border rounded overflow-hidden shrink-0">
                          {(['question', 'calculation', 'constant'] as const).map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => {
                                if (m === 'question') {
                                  updateInner(i, { ...ic, questionCode: ic.questionCode ?? '', calculationCode: undefined, constantValue: undefined });
                                } else if (m === 'calculation') {
                                  updateInner(i, { ...ic, calculationCode: ic.calculationCode ?? '', questionCode: undefined, constantValue: undefined });
                                } else {
                                  updateInner(i, { ...ic, constantValue: ic.constantValue ?? 0, questionCode: undefined, calculationCode: undefined });
                                }
                              }}
                              className={`px-2 py-1 text-[10px] font-medium transition-colors ${
                                mode === m
                                  ? 'bg-cw-blue text-white'
                                  : 'bg-white text-gray-500 hover:bg-cw-gray'
                              }`}
                              title={
                                m === 'question'
                                  ? (uiLang === 'NO' ? 'Spørsmål' : 'Question')
                                  : m === 'calculation'
                                  ? (uiLang === 'NO' ? 'Beregning' : 'Calculation')
                                  : (uiLang === 'NO' ? 'Konstant' : 'Constant')
                              }
                            >
                              {m === 'question'
                                ? (uiLang === 'NO' ? 'Spørsmål' : 'Q')
                                : m === 'calculation'
                                ? (uiLang === 'NO' ? 'Beregning' : 'Calc')
                                : (uiLang === 'NO' ? 'Konstant' : 'Const')}
                            </button>
                          ))}
                        </div>

                        {/* Input based on mode */}
                        {mode === 'question' && (
                          <select
                            value={ic.questionCode ?? ''}
                            onChange={(e) => updateInner(i, { ...ic, questionCode: e.target.value })}
                            className={`flex-1 border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cw-blue-light ${qError ? 'border-red-400' : 'border-cw-border'}`}
                          >
                            <option value="">{t('selectQuestion', uiLang)}</option>
                            {questions.map((q) => (
                              <option key={q} value={q}>{q}</option>
                            ))}
                          </select>
                        )}

                        {mode === 'calculation' && (
                          <select
                            value={ic.calculationCode ?? ''}
                            onChange={(e) => updateInner(i, { ...ic, calculationCode: e.target.value })}
                            className={`flex-1 border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cw-blue-light ${cError ? 'border-red-400' : 'border-cw-border'}`}
                          >
                            <option value="">{uiLang === 'NO' ? '— Velg beregning —' : '— Select calculation —'}</option>
                            {calcCodes.filter((c) => c !== calc.code).map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        )}

                        {mode === 'constant' && (
                          <input
                            type="number"
                            value={ic.constantValue ?? 0}
                            onChange={(e) => updateInner(i, { ...ic, constantValue: parseFloat(e.target.value) || 0 })}
                            step="any"
                            placeholder="0"
                            className="flex-1 border border-cw-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
                          />
                        )}

                        <span className="text-gray-400 text-xs shrink-0">×</span>
                        <input
                          type="number"
                          value={ic.multiplier ?? 1}
                          onChange={(e) => updateInner(i, { ...ic, multiplier: parseFloat(e.target.value) || 1 })}
                          step="0.1"
                          title={uiLang === 'NO' ? 'Multiplikator' : 'Multiplier'}
                          className="w-20 border border-cw-border rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
                        />
                        <button onClick={() => deleteInner(i)} className="text-gray-300 hover:text-red-500 shrink-0">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {qError && (
                        <p className="text-xs text-red-500 pl-1">
                          ⚠ {uiLang === 'NO' ? `Spørsmål '${qError}' finnes ikke` : `Question '${qError}' does not exist`}
                        </p>
                      )}
                      {cError && (
                        <p className="text-xs text-red-500 pl-1">
                          ⚠ {uiLang === 'NO' ? `Beregning '${cError}' finnes ikke` : `Calculation '${cError}' does not exist`}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
              <button
                onClick={addInner}
                className="mt-2 flex items-center gap-1 text-xs text-cw-blue-light hover:underline"
              >
                <PlusCircle className="w-3.5 h-3.5" /> {t('addQuestion', uiLang)}
              </button>

              {/* Formula preview */}
              {formulaPreview && calc.innerCalculations.length > 0 && (
                <div className="mt-2 bg-gray-50 border border-cw-border rounded px-3 py-2">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{t('formulaLabel', uiLang)}</p>
                  <code className="text-xs text-gray-700">{formulaPreview}</code>
                </div>
              )}
            </div>
          )}

          {/* Custom formula */}
          {calc.type === 'CUSTOM' && (
            <div className="space-y-2">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('customFormula', uiLang)}</label>
                <textarea
                  value={calc.formula ?? ''}
                  onChange={(e) => onChange({ ...calc, formula: e.target.value })}
                  rows={4}
                  className="w-full border border-cw-border rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-cw-blue-light resize-y"
                  placeholder={uiLang === 'NO' ? 'f.eks. Q1 + Q2 * 2' : 'e.g. Q1 + Q2 * 2'}
                  spellCheck={false}
                />
              </div>
              {calc._rawExpression && (
                <div className="bg-gray-50 border border-cw-border rounded px-3 py-2">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
                    {uiLang === 'NO' ? 'Rå uttrykk (CUSTOM)' : 'Raw expression (CUSTOM)'}
                  </p>
                  <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {calc._rawExpression}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Remote scoring */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-500 mb-2">
              <input
                type="checkbox"
                checked={showRemote}
                onChange={(e) => {
                  setShowRemote(e.target.checked);
                  if (!e.target.checked) onChange({ ...calc, remoteScoring: undefined });
                }}
                className="accent-cw-blue"
              />
              {t('remoteScoringLabel', uiLang)}
            </label>

            {showRemote && (
              <div className="border border-cw-border rounded p-3 space-y-2 bg-gray-50">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{t('serviceCode', uiLang)}</label>
                  <input
                    type="text"
                    value={calc.remoteScoring?.serviceCode ?? ''}
                    onChange={(e) =>
                      onChange({
                        ...calc,
                        remoteScoring: { serviceCode: e.target.value, parameters: calc.remoteScoring?.parameters ?? {} },
                      })
                    }
                    placeholder="SERVICE_CODE"
                    className="w-full border border-cw-border rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{t('parametersLabel', uiLang)}</label>
                  <textarea
                    rows={3}
                    value={Object.entries(calc.remoteScoring?.parameters ?? {}).map(([k, v]) => `${k}=${v}`).join('\n')}
                    onChange={(e) => {
                      const params: Record<string, string> = {};
                      for (const line of e.target.value.split('\n')) {
                        const [k, ...rest] = line.split('=');
                        if (k.trim()) params[k.trim()] = rest.join('=').trim();
                      }
                      onChange({
                        ...calc,
                        remoteScoring: { serviceCode: calc.remoteScoring?.serviceCode ?? '', parameters: params },
                      });
                    }}
                    placeholder="PARAM1=value1&#10;PARAM2=value2"
                    className="w-full border border-cw-border rounded px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-cw-blue-light resize-none"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main editor ──────────────────────────────────────────────────────────

export function CalculationEditor({ questionnaire, onChange }: Props) {
  const uiLang = useUILang();
  const calcs = questionnaire.calculations?.calculations ?? [];
  const norms = questionnaire.calculations?.norms ?? [];
  const [editingSet, setEditingSet] = useState<Set<number>>(new Set());
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    function handler(e: Event) {
      const idx = (e as CustomEvent<{ index: number }>).detail.index;
      if (idx >= 0 && idx < calcs.length) {
        setEditingSet((prev) => new Set(prev).add(idx));
        setTimeout(() => {
          document.getElementById(`calc-item-${idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
      }
    }
    window.addEventListener('select-calculation', handler);
    return () => window.removeEventListener('select-calculation', handler);
  }, [calcs.length]);

  function startEditing(i: number) {
    setEditingSet((prev) => new Set(prev).add(i));
  }
  function stopEditing(i: number) {
    setEditingSet((prev) => { const next = new Set(prev); next.delete(i); return next; });
  }

  const allQuestionCodes = useMemo(() => {
    const queue = [...(questionnaire.sections ?? [])];
    const codes: string[] = [];
    while (queue.length > 0) {
      const sec = queue.shift()!;
      for (const q of sec.questions ?? []) {
        if (q.type !== 'text' && q.code) codes.push(q.code);
      }
      if (sec.subSections) queue.push(...sec.subSections);
    }
    return codes;
  }, [questionnaire.sections]);

  const validQuestionCodes = useMemo(() => new Set(allQuestionCodes), [allQuestionCodes]);

  const allCalcCodes = useMemo(() => calcs.map((c) => c.code).filter(Boolean), [calcs]);
  const validCalcCodes = useMemo(() => new Set(allCalcCodes), [allCalcCodes]);

  function setCalcs(calculations: Calculation[]) {
    onChange({ ...questionnaire, calculations: { calculations, norms } as Calculations });
  }

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; idx: number } | null>(null);

  function addCalc() { setCalcs([...calcs, newCalculation()]); }
  function updateCalc(i: number, c: Calculation) { setCalcs(calcs.map((x, idx) => idx === i ? c : x)); }
  function deleteCalc(i: number) { setCalcs(calcs.filter((_, idx) => idx !== i)); }
  function dupCalc(i: number) {
    const src = calcs[i];
    const dup: Calculation = { ...src, code: src.code ? `${src.code}-kopi` : '' };
    const next = [...calcs];
    next.splice(i + 1, 0, dup);
    setCalcs(next);
  }

  function handleImportResult(calculations: Calculation[]) {
    onChange({ ...questionnaire, calculations: { calculations, norms } as Calculations });
    setShowImport(false);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden min-w-0 min-h-0">
      {showImport && (
        <ImportCalculationsDialog
          questionnaire={questionnaire}
          onImport={handleImportResult}
          onClose={() => setShowImport(false)}
        />
      )}

      <div className="bg-white border-b border-cw-border px-4 py-3 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-cw-blue">{t('calcsHeader', uiLang)}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {calcs.length} {uiLang === 'NO'
                ? `beregning${calcs.length !== 1 ? 'er' : ''} totalt`
                : `calculation${calcs.length !== 1 ? 's' : ''} total`}
            </p>
          </div>
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-600 border border-cw-border rounded hover:bg-gray-50 hover:text-cw-blue transition-colors"
            title={uiLang === 'NO' ? 'Importer beregninger fra CSV/TSV' : 'Import calculations from CSV/TSV'}
          >
            <FileInput className="w-3.5 h-3.5" />
            {uiLang === 'NO' ? 'Importer...' : 'Import...'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {calcs.length === 0 && (
          <div className="text-center text-gray-400 py-8 text-sm">
            {t('noCalcs', uiLang)}
          </div>
        )}

        {calcs.map((calc, i) =>
          calc.formula !== undefined && !editingSet.has(i) ? (
            <div key={i} id={`calc-item-${i}`} onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, idx: i }); }}>
              <ImportedCalcCard
                calc={calc}
                onDelete={() => deleteCalc(i)}
                onEdit={() => startEditing(i)}
              />
            </div>
          ) : (
            <div key={i} id={`calc-item-${i}`} onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, idx: i }); }}>
              <EditableCalcCard
                calc={calc}
                questions={allQuestionCodes}
                calcCodes={allCalcCodes}
                validQuestionCodes={validQuestionCodes}
                validCalcCodes={validCalcCodes}
                norms={norms}
                onChange={(c) => updateCalc(i, c)}
                onDelete={() => deleteCalc(i)}
                onClose={editingSet.has(i) ? () => stopEditing(i) : undefined}
              />
            </div>
          )
        )}
        {ctxMenu && (
          <ItemContextMenu
            x={ctxMenu.x}
            y={ctxMenu.y}
            onClose={() => setCtxMenu(null)}
            items={[
              { label: uiLang === 'NO' ? 'Dupliser' : 'Duplicate', icon: <Copy className="w-3.5 h-3.5 text-gray-400" />, onClick: () => dupCalc(ctxMenu.idx) },
              { separator: true },
              { label: uiLang === 'NO' ? 'Slett' : 'Delete', icon: <Trash2 className="w-3.5 h-3.5" />, onClick: () => deleteCalc(ctxMenu.idx), danger: true },
            ]}
          />
        )}

        <button
          onClick={addCalc}
          className="flex items-center justify-center gap-2 w-full border-2 border-dashed border-cw-border rounded-lg py-3 text-sm text-gray-400 hover:border-cw-blue-light hover:text-cw-blue-light transition-colors"
        >
          <PlusCircle className="w-4 h-4" />
          <span>{t('addCalcBtn', uiLang)}</span>
        </button>
      </div>
    </div>
  );
}
