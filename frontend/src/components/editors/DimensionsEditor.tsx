import { useState, useMemo, useEffect } from 'react';
import { Copy, PlusCircle, Trash2, LayoutGrid, ChevronDown, ChevronRight } from 'lucide-react';
import type { Questionnaire, Dimension, Section, Question } from '../../types/questionnaire';
import { t, countPhrase, copyCode, useUILang } from '../../i18n';
import { ItemContextMenu } from './ItemContextMenu';

function flattenQuestions(sections: Section[]): Question[] {
  const result: Question[] = [];
  const stack = [...sections];
  while (stack.length > 0) {
    const s = stack.pop()!;
    for (const q of s.questions) result.push(q);
    if (s.subSections?.length) {
      for (let i = s.subSections.length - 1; i >= 0; i--) stack.push(s.subSections[i]);
    }
  }
  return result;
}

interface Props {
  questionnaire: Questionnaire;
  onChange: (q: Questionnaire) => void;
}

function newDimension(): Dimension {
  return { code: '', name: '', questionCodes: [] };
}

function DimensionCard({
  dim,
  idx,
  allQuestions,
  onChange,
  onDelete,
}: {
  dim: Dimension;
  idx: number;
  allQuestions: Question[];
  onChange: (d: Dimension) => void;
  onDelete: () => void;
}) {
  const uiLang = useUILang();
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    function handler(e: Event) {
      if ((e as CustomEvent<{ index: number }>).detail.index === idx) setExpanded(true);
    }
    window.addEventListener('select-dimension', handler);
    return () => window.removeEventListener('select-dimension', handler);
  }, [idx]);
  const [filter, setFilter] = useState('');

  // O(1) lookup for checked state
  const selectedSet = useMemo(() => new Set(dim.questionCodes), [dim.questionCodes]);

  const filtered = useMemo(
    () => allQuestions.filter((q) => !filter || q.code.toLowerCase().includes(filter.toLowerCase())),
    [allQuestions, filter],
  );

  function toggleQuestion(code: string) {
    const next = selectedSet.has(code)
      ? dim.questionCodes.filter((c) => c !== code)
      : [...dim.questionCodes, code];
    onChange({ ...dim, questionCodes: next });
  }

  return (
    <div className="bg-white border border-cw-border rounded-lg overflow-hidden">
      {/* Header — always visible */}
      <div className="flex items-center gap-2 px-3 py-2 hover:bg-cw-gray cursor-pointer select-none"
           onClick={() => setExpanded((e) => !e)}>
        {expanded
          ? <ChevronDown className="w-3.5 h-3.5 text-cw-gray-text shrink-0" />
          : <ChevronRight className="w-3.5 h-3.5 text-cw-gray-text shrink-0" />}
        <span className="font-mono text-sm font-semibold text-cw-blue min-w-0 truncate">
          {dim.code || <span className="text-cw-gray-text font-normal italic">{t('newDimPH', uiLang)}</span>}
        </span>
        {dim.name && <span className="text-xs text-cw-gray-text truncate flex-1">{dim.name}</span>}
        <span className="text-xs text-cw-gray-text shrink-0">{dim.questionCodes.length} {t('questionsQ', uiLang)}</span>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1 rounded text-cw-gray-text hover:text-cw-negative hover:bg-cw-negative-soft transition-colors shrink-0"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Body — only rendered when expanded */}
      {expanded && (
        <div className="border-t border-cw-border p-4 flex flex-col gap-3">
          {/* Code + name fields */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-cw-gray-text mb-1">{t('code', uiLang)}</label>
              <input
                value={dim.code}
                onChange={(e) => onChange({ ...dim, code: e.target.value })}
                placeholder="DIM_CODE"
                className="w-full border border-cw-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cw-blue/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-cw-gray-text mb-1">{t('name', uiLang)}</label>
              <input
                value={dim.name}
                onChange={(e) => onChange({ ...dim, name: e.target.value })}
                placeholder={t('dimensionNamePh', uiLang)}
                className="w-full border border-cw-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cw-blue/30"
              />
            </div>
          </div>

          {/* Question assignment */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-cw-gray-text">
                {t('tabQuiz', uiLang)} ({dim.questionCodes.length} {t('selectedWord', uiLang)})
              </label>
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={t('filterCodes', uiLang)}
                className="text-xs border border-cw-border rounded px-2 py-1 w-32 focus:outline-none focus:ring-2 focus:ring-cw-blue/30"
              />
            </div>
            <div className="border border-cw-border rounded max-h-48 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="text-xs text-cw-gray-text p-2 text-center">{t('noQuestions', uiLang)}</p>
              ) : (
                <div className="grid grid-cols-2 gap-0">
                  {filtered.map((q) => {
                    const checked = selectedSet.has(q.code);
                    return (
                      <label
                        key={q.code}
                        className={`flex items-center gap-1.5 px-2 py-1 text-xs cursor-pointer hover:bg-cw-gray ${checked ? 'bg-cw-blue-soft' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleQuestion(q.code)}
                          className="w-3 h-3 accent-cw-blue"
                        />
                        <span className="font-mono truncate">{q.code}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Selected pills */}
          {dim.questionCodes.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {dim.questionCodes.map((code) => (
                <span
                  key={code}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-cw-blue/10 text-cw-blue text-xs rounded-full font-mono"
                >
                  {code}
                  <button onClick={() => toggleQuestion(code)} className="hover:text-cw-negative" title={t('remove', uiLang)}>×</button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function DimensionsEditor({ questionnaire, onChange }: Props) {
  const uiLang = useUILang();
  const dims = questionnaire.dimensions ?? [];
  const allQuestions = useMemo(
    () => flattenQuestions(questionnaire.sections).filter((q) => q.type !== 'text'),
    [questionnaire.sections],
  );

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; idx: number } | null>(null);

  function updateDim(idx: number, d: Dimension) {
    const next = dims.map((x, i) => (i === idx ? d : x));
    onChange({ ...questionnaire, dimensions: next });
  }

  function deleteDim(idx: number) {
    onChange({ ...questionnaire, dimensions: dims.filter((_, i) => i !== idx) });
  }

  function dupDim(idx: number) {
    const src = dims[idx];
    const dup: Dimension = { ...src, code: copyCode(src.code, uiLang), questionCodes: [...src.questionCodes] };
    const next = [...dims];
    next.splice(idx + 1, 0, dup);
    onChange({ ...questionnaire, dimensions: next });
  }

  function addDim() {
    onChange({ ...questionnaire, dimensions: [...dims, newDimension()] });
  }

  useEffect(() => {
    function handler(e: Event) {
      const idx = (e as CustomEvent<{ index: number }>).detail.index;
      setTimeout(() => {
        document.getElementById(`dim-item-${idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    }
    window.addEventListener('select-dimension', handler);
    return () => window.removeEventListener('select-dimension', handler);
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden min-w-0 min-h-0">
      <div className="bg-white border-b border-cw-border px-4 py-3 shrink-0 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-cw-blue flex items-center gap-2">
            <LayoutGrid className="w-4 h-4" /> {t('dimsHeader', uiLang)}
          </h2>
          <p className="text-xs text-cw-gray-text mt-0.5">
            {countPhrase(dims.length, uiLang, 'nDimensionOne', 'nDimensionMany')}
            {' · '}{allQuestions.length} {t('availableQuestions', uiLang)}
          </p>
        </div>
        <button
          onClick={addDim}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-cw-blue text-white rounded hover:bg-cw-blue-light transition-colors"
        >
          <PlusCircle className="w-3.5 h-3.5" /> {t('newDimBtn', uiLang)}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {dims.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-cw-gray-text gap-3">
            <LayoutGrid className="w-10 h-10 opacity-30" />
            <p className="text-sm">{t('noDims', uiLang)}</p>
            <button
              onClick={addDim}
              className="text-xs px-3 py-1.5 border border-cw-border rounded hover:bg-cw-gray"
            >
              {t('addDimBtn', uiLang)}
            </button>
          </div>
        ) : (
          <div className="grid gap-3 max-w-3xl">
            {dims.map((dim, idx) => (
              <div
                key={idx}
                id={`dim-item-${idx}`}
                onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, idx }); }}
              >
                <DimensionCard
                  dim={dim}
                  idx={idx}
                  allQuestions={allQuestions}
                  onChange={(d) => updateDim(idx, d)}
                  onDelete={() => deleteDim(idx)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
      {ctxMenu && (
        <ItemContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          items={[
            { label: t('duplicate', uiLang), icon: <Copy className="w-3.5 h-3.5 text-cw-gray-text" />, onClick: () => dupDim(ctxMenu.idx) },
            { separator: true },
            { label: t('deleteBtn', uiLang), icon: <Trash2 className="w-3.5 h-3.5" />, onClick: () => deleteDim(ctxMenu.idx), danger: true },
          ]}
        />
      )}
    </div>
  );
}
