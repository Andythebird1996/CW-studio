import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Clipboard,
  Copy,
  FileText,
  GripVertical,
  Hash,
  PlusCircle,
  Scissors,
  Trash2,
  X,
} from 'lucide-react';
import { generateCodes } from '../../services/generate-codes';
import { validateQuestionnaire, type ValidationIssue } from '../../services/validate-questionnaire';
import { ImportTextDialog } from '../dialogs/ImportTextDialog';
import type {
  Questionnaire,
  Question,
  Section,
  SectionType,
  LanguageType,
  ShowExpression,
  HideExpression,
  ContinueIfExpression,
  Dimension,
  ResponseTemplate,
  TextOption,
} from '../../types/questionnaire';
import { ExpressionEditor } from './ExpressionEditor';
import { AssessmentPreview } from '../preview/AssessmentPreview';
import { SpreadsheetOptionsEditor } from './SpreadsheetOptionsEditor';
import { t, tf, countPhrase, useUILang, type UILang } from '../../i18n';
import { useClipboardStore } from '../../stores/clipboard-store';

// ── Question type catalogue ───────────────────────────────────────────────────

const QUESTION_TYPE_VALUES: Question['type'][] = [
  'radiobutton', 'checkbox', 'combobox', 'stringInput', 'numericInput', 'dateInput', 'slider', 'rank', 'text', 'image', 'country',
];

type QTKey = 'qtRadiobutton' | 'qtCheckbox' | 'qtCombobox' | 'qtStringInput' | 'qtNumericInput' | 'qtDateInput' | 'qtSlider' | 'qtRank' | 'qtText' | 'qtImage' | 'qtCountry';

const QT_I18N: Record<Question['type'], QTKey> = {
  radiobutton:  'qtRadiobutton',
  checkbox:     'qtCheckbox',
  combobox:     'qtCombobox',
  stringInput:  'qtStringInput',
  numericInput: 'qtNumericInput',
  dateInput:    'qtDateInput',
  slider:       'qtSlider',
  rank:         'qtRank',
  text:         'qtText',
  image:        'qtImage',
  country:      'qtCountry',
};

function getQTypeLabel(type: Question['type'], uiLang: UILang): string {
  return t(QT_I18N[type], uiLang);
}

interface Props {
  questionnaire: Questionnaire;
  onChange: (q: Questionnaire) => void;
  navigateToElementId?: { id: string; seq: number } | null;
  mediaFiles?: import('../../types/questionnaire').MediaFile[];
  onToggleValidation?: () => void;
}

// ── Factory ───────────────────────────────────────────────────────────────────

function newQuestion(type: Question['type']): Question {
  const id = crypto.randomUUID();
  const base = {
    id,
    code: '',
    required: false,
    texts: { NO: '' } as Record<LanguageType, string>,
  };
  switch (type) {
    case 'radiobutton':  return { ...base, type: 'radiobutton',  options: [] };
    case 'checkbox':     return { ...base, type: 'checkbox',     options: [], multiple: true };
    case 'combobox':     return { ...base, type: 'combobox',     options: [] };
    case 'stringInput':  return { ...base, type: 'stringInput',  size: 'MEDIUM' };
    case 'numericInput': return { ...base, type: 'numericInput' };
    case 'dateInput':    return { ...base, type: 'dateInput' };
    case 'slider':       return { ...base, type: 'slider', min: 0, max: 10 };
    case 'rank':         return { ...base, type: 'rank', options: [] };
    case 'image':        return { ...base, type: 'image', imageSrc: '', altText: {} as Record<string, string> };
    case 'country':      return { ...base, type: 'country' };
    default:             return { ...base, type: 'text', isQuestion: false };
  }
}

// ── Context menu types ────────────────────────────────────────────────────────

interface ContextMenuState {
  kind: 'question' | 'section';
  x: number;
  y: number;
  // For questions
  questionId?: string;
  sectionId?: string;
  // For sections
  topSectionId?: string;
}

// ── OptionsEditor ─────────────────────────────────────────────────────────────

function OptionsEditor({
  options,
  lang,
  onChange,
}: {
  options: Array<{ code: string; score?: number; texts: Record<LanguageType, string> }>;
  lang: LanguageType;
  onChange: (opts: typeof options) => void;
}) {
  const uiLang = useUILang();

  function addOption() {
    onChange([
      ...options,
      { code: '', score: options.length, texts: { [lang]: '' } as Record<LanguageType, string> },
    ]);
  }
  function updateOption(i: number, patch: Partial<(typeof options)[0]>) {
    onChange(options.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  }
  function removeOption(i: number) {
    onChange(options.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <div className="space-y-1.5">
        {options.map((opt, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input
              type="text"
              value={opt.texts[lang] ?? ''}
              onChange={(e) => updateOption(i, { texts: { ...opt.texts, [lang]: e.target.value } })}
              placeholder={t('optionPlaceholder', uiLang)}
              className="flex-1 border border-cw-border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
            />
            <input
              type="text"
              value={opt.code}
              onChange={(e) => updateOption(i, { code: e.target.value })}
              placeholder={t('code', uiLang).toLowerCase()}
              className="w-20 border border-cw-border rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
            />
            <input
              type="number"
              value={opt.score ?? ''}
              onChange={(e) => updateOption(i, { score: e.target.value ? +e.target.value : undefined })}
              placeholder="score"
              className="w-16 border border-cw-border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
            />
            <label className="flex items-center gap-1 cursor-pointer shrink-0" title={t('reverseScoreTitle', uiLang)}>
              <input
                type="checkbox"
                checked={(opt as any).reverseValue ?? false}
                onChange={(e) => updateOption(i, { reverseValue: e.target.checked || undefined } as any)}
                className="accent-cw-blue"
              />
              <span className="text-xs text-gray-500">{t('revShort', uiLang)}</span>
            </label>
            <button onClick={() => removeOption(i)} className="text-gray-300 hover:text-red-500">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={addOption}
        className="mt-2 flex items-center gap-1 text-xs text-cw-blue-light hover:underline"
      >
        <PlusCircle className="w-3.5 h-3.5" /> {t('addOption', uiLang)}
      </button>
    </div>
  );
}

// ── OptionsEditorWithToggle ───────────────────────────────────────────────────
// Wraps OptionsEditor + SpreadsheetOptionsEditor with a Liste / Tabell toggle.

function OptionsEditorWithToggle({
  options,
  lang,
  allLanguages,
  onChange,
}: {
  options: Array<{ code: string; score?: number; reverseValue?: boolean; texts: Record<LanguageType, string> }>;
  lang: LanguageType;
  allLanguages: LanguageType[];
  onChange: (opts: typeof options) => void;
}) {
  const [mode, setMode] = useState<'list' | 'table'>('list');

  return (
    <div>
      {/* Toggle bar */}
      <div className="flex items-center gap-1 mb-2">
        <label className="block text-xs font-medium text-gray-500 flex-1">{mode === 'list' ? 'Svaralternativer' : 'Svaralternativer — tabellvisning'}</label>
        <button
          type="button"
          onClick={() => setMode(mode === 'list' ? 'table' : 'list')}
          className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
            mode === 'table'
              ? 'bg-cw-blue text-white border-cw-blue'
              : 'bg-white text-gray-500 border-cw-border hover:border-cw-blue-light hover:text-cw-blue-light'
          }`}
          title={mode === 'list' ? 'Bytt til tabellvisning' : 'Bytt til listevisning'}
        >
          {mode === 'list' ? 'Tabell' : 'Liste'}
        </button>
      </div>

      {mode === 'list' ? (
        <OptionsEditor options={options} lang={lang} onChange={onChange} />
      ) : (
        <SpreadsheetOptionsEditor
          options={options as TextOption[]}
          languages={allLanguages.length > 0 ? allLanguages : [lang]}
          onChange={(opts) => onChange(opts)}
        />
      )}
    </div>
  );
}

// ── QuestionRow ───────────────────────────────────────────────────────────────

function QuestionRow({
  question,
  lang,
  allLanguages,
  allSectionQuestions,
  dimensionMap,
  responseTemplates,
  mediaCodes,
  onChange,
  onDelete,
  onDuplicate,
  onChangeTemplates,
  dragHandleProps,
  isSelected,
  onSelect,
  onContextMenu,
}: {
  question: Question;
  lang: LanguageType;
  allLanguages: LanguageType[];
  allSectionQuestions: Question[];
  dimensionMap: Map<string, string[]>;
  responseTemplates: ResponseTemplate[];
  mediaCodes: string[];
  onChange: (q: Question) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onChangeTemplates: (templates: ResponseTemplate[]) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLSpanElement>;
  isSelected?: boolean;
  onSelect?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const uiLang = useUILang();
  // Start collapsed for imported questions (have a code), expanded for newly created ones
  const [expanded, setExpanded] = useState(!question.code);
  const typeLabel = getQTypeLabel(question.type, uiLang);

  return (
    <div
      className={`border rounded mb-2 bg-white transition-shadow ${
        isSelected
          ? 'border-blue-400 ring-2 ring-blue-300 ring-offset-1'
          : 'border-cw-border'
      }`}
      onContextMenu={onContextMenu}
      data-element-id={question.id}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none hover:bg-cw-gray"
        onClick={(e) => {
          // Only select if not clicking inside an input/button/select/textarea
          const tag = (e.target as HTMLElement).tagName.toLowerCase();
          if (!['input', 'textarea', 'select', 'button'].includes(tag)) {
            onSelect?.();
          }
          setExpanded((ex) => !ex);
        }}
      >
        {/* Drag handle */}
        <span
          {...dragHandleProps}
          className="text-gray-300 hover:text-gray-500 cursor-grab touch-none"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-4 h-4" />
        </span>

        {expanded ? (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400" />
        )}

        <span className="text-xs bg-cw-gray border border-cw-border text-gray-500 px-1.5 py-0.5 rounded">
          {typeLabel}
        </span>
        <span className="flex-1 text-sm text-gray-700 truncate">
          {question.texts[lang] || (
            <span className="text-gray-400 italic">{t('noText', uiLang)}</span>
          )}
        </span>
        {question.code && (
          <span className="text-xs text-gray-400 font-mono">{question.code}</span>
        )}
        {question.code && dimensionMap.has(question.code) && (
          <span className="flex items-center gap-1">
            {dimensionMap.get(question.code)!.map((dimCode) => (
              <span
                key={dimCode}
                className="text-[10px] font-mono bg-blue-50 border border-blue-200 text-blue-600 px-1.5 py-0.5 rounded"
                title={`${t('tabDimensions', uiLang)}: ${dimCode}`}
              >
                {dimCode}
              </span>
            ))}
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
          className="text-gray-300 hover:text-cw-blue-light p-1"
          title={t('duplicateQuestion', uiLang)}
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="text-gray-300 hover:text-red-500 p-1"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Body */}
      {expanded && (
        <div className="px-4 pb-3 pt-1 border-t border-cw-border space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('typeLabel', uiLang)}</label>
              <select
                value={question.type}
                onChange={(e) => {
                  const newType = e.target.value as Question['type'];
                  if (newType === question.type) return;
                  const fresh = newQuestion(newType);
                  onChange({
                    ...fresh,
                    id: question.id,
                    code: question.code,
                    texts: question.texts,
                    required: question.required,
                    helpTexts: question.helpTexts,
                    showExpressions: question.showExpressions,
                    hideExpressions: question.hideExpressions,
                    continueIfExpressions: question.continueIfExpressions,
                    ...(question.reversedScore !== undefined && { reversedScore: question.reversedScore }),
                    ...(question.voluntary !== undefined && { voluntary: question.voluntary }),
                    ...(question.readonly !== undefined && { readonly: question.readonly }),
                  });
                }}
                className="w-full border border-cw-border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
              >
                {QUESTION_TYPE_VALUES.map((v) => (
                  <option key={v} value={v}>{getQTypeLabel(v, uiLang)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('code', uiLang)}</label>
              <input
                type="text"
                value={question.code}
                onChange={(e) => onChange({ ...question, code: e.target.value })}
                className="w-full border border-cw-border rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
                placeholder={t('questionCodePh', uiLang)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('required', uiLang)}</label>
              <label className="flex items-center gap-2 mt-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={question.required}
                  onChange={(e) => onChange({ ...question, required: e.target.checked })}
                  className="w-4 h-4 accent-cw-blue"
                />
                <span className="text-sm text-gray-600">{t('requiredAnswer', uiLang)}</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              {t('questionText', uiLang)} ({lang})
            </label>
            <textarea
              value={question.texts[lang] ?? ''}
              onChange={(e) =>
                onChange({ ...question, texts: { ...question.texts, [lang]: e.target.value } })
              }
              rows={2}
              className="w-full border border-cw-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cw-blue-light resize-none"
              placeholder={t('enterQuestionText', uiLang)}
            />
          </div>

          {/* reversedScore / voluntary / readonly */}
          {question.type !== 'text' && (
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={question.reversedScore ?? false}
                  onChange={(e) => onChange({ ...question, reversedScore: e.target.checked || undefined } as Question)}
                  className="w-4 h-4 accent-cw-blue"
                />
                <span className="text-xs text-gray-600">{t('reversedScore', uiLang)}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={question.voluntary ?? false}
                  onChange={(e) => onChange({ ...question, voluntary: e.target.checked || undefined } as Question)}
                  className="w-4 h-4 accent-cw-blue"
                />
                <span className="text-xs text-gray-600">{t('voluntaryQ', uiLang)}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={question.readonly ?? false}
                  onChange={(e) => onChange({ ...question, readonly: e.target.checked || undefined } as Question)}
                  className="w-4 h-4 accent-cw-blue"
                />
                <span className="text-xs text-gray-600">{t('readonlyQ', uiLang)}</span>
              </label>
            </div>
          )}

          {/* Help text */}
          {question.type !== 'text' && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                {t('helpText', uiLang)}
              </label>
              <input
                type="text"
                value={question.helpTexts?.[lang] ?? ''}
                onChange={(e) =>
                  onChange({
                    ...question,
                    helpTexts: { ...(question.helpTexts ?? {}), [lang]: e.target.value } as Record<LanguageType, string>,
                  })
                }
                className="w-full border border-cw-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
                placeholder={t('helpForRespondent', uiLang)}
              />
            </div>
          )}

          {/* Options: radio / checkbox / combobox */}
          {(question.type === 'radiobutton' || question.type === 'checkbox' || question.type === 'combobox') && (
            <div>
              {/* Inline vs template toggle */}
              {responseTemplates.length > 0 && (
                <div className="flex items-center gap-4 mb-2">
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="radio"
                      checked={!question.responseTemplateCode}
                      onChange={() => onChange({ ...question, responseTemplateCode: undefined } as Question)}
                      className="accent-cw-blue"
                    />
                    {t('inlineAnswer', uiLang)}
                  </label>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="radio"
                      checked={!!question.responseTemplateCode}
                      onChange={() =>
                        onChange({
                          ...question,
                          responseTemplateCode: responseTemplates[0]?.code ?? '',
                          options: [],
                        } as Question)
                      }
                      className="accent-cw-blue"
                    />
                    {t('useTemplate', uiLang)}
                  </label>
                </div>
              )}

              {question.responseTemplateCode ? (
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('templateLabel', uiLang)}</label>
                  <select
                    value={question.responseTemplateCode}
                    onChange={(e) =>
                      onChange({ ...question, responseTemplateCode: e.target.value } as Question)
                    }
                    className="w-full border border-cw-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
                  >
                    {responseTemplates.map((tpl) => (
                      <option key={tpl.code} value={tpl.code}>
                        {tpl.name || tpl.code} ({tpl.options.length} {t('optionsWord', uiLang)})
                      </option>
                    ))}
                  </select>
                  {/* Editable options from selected template */}
                  {(() => {
                    const tplCode = question.responseTemplateCode;
                    const tplIdx = responseTemplates.findIndex((tpl) => tpl.code === tplCode);
                    if (tplIdx === -1) return null;
                    const tpl = responseTemplates[tplIdx];
                    const usageCount = allSectionQuestions.filter(
                      (q) => 'responseTemplateCode' in q && q.responseTemplateCode === tplCode,
                    ).length;
                    return (
                      <div className="space-y-2">
                        {usageCount > 1 && (
                          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded px-3 py-2 text-xs text-amber-800">
                            <span className="shrink-0 mt-0.5">⚠</span>
                            <span>
                              {tf('templateUsedBy', uiLang, { code: tplCode, n: usageCount })}
                            </span>
                          </div>
                        )}
                        <OptionsEditorWithToggle
                          options={tpl.options}
                          lang={lang}
                          allLanguages={allLanguages}
                          onChange={(opts) => {
                            const next = responseTemplates.map((x, i) =>
                              i === tplIdx ? { ...x, options: opts as TextOption[] } : x,
                            );
                            onChangeTemplates(next);
                          }}
                        />
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <OptionsEditorWithToggle
                  options={question.options ?? []}
                  lang={lang}
                  allLanguages={allLanguages}
                  onChange={(opts) => onChange({ ...question, options: opts } as Question)}
                />
              )}
            </div>
          )}

          {/* Rank options */}
          {question.type === 'rank' && (
            <OptionsEditorWithToggle
              options={question.options ?? []}
              lang={lang}
              allLanguages={allLanguages}
              onChange={(opts) => onChange({ ...question, options: opts } as Question)}
            />
          )}

          {/* Show/hide expressions */}
          <ExpressionEditor
            label={t('showQWhen', uiLang)}
            expression={question.showExpressions?.[0]}
            questions={allSectionQuestions}
            onChange={(expr) =>
              onChange({ ...question, showExpressions: expr ? [expr as ShowExpression] : [] })
            }
          />
          <ExpressionEditor
            label={t('hideQWhen', uiLang)}
            expression={question.hideExpressions?.[0]}
            questions={allSectionQuestions}
            onChange={(expr) =>
              onChange({ ...question, hideExpressions: expr ? [expr as HideExpression] : [] })
            }
          />
          <ExpressionEditor
            label={t('continueWhen', uiLang)}
            expression={question.continueIfExpressions?.[0]}
            questions={allSectionQuestions}
            onChange={(expr) =>
              onChange({ ...question, continueIfExpressions: expr ? [expr as ContinueIfExpression] : [] })
            }
          />

          {/* NumericInput options */}
          {question.type === 'numericInput' && (
            <div className="space-y-2">
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Min</label>
                  <input
                    type="number"
                    value={question.min ?? ''}
                    onChange={(e) =>
                      onChange({ ...question, min: e.target.value ? +e.target.value : undefined })
                    }
                    className="w-full border border-cw-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('maxField', uiLang)}</label>
                  <input
                    type="number"
                    value={question.max ?? ''}
                    onChange={(e) =>
                      onChange({ ...question, max: e.target.value ? +e.target.value : undefined })
                    }
                    className="w-full border border-cw-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('decimals', uiLang)}</label>
                  <input
                    type="number"
                    min={0}
                    max={6}
                    value={question.decimals ?? 0}
                    onChange={(e) => onChange({ ...question, decimals: +e.target.value })}
                    className="w-full border border-cw-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('unitLabel', uiLang)}</label>
                  <input
                    type="text"
                    value={question.unit ?? ''}
                    onChange={(e) =>
                      onChange({ ...question, unit: e.target.value || undefined })
                    }
                    placeholder={t('exampleKg', uiLang)}
                    className="w-full border border-cw-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
                  />
                </div>
              </div>
            </div>
          )}

          {/* StringInput: size + multiline */}
          {question.type === 'stringInput' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('sizeLabel', uiLang)}</label>
                <select
                  value={question.size}
                  onChange={(e) => onChange({ ...question, size: e.target.value as import('../../types/questionnaire').StringInputSize })}
                  className="w-full border border-cw-border rounded px-2 py-1.5 text-sm focus:outline-none"
                >
                  <option value="SMALL">{t('sizeSmall', uiLang)}</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LARGE">{t('sizeLarge', uiLang)}</option>
                  <option value="XLARGE">{t('sizeXLarge', uiLang)}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('multiline', uiLang)}</label>
                <label className="flex items-center gap-2 mt-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={question.multiline ?? false}
                    onChange={(e) => onChange({ ...question, multiline: e.target.checked })}
                    className="w-4 h-4 accent-cw-blue"
                  />
                  <span className="text-sm text-gray-600">{t('textareaLabel', uiLang)}</span>
                </label>
              </div>
            </div>
          )}

          {/* DateInput: includeTime */}
          {question.type === 'dateInput' && (
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={question.includeTime ?? false}
                  onChange={(e) => onChange({ ...question, includeTime: e.target.checked })}
                  className="w-4 h-4 accent-cw-blue"
                />
                <span className="text-sm text-gray-600">{t('includeTime', uiLang)}</span>
              </label>
            </div>
          )}

          {/* Slider options */}
          {question.type === 'slider' && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Min</label>
                  <input
                    type="number"
                    value={question.min}
                    onChange={(e) => onChange({ ...question, min: +e.target.value })}
                    className="w-full border border-cw-border rounded px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('maxField', uiLang)}</label>
                  <input
                    type="number"
                    value={question.max}
                    onChange={(e) => onChange({ ...question, max: +e.target.value })}
                    className="w-full border border-cw-border rounded px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('stepLabel', uiLang)}</label>
                  <input
                    type="number"
                    value={question.step ?? 1}
                    onChange={(e) => onChange({ ...question, step: +e.target.value })}
                    className="w-full border border-cw-border rounded px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('minLabelField', uiLang)}</label>
                  <input
                    type="text"
                    value={question.minLabel?.[lang] ?? ''}
                    onChange={(e) =>
                      onChange({
                        ...question,
                        minLabel: { ...(question.minLabel ?? {}), [lang]: e.target.value } as Record<LanguageType, string>,
                      })
                    }
                    placeholder={t('low', uiLang)}
                    className="w-full border border-cw-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('maxLabelField', uiLang)}</label>
                  <input
                    type="text"
                    value={question.maxLabel?.[lang] ?? ''}
                    onChange={(e) =>
                      onChange({
                        ...question,
                        maxLabel: { ...(question.maxLabel ?? {}), [lang]: e.target.value } as Record<LanguageType, string>,
                      })
                    }
                    placeholder={t('high', uiLang)}
                    className="w-full border border-cw-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
                  />
                </div>
              </div>
              {/* Slider display settings */}
              <details className="border border-cw-border rounded">
                <summary className="px-3 py-1.5 text-xs font-medium text-gray-500 cursor-pointer select-none hover:bg-cw-gray">
                  {t('displaySettings', uiLang)}
                </summary>
                <div className="px-3 pb-3 pt-2 space-y-2">
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {(
                      [
                        ['showTicks',          t('showTicks', uiLang)],
                        ['showEndLabels',      t('showEndLabels', uiLang)],
                        ['showDigitalPoints',  t('showDigital', uiLang)],
                        ['displayValue',       t('showValueSliding', uiLang)],
                        ['showClear',          t('showClear', uiLang)],
                        ['hairline',           t('hairline', uiLang)],
                      ] as [string, string][]
                    ).map(([field, label]) => (
                      <label key={field} className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={(question as any)[field] ?? false}
                          onChange={(e) => onChange({ ...question, [field]: e.target.checked || undefined } as Question)}
                          className="accent-cw-blue"
                        />
                        <span className="text-xs text-gray-600">{label}</span>
                      </label>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-1">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        {t('direction', uiLang)}
                      </label>
                      <select
                        value={(question as any).direction ?? 'horizontal'}
                        onChange={(e) => onChange({ ...question, direction: e.target.value || undefined } as any)}
                        className="w-full border border-cw-border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
                      >
                        <option value="horizontal">{t('horizontal', uiLang)}</option>
                        <option value="vertical">{t('vertical', uiLang)}</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        {t('lengthCss', uiLang)}
                      </label>
                      <input
                        type="text"
                        value={(question as any).sliderLength ?? ''}
                        onChange={(e) => onChange({ ...question, sliderLength: e.target.value || undefined } as any)}
                        placeholder="300px"
                        className="w-full border border-cw-border rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
                      />
                    </div>
                  </div>
                </div>
              </details>
            </div>
          )}

          {/* Checkbox layout */}
          {question.type === 'checkbox' && (
            <details className="border border-cw-border rounded">
              <summary className="px-3 py-1.5 text-xs font-medium text-gray-500 cursor-pointer select-none hover:bg-cw-gray">
                {t('displaySettings', uiLang)}
              </summary>
              <div className="px-3 pb-3 pt-2 grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    {t('columnCount', uiLang)} (1–6)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={6}
                    value={(question as any).numberOfColumns ?? ''}
                    onChange={(e) => onChange({ ...question, numberOfColumns: e.target.value ? +e.target.value : undefined } as any)}
                    placeholder="1"
                    className="w-full border border-cw-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    {t('maxChoices', uiLang)}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={(question as any).limit ?? ''}
                    onChange={(e) => onChange({ ...question, limit: e.target.value !== '' ? +e.target.value : undefined } as any)}
                    placeholder="0"
                    className="w-full border border-cw-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    {t('ignoreOptionCodeEx', uiLang)}
                  </label>
                  <input
                    type="text"
                    value={(question as any).ignoreAnswerOptionCode ?? ''}
                    onChange={(e) => onChange({ ...question, ignoreAnswerOptionCode: e.target.value || undefined } as any)}
                    placeholder="NONE"
                    className="w-full border border-cw-border rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
                  />
                </div>
              </div>
            </details>
          )}

          {/* Radiobutton layout */}
          {question.type === 'radiobutton' && (
            <details className="border border-cw-border rounded">
              <summary className="px-3 py-1.5 text-xs font-medium text-gray-500 cursor-pointer select-none hover:bg-cw-gray">
                {t('displaySettings', uiLang)}
              </summary>
              <div className="px-3 pb-3 pt-2 grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    {t('columnCount', uiLang)} (1–6)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={6}
                    value={(question as any).numberOfColumns ?? ''}
                    onChange={(e) => onChange({ ...question, numberOfColumns: e.target.value ? +e.target.value : undefined } as any)}
                    placeholder="1"
                    className="w-full border border-cw-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    {t('ignoreOptionCode', uiLang)}
                  </label>
                  <input
                    type="text"
                    value={(question as any).ignoreAnswerOptionCode ?? ''}
                    onChange={(e) => onChange({ ...question, ignoreAnswerOptionCode: e.target.value || undefined } as any)}
                    placeholder="NONE"
                    className="w-full border border-cw-border rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
                  />
                </div>
              </div>
            </details>
          )}

          {/* Image question editor */}
          {question.type === 'image' && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded px-3 py-2 text-xs text-blue-800">
                <FileText className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  {t('imageDisplayHint', uiLang)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    {t('fileNameOrCode', uiLang)}
                  </label>
                  {mediaCodes.length > 0 ? (
                    <select
                      value={question.imageSrc ?? ''}
                      onChange={(e) => onChange({ ...question, imageSrc: e.target.value || undefined })}
                      className="w-full border border-cw-border rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
                    >
                      <option value="">{t('selectMediaFile', uiLang)}</option>
                      {mediaCodes.map((code) => (
                        <option key={code} value={code}>{code}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={question.imageSrc ?? ''}
                      onChange={(e) => onChange({ ...question, imageSrc: e.target.value || undefined })}
                      placeholder="MEDIA_FILE.png"
                      className="w-full border border-cw-border rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
                    />
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    {tf('altText', uiLang, { lang })}
                  </label>
                  <input
                    type="text"
                    value={question.altText?.[lang] ?? ''}
                    onChange={(e) =>
                      onChange({
                        ...question,
                        altText: { ...(question.altText ?? {}), [lang]: e.target.value },
                      })
                    }
                    placeholder={t('altTextPh', uiLang)}
                    className="w-full border border-cw-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Country question editor */}
          {question.type === 'country' && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 bg-gray-50 border border-cw-border rounded px-3 py-2 text-xs text-gray-600">
                <ArrowRight className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  {t('countryListHint', uiLang)}
                </span>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={(question as import('../../types/questionnaire').CountryQuestion).multiSelect ?? false}
                  onChange={(e) => onChange({ ...question, multiSelect: e.target.checked } as import('../../types/questionnaire').CountryQuestion)}
                  className="w-4 h-4 accent-cw-blue"
                />
                <span className="text-sm text-gray-600">
                  {t('allowMultiCountry', uiLang)}
                </span>
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sortable wrapper for QuestionRow ──────────────────────────────────────────

function SortableQuestionRow(
  props: React.ComponentProps<typeof QuestionRow> & { id: string }
) {
  const { id, ...rest } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : 1,
        zIndex: isDragging ? 10 : undefined,
      }}
    >
      <QuestionRow {...rest} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}


// ── SectionEditor ─────────────────────────────────────────────────────────────

function SectionEditor({
  section,
  lang,
  allLanguages,
  dimensionMap,
  allQuestions,
  responseTemplates,
  mediaCodes,
  onChange,
  onDelete,
  onDuplicate,
  onChangeTemplates,
  dragHandleProps,
  depth = 0,
  validationIssues = [],
  sectionIndex,
  selectedElementId,
  onSelectQuestion,
  onQuestionContextMenu,
  onSectionContextMenu,
  allSections,
  onMoveQuestionToSection,
  onPasteQuestion,
  clipboardKind,
}: {
  section: Section;
  lang: LanguageType;
  allLanguages: LanguageType[];
  dimensionMap: Map<string, string[]>;
  allQuestions: Question[];
  responseTemplates: ResponseTemplate[];
  mediaCodes: string[];
  onChange: (s: Section) => void;
  onDelete: () => void;
  onDuplicate?: () => void;
  onChangeTemplates: (templates: ResponseTemplate[]) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLSpanElement>;
  depth?: number;
  validationIssues?: ValidationIssue[];
  sectionIndex?: number;
  selectedElementId?: string | null;
  onSelectQuestion?: (id: string) => void;
  onQuestionContextMenu?: (e: React.MouseEvent, questionId: string, sectionId: string) => void;
  onSectionContextMenu?: (e: React.MouseEvent, sectionId: string) => void;
  allSections?: Section[];
  onMoveQuestionToSection?: (questionId: string, fromSectionId: string, toSectionId: string) => void;
  onPasteQuestion?: (sectionId: string) => void;
  clipboardKind?: 'question' | 'section' | null;
}) {
  const uiLang = useUILang();
  // Start collapsed for sections that already have content (imported), expanded for new empty ones
  const hasContent = section.questions.length > 0 || (section.subSections?.length ?? 0) > 0;
  const [collapsed, setCollapsed] = useState(hasContent);

  // Auto-expand when navigation targets this section or any question/subsection inside it
  useEffect(() => {
    if (!selectedElementId) return;
    function isInside(s: Section): boolean {
      if (s.id === selectedElementId) return true;
      if (s.questions.some((q) => q.id === selectedElementId)) return true;
      return (s.subSections ?? []).some(isInside);
    }
    if (isInside(section)) setCollapsed(false);
  }, [selectedElementId, section]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleQuestionDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIdx = section.questions.findIndex((q) => q.id === active.id);
      const newIdx = section.questions.findIndex((q) => q.id === over.id);
      onChange({ ...section, questions: arrayMove(section.questions, oldIdx, newIdx) });
    }
  }

  function addQuestion(type: Question['type']) {
    onChange({ ...section, questions: [...section.questions, newQuestion(type)] });
  }
  function updateQuestion(i: number, q: Question) {
    onChange({ ...section, questions: section.questions.map((x, idx) => (idx === i ? q : x)) });
  }
  function deleteQuestion(i: number) {
    onChange({ ...section, questions: section.questions.filter((_, idx) => idx !== i) });
  }
  function updateSubSection(i: number, s: Section) {
    const subSections = (section.subSections ?? []).map((x, idx) => (idx === i ? s : x));
    onChange({ ...section, subSections });
  }
  function deleteSubSection(i: number) {
    onChange({ ...section, subSections: (section.subSections ?? []).filter((_, idx) => idx !== i) });
  }

  function duplicateQuestion(i: number) {
    const original = section.questions[i];
    const clone: Question = JSON.parse(JSON.stringify(original));
    clone.id = crypto.randomUUID();
    clone.code = clone.code ? `${clone.code}-kopi` : '';
    const next = [...section.questions];
    next.splice(i + 1, 0, clone);
    onChange({ ...section, questions: next });
  }

  function duplicateSubSection(i: number) {
    const original = (section.subSections ?? [])[i];
    const clone: Section = JSON.parse(JSON.stringify(original));
    clone.id = crypto.randomUUID();
    clone.code = clone.code ? `${clone.code}-kopi` : '';
    clone.questions = clone.questions.map((q) => ({
      ...q,
      id: crypto.randomUUID(),
      code: q.code ? `${q.code}-kopi` : '',
    }));
    // subSections on nested sections are not supported (no infinite nesting)
    const subs = [...(section.subSections ?? [])];
    subs.splice(i + 1, 0, clone);
    onChange({ ...section, subSections: subs });
  }

  // Compute per-section validation badge counts (only for top-level, depth === 0)
  const sectionErrorCount = depth === 0 && sectionIndex !== undefined
    ? validationIssues.filter(
        (iss) => iss.path.startsWith(`sections[${sectionIndex}]`) && iss.severity === 'error',
      ).length
    : 0;
  const sectionWarningCount = depth === 0 && sectionIndex !== undefined
    ? validationIssues.filter(
        (iss) => iss.path.startsWith(`sections[${sectionIndex}]`) && iss.severity === 'warning',
      ).length
    : 0;

  // Visual depth cues: top-level gets border-2, nested get border-l-2 with indent
  const isNested = depth > 0;
  const borderClass = isNested
    ? 'border border-cw-border border-l-2 border-l-cw-blue-light rounded-lg mb-2'
    : 'border-2 border-cw-border rounded-lg mb-4';
  const headerBg = isNested ? 'bg-gray-50' : 'bg-cw-gray';

  // Total question count including sub-sections (for display)
  function countAllQuestions(s: Section): number {
    return s.questions.length + (s.subSections ?? []).reduce((n, ss) => n + countAllQuestions(ss), 0);
  }

  return (
    <div className={borderClass} data-element-id={section.id}>
      {/* Section header */}
      <div
        className={`flex items-center gap-2 ${headerBg} px-3 py-2 rounded-t-lg`}
        onContextMenu={
          onSectionContextMenu
            ? (e) => onSectionContextMenu(e, section.id)
            : undefined
        }
      >
        {/* Drag handle — only for top-level sortable sections */}
        {!isNested && (
          <span
            {...dragHandleProps}
            className="text-gray-300 hover:text-gray-500 cursor-grab touch-none"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="w-4 h-4" />
          </span>
        )}

        <button onClick={() => setCollapsed((c) => !c)} className="text-gray-500">
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>

        <input
          type="text"
          value={section.titles[lang] ?? ''}
          onChange={(e) =>
            onChange({ ...section, titles: { ...section.titles, [lang]: e.target.value } })
          }
          placeholder={t('sectionTitle', uiLang)}
          className="flex-1 bg-transparent text-sm font-medium text-gray-700 focus:outline-none border-b border-transparent focus:border-cw-blue"
          onClick={(e) => e.stopPropagation()}
        />

        {/* Type badge — visible only when collapsed, for non-NORMAL types */}
        {collapsed && section.type === 'REPEATED' && (
          <span className="shrink-0 flex items-center gap-0.5 text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5 font-mono">
            ↻ REPEATED
          </span>
        )}
        {collapsed && section.type === 'CONDITIONAL' && (
          <span className="shrink-0 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
            COND
          </span>
        )}

        <input
          type="text"
          value={section.code ?? ''}
          onChange={(e) => onChange({ ...section, code: e.target.value })}
          placeholder={t('code', uiLang).toLowerCase()}
          className="w-24 bg-white border border-cw-border rounded px-2 py-0.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
        />

        <select
          value={section.type}
          onChange={(e) => onChange({ ...section, type: e.target.value as SectionType })}
          onClick={(e) => e.stopPropagation()}
          className="bg-white border border-cw-border rounded px-1.5 py-0.5 text-xs focus:outline-none"
          title={t('sectionTypeLabel', uiLang)}
        >
          <option value="NORMAL">{t('stNormal', uiLang)}</option>
          <option value="REPEATED">{t('stRepeated', uiLang)}</option>
          <option value="CONDITIONAL">{t('stConditional', uiLang)}</option>
        </select>

        {section.type === 'REPEATED' && (
          <input
            type="text"
            value={section.repeatCode ?? ''}
            onChange={(e) => onChange({ ...section, repeatCode: e.target.value })}
            placeholder={t('repeatCodePH', uiLang)}
            onClick={(e) => e.stopPropagation()}
            className="w-24 bg-white border border-cw-border rounded px-2 py-0.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
            title={t('repetitionCode', uiLang)}
          />
        )}

        <label
          className="flex items-center gap-1 cursor-pointer shrink-0"
          onClick={(e) => e.stopPropagation()}
          title={t('forcePageBreak', uiLang)}
        >
          <input
            type="checkbox"
            checked={section.requiresNewPage ?? false}
            onChange={(e) => onChange({ ...section, requiresNewPage: e.target.checked || undefined })}
            className="accent-cw-blue"
          />
          <span className="text-xs text-gray-500">{t('newPage', uiLang)}</span>
        </label>

        <span className="text-xs text-gray-400 tabular-nums">
          {countAllQuestions(section)} {t('questionsQ', uiLang)}
        </span>

        {/* Validation badges (top-level sections only) */}
        {depth === 0 && sectionErrorCount > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] font-medium text-red-600 bg-red-50 border border-red-200 rounded px-1.5 py-0.5 shrink-0">
            <AlertCircle className="w-3 h-3" />
            {sectionErrorCount} feil
          </span>
        )}
        {depth === 0 && sectionWarningCount > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 shrink-0">
            <AlertTriangle className="w-3 h-3" />
            {sectionWarningCount} advarsel{sectionWarningCount !== 1 ? 'er' : ''}
          </span>
        )}

        {onDuplicate && (
          <button
            onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
            className="text-gray-300 hover:text-cw-blue-light"
            title={t('duplicateSection', uiLang)}
          >
            <Copy className="w-4 h-4" />
          </button>
        )}

        <button onClick={onDelete} className="text-gray-300 hover:text-red-500">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Body: questions + sub-sections */}
      {!collapsed && (
        <div className="p-3">
          {/* Direct questions */}
          {section.questions.length > 0 && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleQuestionDragEnd}
            >
              <SortableContext
                items={section.questions.map((q) => q.id)}
                strategy={verticalListSortingStrategy}
              >
                {section.questions.map((q, i) => (
                  <SortableQuestionRow
                    key={q.id}
                    id={q.id}
                    question={q}
                    lang={lang}
                    allLanguages={allLanguages}
                    allSectionQuestions={allQuestions}
                    dimensionMap={dimensionMap}
                    responseTemplates={responseTemplates}
                    mediaCodes={mediaCodes}
                    onChange={(updated) => updateQuestion(i, updated)}
                    onDelete={() => deleteQuestion(i)}
                    onDuplicate={() => duplicateQuestion(i)}
                    onChangeTemplates={onChangeTemplates}
                    isSelected={selectedElementId === q.id}
                    onSelect={() => onSelectQuestion?.(q.id)}
                    onContextMenu={
                      onQuestionContextMenu
                        ? (e) => onQuestionContextMenu(e, q.id, section.id)
                        : undefined
                    }
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}

          {/* Paste question button */}
          {clipboardKind === 'question' && onPasteQuestion && (
            <button
              onClick={() => onPasteQuestion(section.id)}
              className="flex items-center gap-1.5 text-xs text-cw-blue-light hover:underline mb-2 mt-1"
            >
              <Clipboard className="w-3.5 h-3.5" />
              {t('pasteQuestions', uiLang)}
            </button>
          )}

          {/* Sub-sections (recursive, no DnD reorder for nested) */}
          {(section.subSections ?? []).map((sub, i) => (
            <div key={sub.id} className="ml-6 border-l-2 border-cw-border pl-3">
              <SectionEditor
                section={sub}
                lang={lang}
                allLanguages={allLanguages}
                dimensionMap={dimensionMap}
                allQuestions={allQuestions}
                responseTemplates={responseTemplates}
                mediaCodes={mediaCodes}
                onChange={(s) => updateSubSection(i, s)}
                onDelete={() => deleteSubSection(i)}
                onDuplicate={() => duplicateSubSection(i)}
                onChangeTemplates={onChangeTemplates}
                depth={depth + 1}
                selectedElementId={selectedElementId}
                onSelectQuestion={onSelectQuestion}
                onQuestionContextMenu={onQuestionContextMenu}
                onSectionContextMenu={onSectionContextMenu}
                allSections={allSections}
                onMoveQuestionToSection={onMoveQuestionToSection}
                onPasteQuestion={onPasteQuestion}
                clipboardKind={clipboardKind}
              />
            </div>
          ))}

          {/* Section show/hide expressions */}
          <div className="pt-1 space-y-2">
            <ExpressionEditor
              label={t('showSWhen', uiLang)}
              expression={section.showExpressions?.[0]}
              questions={allQuestions}
              onChange={(expr) =>
                onChange({ ...section, showExpressions: expr ? [expr as ShowExpression] : [] })
              }
            />
            <ExpressionEditor
              label={t('hideSWhen', uiLang)}
              expression={section.hideExpressions?.[0]}
              questions={allQuestions}
              onChange={(expr) =>
                onChange({ ...section, hideExpressions: expr ? [expr as HideExpression] : [] })
              }
            />
            <ExpressionEditor
              label={t('continueSection', uiLang)}
              expression={section.continueIfExpressions?.[0]}
              questions={allQuestions}
              onChange={(expr) =>
                onChange({ ...section, continueIfExpressions: expr ? [expr as ContinueIfExpression] : [] })
              }
            />
          </div>

          {/* Add question / sub-section */}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">{t('addLabel', uiLang)}</span>
              <select
                className="text-xs border border-cw-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) addQuestion(e.target.value as Question['type']);
                  e.target.value = '';
                }}
              >
                <option value="" disabled>{t('selectQType', uiLang)}</option>
                {QUESTION_TYPE_VALUES.map((v) => (
                  <option key={v} value={v}>{getQTypeLabel(v, uiLang)}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => {
                const sub: Section = {
                  id: crypto.randomUUID(),
                  type: 'NORMAL',
                  titles: {} as Record<LanguageType, string>,
                  questions: [],
                };
                onChange({ ...section, subSections: [...(section.subSections ?? []), sub] });
              }}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-cw-blue-light border border-dashed border-gray-300 hover:border-cw-blue-light rounded px-2 py-1 transition-colors"
            >
              <PlusCircle className="w-3.5 h-3.5" /> {t('subsection', uiLang)}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sortable wrapper for SectionEditor ────────────────────────────────────────

function SortableSectionEditor(
  props: React.ComponentProps<typeof SectionEditor> & { id: string }
) {
  const { id, ...rest } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : 1,
        zIndex: isDragging ? 10 : undefined,
      }}
    >
      <SectionEditor {...rest} dragHandleProps={{ ...attributes, ...listeners }} depth={0} validationIssues={rest.validationIssues} sectionIndex={rest.sectionIndex} />
    </div>
  );
}


// ── ResponseTemplatesEditor ───────────────────────────────────────────────────

function ResponseTemplatesEditor({
  templates,
  lang,
  allLanguages,
  onChange,
}: {
  templates: ResponseTemplate[];
  lang: LanguageType;
  allLanguages: LanguageType[];
  onChange: (templates: ResponseTemplate[]) => void;
}) {
  const uiLang = useUILang();
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  useEffect(() => {
    function handleFocus() { setOpen(true); }
    function handleSelect(e: Event) {
      const idx = (e as CustomEvent<{ index: number }>).detail.index;
      setOpen(true);
      if (idx >= 0 && idx < templates.length) setActiveIdx(idx);
    }
    window.addEventListener('focus-response-templates', handleFocus);
    window.addEventListener('select-response-template', handleSelect);
    return () => {
      window.removeEventListener('focus-response-templates', handleFocus);
      window.removeEventListener('select-response-template', handleSelect);
    };
  }, [templates.length]);

  function addTemplate() {
    const tpl: ResponseTemplate = { code: '', name: '', options: [] };
    const next = [...templates, tpl];
    onChange(next);
    setActiveIdx(next.length - 1);
    setOpen(true);
  }

  function updateTemplate(i: number, tpl: ResponseTemplate) {
    onChange(templates.map((x, idx) => (idx === i ? tpl : x)));
  }

  function deleteTemplate(i: number) {
    onChange(templates.filter((_, idx) => idx !== i));
    if (activeIdx === i) setActiveIdx(null);
  }

  const active = activeIdx !== null ? templates[activeIdx] : null;

  return (
    <div className="border-2 border-dashed border-cw-border rounded-lg mb-4">
      {/* Header toggle */}
      <button
        className="flex items-center justify-between w-full px-3 py-2 text-sm text-gray-500 hover:bg-gray-50 rounded-lg"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex items-center gap-2 font-medium">
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          {t('responseTpls', uiLang)}
          {templates.length > 0 && (
            <span className="text-xs bg-gray-200 text-gray-600 rounded-full px-1.5 py-0.5">
              {templates.length}
            </span>
          )}
        </span>
        <span
          className="text-xs text-cw-blue-light hover:underline"
          onClick={(e) => { e.stopPropagation(); addTemplate(); }}
        >
          {t('newResponseTpl', uiLang)}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 flex gap-3">
          {/* List */}
          <div className="w-40 shrink-0 space-y-1">
            {templates.length === 0 ? (
              <p className="text-xs text-gray-400 italic">{t('noResponseTpls', uiLang)}</p>
            ) : (
              templates.map((tpl, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between px-2 py-1 rounded cursor-pointer text-xs ${
                    activeIdx === i
                      ? 'bg-cw-blue text-white'
                      : 'hover:bg-gray-100 text-gray-700'
                  }`}
                  onClick={() => setActiveIdx(i)}
                >
                  <span className="truncate font-mono">{tpl.code || t('noCode', uiLang)}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteTemplate(i); }}
                    className={`ml-1 ${activeIdx === i ? 'text-white/70 hover:text-white' : 'text-gray-300 hover:text-red-500'}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))
            )}
            <button
              onClick={addTemplate}
              className="flex items-center gap-1 text-xs text-cw-blue-light hover:underline mt-1"
            >
              <PlusCircle className="w-3 h-3" /> {t('newTplBtn', uiLang)}
            </button>
          </div>

          {/* Detail */}
          {active !== null && activeIdx !== null && (
            <div className="flex-1 border border-cw-border rounded p-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('code', uiLang)}</label>
                  <input
                    value={active.code}
                    onChange={(e) => updateTemplate(activeIdx, { ...active, code: e.target.value })}
                    placeholder={t('templateCodePh', uiLang)}
                    className="w-full border border-cw-border rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('name', uiLang)}</label>
                  <input
                    value={active.name}
                    onChange={(e) => updateTemplate(activeIdx, { ...active, name: e.target.value })}
                    placeholder={t('templateNamePh', uiLang)}
                    className="w-full border border-cw-border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
                  />
                </div>
              </div>
              <OptionsEditorWithToggle
                options={active.options as TextOption[]}
                lang={lang}
                allLanguages={allLanguages}
                onChange={(opts) => updateTemplate(activeIdx, { ...active, options: opts as TextOption[] })}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Flatten all sections (recursively) into a single list */
function flattenSectionsClient(sections: Section[]): Section[] {
  const result: Section[] = [];
  const queue = [...sections];
  while (queue.length > 0) {
    const s = queue.shift()!;
    result.push(s);
    if (s.subSections) queue.push(...s.subSections);
  }
  return result;
}

/** Check if element is an editable form field */
function isEditableElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (['input', 'textarea', 'select'].includes(tag)) return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

/** Deep-clone a question, assigning a new id. Appends '-kopi' to code if the code
 *  already exists anywhere in the given all-codes set. */
function cloneQuestion(q: Question, allCodes: Set<string>): Question {
  const clone: Question = JSON.parse(JSON.stringify(q));
  clone.id = crypto.randomUUID();
  if (clone.code && allCodes.has(clone.code)) {
    clone.code = `${clone.code}-kopi`;
  }
  return clone;
}

/** Deep-clone a section with fresh ids on section and all questions */
function cloneSection(s: Section): Section {
  const clone: Section = JSON.parse(JSON.stringify(s));
  clone.id = crypto.randomUUID();
  clone.code = clone.code ? `${clone.code}-kopi` : '';
  clone.questions = clone.questions.map((q) => ({
    ...q,
    id: crypto.randomUUID(),
    code: q.code ? `${q.code}-kopi` : '',
  }));
  clone.subSections = (clone.subSections ?? []).map((sub) => ({
    ...sub,
    id: crypto.randomUUID(),
    code: sub.code ? `${sub.code}-kopi` : '',
    questions: sub.questions.map((q) => ({
      ...q,
      id: crypto.randomUUID(),
      code: q.code ? `${q.code}-kopi` : '',
    })),
  }));
  return clone;
}

/** Remove a question by id from a section tree, returning the updated sections array */
function removeQuestionById(sections: Section[], questionId: string): Section[] {
  return sections.map((s) => ({
    ...s,
    questions: s.questions.filter((q) => q.id !== questionId),
    subSections: s.subSections ? removeQuestionById(s.subSections, questionId) : undefined,
  }));
}

/** Add a question to the end of a specific section (by id) in the section tree */
function addQuestionToSection(sections: Section[], targetSectionId: string, question: Question): Section[] {
  return sections.map((s) => {
    if (s.id === targetSectionId) {
      return { ...s, questions: [...s.questions, question] };
    }
    if (s.subSections) {
      return { ...s, subSections: addQuestionToSection(s.subSections, targetSectionId, question) };
    }
    return s;
  });
}

const LANG_LABELS: Record<string, string> = {
  NO: 'Norsk', EN: 'English', SV: 'Svenska', DA: 'Dansk',
  FI: 'Suomi', DE: 'Deutsch', FR: 'Français', PL: 'Polski',
};

// ── Context menu component ────────────────────────────────────────────────────

function ContextMenu({
  menu,
  questionnaire,
  onClose,
  onCopyQuestion,
  onCutQuestion,
  onPasteOverQuestion,
  onDuplicateQuestion,
  onDeleteQuestion,
  onMoveQuestionToSection,
  onCopySection,
  onCutSection,
  onPasteSection,
  onDuplicateSection,
  onAddQuestionToSection,
  onAddSubSection,
  onDeleteSection,
  onGenerateCodesForSection,
  clipboardKind,
  lang,
}: {
  menu: ContextMenuState;
  questionnaire: Questionnaire;
  onClose: () => void;
  onCopyQuestion: (questionId: string) => void;
  onCutQuestion: (questionId: string, sectionId: string) => void;
  onPasteOverQuestion: (questionId: string, sectionId: string) => void;
  onDuplicateQuestion: (questionId: string, sectionId: string) => void;
  onDeleteQuestion: (questionId: string, sectionId: string) => void;
  onMoveQuestionToSection: (questionId: string, fromSectionId: string, toSectionId: string) => void;
  onCopySection: (sectionId: string) => void;
  onCutSection: (sectionId: string) => void;
  onPasteSection: () => void;
  onDuplicateSection: (sectionId: string) => void;
  onAddQuestionToSection: (sectionId: string, type: Question['type']) => void;
  onAddSubSection: (sectionId: string) => void;
  onDeleteSection: (sectionId: string) => void;
  onGenerateCodesForSection: (sectionId: string) => void;
  clipboardKind: 'question' | 'section' | null;
  lang: LanguageType;
}) {
  const uiLang = useUILang();
  const [moveOpen, setMoveOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const allFlatSections = flattenSectionsClient(questionnaire.sections);

  // Position the menu so it doesn't overflow the viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    zIndex: 9999,
    top: menu.y,
    left: menu.x,
  };

  function wrap(fn: () => void) {
    return () => { fn(); onClose(); };
  }

  const itemCls = 'flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-gray-100 transition-colors cursor-pointer';
  const redItemCls = `${itemCls} text-red-600 hover:bg-red-50`;
  const disabledCls = 'flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left text-gray-300 cursor-not-allowed';
  const sepCls = 'border-t border-gray-100 my-0.5';

  return (
    <div
      ref={menuRef}
      style={style}
      className="bg-white border border-cw-border rounded shadow-xl min-w-[180px] py-1 select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      {menu.kind === 'question' && menu.questionId && menu.sectionId && (
        <>
          <button
            className={itemCls}
            onClick={wrap(() => onCopyQuestion(menu.questionId!))}
          >
            <Copy className="w-3.5 h-3.5 text-gray-400" /> {t('copy', uiLang)}
          </button>
          <button
            className={itemCls}
            onClick={wrap(() => onCutQuestion(menu.questionId!, menu.sectionId!))}
          >
            <Scissors className="w-3.5 h-3.5 text-gray-400" /> {t('cut', uiLang)}
          </button>
          {clipboardKind === 'question' ? (
            <button
              className={itemCls}
              onClick={wrap(() => onPasteOverQuestion(menu.questionId!, menu.sectionId!))}
            >
              <Clipboard className="w-3.5 h-3.5 text-gray-400" /> {t('pasteOver', uiLang)}
            </button>
          ) : (
            <span className={disabledCls}>
              <Clipboard className="w-3.5 h-3.5" /> {t('pasteOver', uiLang)}
            </span>
          )}
          <div className={sepCls} />
          <button
            className={itemCls}
            onClick={wrap(() => onDuplicateQuestion(menu.questionId!, menu.sectionId!))}
          >
            <Copy className="w-3.5 h-3.5 text-gray-400" /> {t('duplicate', uiLang)}
          </button>
          {/* Move to section */}
          <div className="relative">
            <button
              className={itemCls}
              onClick={() => setMoveOpen((v) => !v)}
            >
              <ArrowRight className="w-3.5 h-3.5 text-gray-400" />
              {t('moveToSection', uiLang)}
              <ChevronRight className="w-3 h-3 text-gray-400 ml-auto" />
            </button>
            {moveOpen && (
              <div className="absolute left-full top-0 bg-white border border-cw-border rounded shadow-xl min-w-[160px] py-1 z-10">
                {allFlatSections
                  .filter((s) => s.id !== menu.sectionId)
                  .map((s) => (
                    <button
                      key={s.id}
                      className={itemCls}
                      onClick={wrap(() => onMoveQuestionToSection(menu.questionId!, menu.sectionId!, s.id))}
                    >
                      <span className="truncate">{s.titles[lang] || s.code || t('noTitle', uiLang)}</span>
                    </button>
                  ))}
                {allFlatSections.filter((s) => s.id !== menu.sectionId).length === 0 && (
                  <span className="px-3 py-1.5 text-xs text-gray-400 block">{t('noOtherSections', uiLang)}</span>
                )}
              </div>
            )}
          </div>
          <div className={sepCls} />
          <button
            className={redItemCls}
            onClick={wrap(() => onDeleteQuestion(menu.questionId!, menu.sectionId!))}
          >
            <Trash2 className="w-3.5 h-3.5" /> {t('deleteBtn', uiLang)}
          </button>
        </>
      )}

      {menu.kind === 'section' && menu.topSectionId && (
        <>
          <button
            className={itemCls}
            onClick={wrap(() => onCopySection(menu.topSectionId!))}
          >
            <Copy className="w-3.5 h-3.5 text-gray-400" /> {t('copySection', uiLang)}
          </button>
          <button
            className={itemCls}
            onClick={wrap(() => onCutSection(menu.topSectionId!))}
          >
            <Scissors className="w-3.5 h-3.5 text-gray-400" /> {t('cutSection', uiLang)}
          </button>
          {clipboardKind === 'section' ? (
            <button
              className={itemCls}
              onClick={wrap(() => onPasteSection())}
            >
              <Clipboard className="w-3.5 h-3.5 text-gray-400" /> {t('pasteSection', uiLang)}
            </button>
          ) : (
            <span className={disabledCls}>
              <Clipboard className="w-3.5 h-3.5" /> {t('pasteSection', uiLang)}
            </span>
          )}
          <div className={sepCls} />
          <button
            className={itemCls}
            onClick={wrap(() => onDuplicateSection(menu.topSectionId!))}
          >
            <Copy className="w-3.5 h-3.5 text-gray-400" /> {t('duplicateSection', uiLang)}
          </button>
          <button
            className={itemCls}
            onClick={wrap(() => onGenerateCodesForSection(menu.topSectionId!))}
          >
            <Hash className="w-3.5 h-3.5 text-gray-400" /> {t('generateCodes', uiLang)}
          </button>
          <div className={sepCls} />
          <button
            className={itemCls}
            onClick={wrap(() => onAddQuestionToSection(menu.topSectionId!, 'radiobutton'))}
          >
            <PlusCircle className="w-3.5 h-3.5 text-gray-400" /> {t('addQuestion', uiLang)}
          </button>
          <button
            className={itemCls}
            onClick={wrap(() => onAddSubSection(menu.topSectionId!))}
          >
            <PlusCircle className="w-3.5 h-3.5 text-gray-400" /> {t('addSubsection', uiLang)}
          </button>
          <div className={sepCls} />
          <button
            className={redItemCls}
            onClick={wrap(() => onDeleteSection(menu.topSectionId!))}
          >
            <Trash2 className="w-3.5 h-3.5" /> {t('deleteSection', uiLang)}
          </button>
        </>
      )}
    </div>
  );
}

// ── QuestionnaireEditor (root) ────────────────────────────────────────────────

export function QuestionnaireEditor({ questionnaire, onChange, navigateToElementId, mediaFiles = [], onToggleValidation }: Props) {
  const lang = questionnaire.defaultLanguage;
  const uiLang = useUILang();
  const [previewLang, setPreviewLang] = useState<LanguageType>(questionnaire.defaultLanguage);
  const [generateToast, setGenerateToast] = useState<string | null>(null);
  const [generateMenuOpen, setGenerateMenuOpen] = useState(false);
  const availableLangs = questionnaire.supportedLanguages.length > 0
    ? questionnaire.supportedLanguages
    : [questionnaire.defaultLanguage];

  // ── Clipboard ─────────────────────────────────────────────────────────────
  const clipboard = useClipboardStore();

  // ── Selection state ───────────────────────────────────────────────────────
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

  // Navigate to element when triggered externally (e.g. from ValidationNavigator)
  useEffect(() => {
    if (!navigateToElementId) return;
    const { id } = navigateToElementId;
    setSelectedElementId(id);

    // Sections expand in a cascade of renders over multiple React cycles.
    // Scroll at increasing delays so we catch the element after each expansion level.
    let cancelled = false;

    const timers = [0, 60, 180, 400].map((delay) =>
      setTimeout(() => {
        if (cancelled) return;
        const el = document.querySelector(`[data-element-id="${id}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, delay),
    );

    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, [navigateToElementId]);
  // Track which section a selected question lives in (for cut/copy shortcut)
  const selectedSectionIdRef = useRef<string | null>(null);

  // ── Context menu state ────────────────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // ── Validation (runs on every questionnaire change) ───────────────────────
  const validationIssues: ValidationIssue[] = useMemo(
    () => validateQuestionnaire(questionnaire, uiLang),
    [questionnaire, uiLang],
  );
  const errorCount = validationIssues.filter((i) => i.severity === 'error').length;
  const warningCount = validationIssues.filter((i) => i.severity === 'warning').length;
  const hasIssues = validationIssues.length > 0;

  // ── All question codes (for paste dedup) ─────────────────────────────────
  const allQuestionCodes = useMemo(() => {
    const codes = new Set<string>();
    flattenSectionsClient(questionnaire.sections).forEach((s) =>
      s.questions.forEach((q) => { if (q.code) codes.add(q.code); })
    );
    return codes;
  }, [questionnaire.sections]);

  // ── Generate codes handler ────────────────────────────────────────────────
  function handleGenerateCodesForSection(sectionId: string) {
    // Run fill-only on the whole questionnaire so counters skip all existing codes
    const { questionnaire: newQ } = generateCodes(questionnaire, { overwrite: false });

    // Replace only the target section (recursively); leave everything else untouched
    function splice(origSections: Section[], newSections: Section[]): Section[] {
      return origSections.map((orig, i) => {
        const newS = newSections[i];
        if (orig.id === sectionId) return newS;
        if (orig.subSections?.length)
          return { ...orig, subSections: splice(orig.subSections, newS.subSections ?? []) };
        return orig;
      });
    }

    // Count empty codes in the target section before generation
    function countEmpty(s: Section): number {
      let n = s.code ? 0 : 1;
      n += s.questions.filter((q) => !q.code).length;
      (s.subSections ?? []).forEach((sub) => { n += countEmpty(sub); });
      return n;
    }

    // Find the target section in the original
    function findSection(sections: Section[]): Section | null {
      for (const s of sections) {
        if (s.id === sectionId) return s;
        const found = findSection(s.subSections ?? []);
        if (found) return found;
      }
      return null;
    }

    const targetOrig = findSection(questionnaire.sections);
    const count = targetOrig ? countEmpty(targetOrig) : 0;

    onChange({ ...questionnaire, sections: splice(questionnaire.sections, newQ.sections) });

    const msg = count > 0
      ? `${count} ${t('codesForSectionFrag', uiLang)}`
      : (t('noEmptyCodes', uiLang));
    setGenerateToast(msg);
    setTimeout(() => setGenerateToast(null), 3000);
  }

  function handleGenerateCodes(overwrite = false) {
    const result = generateCodes(questionnaire, { overwrite });
    onChange(result.questionnaire);
    const written = result.count;
    const skipped = result.skipped;
    const msg = overwrite
      ? `${written} ${t('codesOverwrittenFrag', uiLang)}`
      : skipped > 0
        ? `${written} ${t('codesAddedFrag', uiLang)}, ${skipped} ${t('keptWord', uiLang)}`
        : `${written} ${t('codesGenerated', uiLang)}`;
    setGenerateToast(msg);
    setGenerateMenuOpen(false);
    setTimeout(() => setGenerateToast(null), 3000);
  }

  // Build inverted map: questionCode → dimensionCode[]
  const dimensionMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const dim of (questionnaire.dimensions ?? []) as Dimension[]) {
      for (const qCode of dim.questionCodes) {
        const existing = map.get(qCode) ?? [];
        existing.push(dim.code);
        map.set(qCode, existing);
      }
    }
    return map;
  }, [questionnaire.dimensions]);

  // Flat list of all questions across the full section tree (for expression dropdowns)
  const allQuestions: Question[] = useMemo(
    () => flattenSectionsClient(questionnaire.sections).flatMap((s) => s.questions),
    [questionnaire.sections],
  );

  // File names of media files available in the package (for image question editor)
  const mediaCodes: string[] = useMemo(
    () => mediaFiles.map((m) => m.fileName),
    [mediaFiles],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const [importTextOpen, setImportTextOpen] = useState(false);

  // ── Resizable preview panel ───────────────────────────────────────────────
  const [previewWidth, setPreviewWidth] = useState(420);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  const handlePreviewDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragStartX.current = e.clientX;
    dragStartWidth.current = previewWidth;

    function onMove(ev: MouseEvent) {
      const delta = dragStartX.current - ev.clientX;
      setPreviewWidth(Math.max(200, Math.min(900, dragStartWidth.current + delta)));
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [previewWidth]);

  function handleSectionDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIdx = questionnaire.sections.findIndex((s) => s.id === active.id);
      const newIdx = questionnaire.sections.findIndex((s) => s.id === over.id);
      onChange({
        ...questionnaire,
        sections: arrayMove(questionnaire.sections, oldIdx, newIdx),
      });
    }
  }

  function addSection() {
    const section: Section = {
      id: crypto.randomUUID(),
      type: 'NORMAL',
      titles: { [lang]: '' } as Record<LanguageType, string>,
      questions: [],
    };
    onChange({ ...questionnaire, sections: [...questionnaire.sections, section] });
  }

  function updateSection(i: number, s: Section) {
    onChange({
      ...questionnaire,
      sections: questionnaire.sections.map((x, idx) => (idx === i ? s : x)),
    });
  }

  function deleteSection(i: number) {
    onChange({
      ...questionnaire,
      sections: questionnaire.sections.filter((_, idx) => idx !== i),
    });
  }

  function duplicateSection(i: number) {
    const original = questionnaire.sections[i];
    const clone = cloneSection(original);
    const next = [...questionnaire.sections];
    next.splice(i + 1, 0, clone);
    onChange({ ...questionnaire, sections: next });
  }

  // ── Context menu handlers ─────────────────────────────────────────────────

  function handleQuestionContextMenu(e: React.MouseEvent, questionId: string, sectionId: string) {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ kind: 'question', x: e.clientX, y: e.clientY, questionId, sectionId });
  }

  function handleSectionContextMenu(e: React.MouseEvent, sectionId: string) {
    e.preventDefault();
    setContextMenu({ kind: 'section', x: e.clientX, y: e.clientY, topSectionId: sectionId });
  }

  function closeContextMenu() {
    setContextMenu(null);
  }

  // ── Clipboard operations ──────────────────────────────────────────────────

  function findQuestionById(qId: string): Question | null {
    for (const s of flattenSectionsClient(questionnaire.sections)) {
      const q = s.questions.find((x) => x.id === qId);
      if (q) return q;
    }
    return null;
  }

  function findSectionById(sId: string): Section | null {
    return flattenSectionsClient(questionnaire.sections).find((s) => s.id === sId) ?? null;
  }

  function handleCopyQuestion(questionId: string) {
    const q = findQuestionById(questionId);
    if (q) clipboard.copy({ kind: 'question', data: JSON.parse(JSON.stringify(q)) });
  }

  function handleCutQuestion(questionId: string, sectionId: string) {
    const q = findQuestionById(questionId);
    if (q) {
      clipboard.cut({ kind: 'question', data: JSON.parse(JSON.stringify(q)) });
      // Remove from source immediately so the user sees it gone
      onChange({ ...questionnaire, sections: removeQuestionById(questionnaire.sections, questionId) });
      if (selectedElementId === questionId) setSelectedElementId(null);
    }
  }

  function handlePasteQuestion(targetSectionId: string) {
    if (!clipboard.item || clipboard.item.kind !== 'question') return;
    const pasted = cloneQuestion(clipboard.item.data, allQuestionCodes);
    let nextSections = addQuestionToSection(questionnaire.sections, targetSectionId, pasted);
    if (clipboard.isCut) {
      // Remove original — but only if id differs (cut already removed it above, this is cross-tab paste)
      nextSections = removeQuestionById(nextSections, clipboard.item.data.id);
      clipboard.clear();
    }
    onChange({ ...questionnaire, sections: nextSections });
  }

  function handlePasteOverQuestion(questionId: string, sectionId: string) {
    if (!clipboard.item || clipboard.item.kind !== 'question') return;
    const pasted = cloneQuestion(clipboard.item.data, allQuestionCodes);
    // Insert pasted item before the target question, then remove the target
    const newSections = questionnaire.sections.map((s) => {
      if (s.id === sectionId) {
        const idx = s.questions.findIndex((q) => q.id === questionId);
        if (idx === -1) return s;
        const qs = [...s.questions];
        qs.splice(idx, 0, pasted);
        return { ...s, questions: qs.filter((q) => q.id !== questionId) };
      }
      return s;
    });
    if (clipboard.isCut) {
      clipboard.clear();
    }
    onChange({ ...questionnaire, sections: newSections });
  }

  function handleDuplicateQuestion(questionId: string, sectionId: string) {
    const flatSections = flattenSectionsClient(questionnaire.sections);
    const sec = flatSections.find((s) => s.id === sectionId);
    if (!sec) return;
    const idx = sec.questions.findIndex((q) => q.id === questionId);
    if (idx === -1) return;
    const clone = cloneQuestion(sec.questions[idx], allQuestionCodes);
    if (!clone.code && sec.questions[idx].code) clone.code = `${sec.questions[idx].code}-kopi`;

    function dupInSections(sections: Section[]): Section[] {
      return sections.map((s) => {
        if (s.id === sectionId) {
          const qs = [...s.questions];
          qs.splice(idx + 1, 0, clone);
          return { ...s, questions: qs };
        }
        if (s.subSections) return { ...s, subSections: dupInSections(s.subSections) };
        return s;
      });
    }
    onChange({ ...questionnaire, sections: dupInSections(questionnaire.sections) });
  }

  function handleDeleteQuestion(questionId: string, _sectionId: string) {
    if (!window.confirm(t('deleteQuestionConfirm', uiLang))) return;
    onChange({ ...questionnaire, sections: removeQuestionById(questionnaire.sections, questionId) });
    if (selectedElementId === questionId) setSelectedElementId(null);
  }

  function handleMoveQuestionToSection(questionId: string, fromSectionId: string, toSectionId: string) {
    const q = findQuestionById(questionId);
    if (!q) return;
    let next = removeQuestionById(questionnaire.sections, questionId);
    next = addQuestionToSection(next, toSectionId, q);
    onChange({ ...questionnaire, sections: next });
  }

  function handleCopySection(sectionId: string) {
    const s = findSectionById(sectionId);
    if (s) clipboard.copy({ kind: 'section', data: JSON.parse(JSON.stringify(s)) });
  }

  function handleCutSection(sectionId: string) {
    const s = findSectionById(sectionId);
    if (s) {
      clipboard.cut({ kind: 'section', data: JSON.parse(JSON.stringify(s)) });
      // Remove immediately
      const idx = questionnaire.sections.findIndex((sec) => sec.id === sectionId);
      if (idx !== -1) deleteSection(idx);
    }
  }

  function handlePasteSection() {
    if (!clipboard.item || clipboard.item.kind !== 'section') return;
    const clone = cloneSection(clipboard.item.data);
    if (clipboard.isCut) clipboard.clear();
    onChange({ ...questionnaire, sections: [...questionnaire.sections, clone] });
  }

  function handleDuplicateSection(sectionId: string) {
    const idx = questionnaire.sections.findIndex((s) => s.id === sectionId);
    if (idx === -1) return;
    duplicateSection(idx);
  }

  function handleAddQuestionToSection(sectionId: string, type: Question['type']) {
    const q = newQuestion(type);
    onChange({ ...questionnaire, sections: addQuestionToSection(questionnaire.sections, sectionId, q) });
  }

  function handleAddSubSection(sectionId: string) {
    const sub: Section = {
      id: crypto.randomUUID(),
      type: 'NORMAL',
      titles: {} as Record<LanguageType, string>,
      questions: [],
    };
    function addSub(sections: Section[]): Section[] {
      return sections.map((s) => {
        if (s.id === sectionId) return { ...s, subSections: [...(s.subSections ?? []), sub] };
        if (s.subSections) return { ...s, subSections: addSub(s.subSections) };
        return s;
      });
    }
    onChange({ ...questionnaire, sections: addSub(questionnaire.sections) });
  }

  function handleDeleteSection(sectionId: string) {
    if (!window.confirm(t('deleteSectionConfirm', uiLang))) return;
    const idx = questionnaire.sections.findIndex((s) => s.id === sectionId);
    if (idx !== -1) deleteSection(idx);
  }

  // ── Keyboard shortcuts + Delete key ──────────────────────────────────────

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Close context menu on Escape
      if (e.key === 'Escape') {
        setContextMenu(null);
        setSelectedElementId(null);
        return;
      }

      // Close context menu on any other key too (if open)
      if (contextMenu) {
        setContextMenu(null);
      }

      // Don't intercept when focus is inside a form field
      if (isEditableElement(document.activeElement)) return;

      // Delete selected question
      if (e.key === 'Delete' && selectedElementId) {
        e.preventDefault();
        const sectionId = selectedSectionIdRef.current;
        if (!sectionId) return;
        if (!window.confirm(t('deleteQuestionConfirm', uiLang))) return;
        onChange({ ...questionnaire, sections: removeQuestionById(questionnaire.sections, selectedElementId) });
        setSelectedElementId(null);
        return;
      }

      // Ctrl+C / Cmd+C
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selectedElementId) {
        e.preventDefault();
        handleCopyQuestion(selectedElementId);
        return;
      }

      // Ctrl+X / Cmd+X
      if ((e.ctrlKey || e.metaKey) && e.key === 'x' && selectedElementId) {
        e.preventDefault();
        const sectionId = selectedSectionIdRef.current;
        if (sectionId) handleCutQuestion(selectedElementId, sectionId);
        return;
      }

      // Ctrl+V / Cmd+V  — paste to the section of the selected question, or first section
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        if (!clipboard.item || clipboard.item.kind !== 'question') return;
        e.preventDefault();
        const targetSectionId = selectedSectionIdRef.current ?? questionnaire.sections[0]?.id;
        if (targetSectionId) handlePasteQuestion(targetSectionId);
        return;
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedElementId, questionnaire, contextMenu, clipboard.item, uiLang]);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    function handleClick() { setContextMenu(null); }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [contextMenu]);

  // Track which section the selected question lives in
  function handleSelectQuestion(qId: string, sectionId: string) {
    setSelectedElementId(qId);
    selectedSectionIdRef.current = sectionId;
  }

  // We need to pass a per-section onSelectQuestion wrapper. To do that cleanly we
  // thread a combined handler through SectionEditor.
  // The SectionEditor receives onSelectQuestion(id) but we need the sectionId too.
  // We solve this by intercepting at the onQuestionContextMenu level for the sectionId,
  // and at onSelect we also update the ref via a closure in the render.

  const clipboardKind: 'question' | 'section' | null = clipboard.item?.kind ?? null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Generate codes toast ── */}
      {generateToast && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-50 bg-gray-800 text-white text-xs px-3 py-1.5 rounded shadow-lg pointer-events-none select-none">
          {generateToast}
        </div>
      )}

      {/* ── Questionnaire metadata ── */}
      <div className="bg-white border-b border-cw-border px-4 py-3 shrink-0">
        {/* Toolbar row: generate-codes + validation badge */}
        <div className="flex items-center gap-2 mb-2.5">
          {/* Split button: main = fill empty, dropdown = overwrite all */}
          <div className="relative flex shrink-0">
            <button
              onClick={() => handleGenerateCodes(false)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-l border border-cw-border bg-white hover:bg-gray-50 hover:border-cw-blue-light text-gray-600 hover:text-cw-blue transition-colors"
              title={t('fillEmptyCodesTitle', uiLang)}
            >
              <Hash className="w-3.5 h-3.5" />
              {t('generateCodes', uiLang)}
            </button>
            <button
              onClick={() => setGenerateMenuOpen((v) => !v)}
              className="flex items-center px-1.5 py-1 text-xs rounded-r border border-l-0 border-cw-border bg-white hover:bg-gray-50 text-gray-400 hover:text-cw-blue transition-colors"
              title={t('moreOptions', uiLang)}
            >
              <ChevronDown className="w-3 h-3" />
            </button>
            {generateMenuOpen && (
              <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-cw-border rounded shadow-md min-w-[180px]">
                <button
                  onClick={() => handleGenerateCodes(false)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 text-gray-700"
                >
                  <span className="font-medium block">{t('fillEmptyCodes', uiLang)}</span>
                  <span className="text-gray-400">{t('keepExisting', uiLang)}</span>
                </button>
                <div className="border-t border-cw-border" />
                <button
                  onClick={() => handleGenerateCodes(true)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-red-50 text-red-600"
                >
                  <span className="font-medium block">{t('overwriteAllCodes', uiLang)}</span>
                  <span className="text-red-400">{t('replacesExisting', uiLang)}</span>
                </button>
              </div>
            )}
          </div>

          <div className="flex-1" />

          {hasIssues ? (
            <button
              onClick={() => onToggleValidation?.()}
              className="flex items-center gap-2 px-2.5 py-1 text-xs rounded border bg-white hover:bg-gray-50 transition-colors shrink-0"
              style={{ borderColor: errorCount > 0 ? '#ef4444' : '#f59e0b' }}
              title={t('showValidationIssues', uiLang)}
            >
              {errorCount > 0 && (
                <span className="flex items-center gap-1 text-red-500 font-medium">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {countPhrase(errorCount, uiLang, 'nErrorOne', 'nErrorMany')}
                </span>
              )}
              {errorCount > 0 && warningCount > 0 && <span className="text-gray-300">|</span>}
              {warningCount > 0 && (
                <span className="flex items-center gap-1 text-amber-500 font-medium">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {countPhrase(warningCount, uiLang, 'nWarningOne', 'nWarningMany')}
                </span>
              )}
            </button>
          ) : (
            <span className="text-xs text-green-600 font-medium px-1">
              {t('noProblems', uiLang)}
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('code', uiLang)}</label>
            <input
              type="text"
              value={questionnaire.code}
              onChange={(e) => onChange({ ...questionnaire, code: e.target.value })}
              className="w-full border border-cw-border rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
              placeholder={t('assessmentCodePh', uiLang)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('name', uiLang)} ({lang})</label>
            <input
              type="text"
              value={questionnaire.name[lang] ?? ''}
              onChange={(e) =>
                onChange({ ...questionnaire, name: { ...questionnaire.name, [lang]: e.target.value } })
              }
              className="w-full border border-cw-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
              placeholder={t('assessmentNameFieldPh', uiLang)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('version', uiLang)}</label>
            <input
              type="text"
              value={questionnaire.version}
              onChange={(e) => onChange({ ...questionnaire, version: e.target.value })}
              className="w-full border border-cw-border rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
              placeholder="1.0"
            />
          </div>
        </div>
      </div>

      {/* ── Split: Editor | Preview ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left: editor */}
        <div
          className="flex-1 overflow-auto p-4 min-w-0"
          onClick={() => {
            // Clicking empty space in the editor clears context menu
            if (contextMenu) setContextMenu(null);
          }}
        >
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleSectionDragEnd}
          >
            <SortableContext
              items={questionnaire.sections.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              {questionnaire.sections.map((section, i) => (
                <SortableSectionEditor
                  key={section.id}
                  id={section.id}
                  section={section}
                  lang={lang}
                  allLanguages={availableLangs}
                  dimensionMap={dimensionMap}
                  allQuestions={allQuestions}
                  responseTemplates={questionnaire.responseTemplates?.templates ?? []}
                  mediaCodes={mediaCodes}
                  onChange={(s) => updateSection(i, s)}
                  onDelete={() => deleteSection(i)}
                  onDuplicate={() => duplicateSection(i)}
                  onChangeTemplates={(templates) =>
                    onChange({ ...questionnaire, responseTemplates: { templates } })
                  }
                  validationIssues={validationIssues}
                  sectionIndex={i}
                  selectedElementId={selectedElementId}
                  onSelectQuestion={(qId) => {
                    setSelectedElementId(qId);
                    selectedSectionIdRef.current = section.id;
                  }}
                  onQuestionContextMenu={handleQuestionContextMenu}
                  onSectionContextMenu={handleSectionContextMenu}
                  allSections={questionnaire.sections}
                  onMoveQuestionToSection={handleMoveQuestionToSection}
                  onPasteQuestion={handlePasteQuestion}
                  clipboardKind={clipboardKind}
                />
              ))}
            </SortableContext>
          </DndContext>

          <div className="flex gap-2 mb-4">
            <button
              onClick={addSection}
              className="flex items-center justify-center gap-2 flex-1 border-2 border-dashed border-cw-border rounded-lg py-3 text-sm text-gray-400 hover:border-cw-blue-light hover:text-cw-blue-light transition-colors"
            >
              <PlusCircle className="w-4 h-4" />
              <span>{t('addSection', uiLang)}</span>
            </button>
            <button
              onClick={() => setImportTextOpen(true)}
              className="flex items-center justify-center gap-2 border-2 border-dashed border-cw-border rounded-lg py-3 px-4 text-sm text-gray-400 hover:border-cw-blue-light hover:text-cw-blue-light transition-colors"
              title={t('importTextsTitle', uiLang)}
            >
              <FileText className="w-4 h-4" />
              <span>{t('importTexts', uiLang)}</span>
            </button>
            {/* Paste section button */}
            {clipboardKind === 'section' && (
              <button
                onClick={handlePasteSection}
                className="flex items-center justify-center gap-2 border-2 border-dashed border-cw-blue-light rounded-lg py-3 px-4 text-sm text-cw-blue-light hover:bg-blue-50 transition-colors"
                title={t('pasteSectionTitle', uiLang)}
              >
                <Clipboard className="w-4 h-4" />
                <span>{t('pasteSection', uiLang)}</span>
              </button>
            )}
          </div>

          <ImportTextDialog
            open={importTextOpen}
            questionnaire={questionnaire}
            onClose={() => setImportTextOpen(false)}
            onImport={(updated) => {
              onChange(updated);
              setImportTextOpen(false);
            }}
          />

          {/* Response templates panel */}
          <div id="response-templates-section">
          <ResponseTemplatesEditor
            templates={questionnaire.responseTemplates?.templates ?? []}
            lang={lang}
            allLanguages={availableLangs}
            onChange={(templates) =>
              onChange({ ...questionnaire, responseTemplates: { templates } })
            }
          />
          </div>
        </div>

        {/* Drag handle */}
        <div
          onMouseDown={handlePreviewDragStart}
          className="w-1.5 shrink-0 cursor-col-resize bg-cw-border hover:bg-cw-blue transition-colors"
          title={t('dragResize', uiLang)}
        />

        {/* Right: Checkware preview */}
        <div style={{ width: previewWidth }} className="shrink-0 border-l border-cw-border flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-cw-border bg-white shrink-0 flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex-1">
              {t('previewPanel', uiLang)}
              <span className="ml-2 normal-case tracking-normal font-normal">{t('previewHint', uiLang)}</span>
            </span>
            {availableLangs.length > 1 && (
              <select
                value={previewLang}
                onChange={(e) => setPreviewLang(e.target.value as LanguageType)}
                className="text-xs border border-cw-border rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
                title={t('selectPreviewLang', uiLang)}
              >
                {availableLangs.map((l) => (
                  <option key={l} value={l}>{LANG_LABELS[l] ?? l}</option>
                ))}
              </select>
            )}
          </div>
          <div className="flex-1 overflow-hidden">
            <AssessmentPreview questionnaire={questionnaire} lang={previewLang} />
          </div>
        </div>

      </div>


      {/* ── Context menu ── */}
      {contextMenu && (
        <ContextMenu
          menu={contextMenu}
          questionnaire={questionnaire}
          onClose={closeContextMenu}
          onCopyQuestion={handleCopyQuestion}
          onCutQuestion={handleCutQuestion}
          onPasteOverQuestion={handlePasteOverQuestion}
          onDuplicateQuestion={handleDuplicateQuestion}
          onDeleteQuestion={handleDeleteQuestion}
          onMoveQuestionToSection={handleMoveQuestionToSection}
          onCopySection={handleCopySection}
          onCutSection={handleCutSection}
          onPasteSection={handlePasteSection}
          onDuplicateSection={handleDuplicateSection}
          onAddQuestionToSection={handleAddQuestionToSection}
          onAddSubSection={handleAddSubSection}
          onDeleteSection={handleDeleteSection}
          onGenerateCodesForSection={handleGenerateCodesForSection}
          clipboardKind={clipboardKind}
          lang={lang}
        />
      )}
    </div>
  );
}
