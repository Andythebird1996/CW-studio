import { useState, useEffect } from 'react';
import { Copy, PlusCircle, Trash2, Flag as FlagIcon } from 'lucide-react';
import type { Questionnaire, Flag, FlagCondition, FlagType } from '../../types/questionnaire';
import { t, useUILang } from '../../i18n';
import { ItemContextMenu } from './ItemContextMenu';

interface Props {
  questionnaire: Questionnaire;
  onChange: (q: Questionnaire) => void;
}

const FLAG_TYPE_VALUES: Array<{ value: FlagType; color: string; bg: string }> = [
  { value: 'INFO',     color: 'text-blue-700',   bg: 'bg-blue-100'   },
  { value: 'WARNING',  color: 'text-yellow-700', bg: 'bg-yellow-100' },
  { value: 'CRITICAL', color: 'text-red-700',    bg: 'bg-red-100'    },
];

const OPERATORS: Array<{ value: FlagCondition['operator']; label: string }> = [
  { value: 'GTE', label: '>=' },
  { value: 'GT',  label: '>'  },
  { value: 'LTE', label: '<=' },
  { value: 'LT',  label: '<'  },
  { value: 'EQ',  label: '='  },
  { value: 'NEQ', label: '≠'  },
];

function flagColor(type: FlagType) {
  return FLAG_TYPE_VALUES.find((f) => f.value === type) ?? FLAG_TYPE_VALUES[0];
}

function getFlagTypeLabel(type: FlagType, lang: ReturnType<typeof useUILang>): string {
  if (type === 'WARNING') return t('flagWarning', lang);
  if (type === 'CRITICAL') return t('flagCritical', lang);
  return t('flagInfo', lang);
}

function newFlag(): Flag {
  return { code: '', name: '', type: 'WARNING', conditions: [], logic: 'AND' };
}

function newCondition(): FlagCondition {
  return { calculationCode: '', operator: 'GTE', threshold: 0 };
}

function ConditionRow({
  cond,
  calcCodes,
  onChange,
  onDelete,
}: {
  cond: FlagCondition;
  calcCodes: string[];
  onChange: (c: FlagCondition) => void;
  onDelete: () => void;
}) {
  const uiLang = useUILang();
  return (
    <div className="flex items-center gap-2">
      <select
        value={cond.calculationCode}
        onChange={(e) => onChange({ ...cond, calculationCode: e.target.value })}
        className="flex-1 border border-cw-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
      >
        <option value="">{t('selectCalc', uiLang)}</option>
        {calcCodes.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      <select
        value={cond.operator}
        onChange={(e) => onChange({ ...cond, operator: e.target.value as FlagCondition['operator'] })}
        className="w-16 border border-cw-border rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
      >
        {OPERATORS.map((op) => (
          <option key={op.value} value={op.value}>{op.label}</option>
        ))}
      </select>
      <input
        type="number"
        value={cond.threshold}
        onChange={(e) => onChange({ ...cond, threshold: parseFloat(e.target.value) || 0 })}
        step="0.1"
        className="w-24 border border-cw-border rounded px-2 py-1.5 text-sm text-right font-mono focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
      />
      <button onClick={onDelete} className="text-gray-300 hover:text-red-500">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function FlagForm({
  flag,
  calcCodes,
  onChange,
}: {
  flag: Flag;
  calcCodes: string[];
  onChange: (f: Flag) => void;
}) {
  const uiLang = useUILang();

  function updateCond(i: number, c: FlagCondition) {
    onChange({ ...flag, conditions: flag.conditions.map((x, idx) => (idx === i ? c : x)) });
  }
  function deleteCond(i: number) {
    onChange({ ...flag, conditions: flag.conditions.filter((_, idx) => idx !== i) });
  }
  function addCond() {
    onChange({ ...flag, conditions: [...flag.conditions, newCondition()] });
  }

  const fc = flagColor(flag.type);

  return (
    <div className="flex-1 overflow-auto p-5">
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">{t('code', uiLang)}</label>
          <input
            type="text"
            value={flag.code}
            onChange={(e) => onChange({ ...flag, code: e.target.value })}
            className="w-full border border-cw-border rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
            placeholder="FLAG-HIGH"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">{t('severity', uiLang)}</label>
          <select
            value={flag.type}
            onChange={(e) => onChange({ ...flag, type: e.target.value as FlagType })}
            className="w-full border border-cw-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
          >
            {FLAG_TYPE_VALUES.map((ft) => (
              <option key={ft.value} value={ft.value}>{getFlagTypeLabel(ft.value, uiLang)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-3">
        <label className="block text-xs text-gray-500 mb-1">{t('flagNameMsg', uiLang)}</label>
        <input
          type="text"
          value={flag.name}
          onChange={(e) => onChange({ ...flag, name: e.target.value })}
          className="w-full border border-cw-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
          placeholder={t('flagNamePh', uiLang)}
        />
      </div>

      <div className="mb-4">
        <label className="block text-xs text-gray-500 mb-1">{t('descriptionLabel', uiLang)}</label>
        <textarea
          value={flag.description ?? ''}
          onChange={(e) => onChange({ ...flag, description: e.target.value || undefined })}
          rows={2}
          className="w-full border border-cw-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cw-blue-light resize-none"
          placeholder={t('flagDescPh', uiLang)}
        />
      </div>

      <div className="mb-3">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-gray-500">{t('conditions', uiLang)}</label>
          {flag.conditions.length > 1 && (
            <select
              value={flag.logic}
              onChange={(e) => onChange({ ...flag, logic: e.target.value as 'AND' | 'OR' })}
              className="text-xs border border-cw-border rounded px-2 py-1 focus:outline-none"
            >
              <option value="AND">{t('allConditions', uiLang)}</option>
              <option value="OR">{t('anyCondition', uiLang)}</option>
            </select>
          )}
        </div>
        <div className="space-y-1.5">
          {flag.conditions.map((c, i) => (
            <ConditionRow
              key={i}
              cond={c}
              calcCodes={calcCodes}
              onChange={(updated) => updateCond(i, updated)}
              onDelete={() => deleteCond(i)}
            />
          ))}
        </div>
        {flag.conditions.length === 0 && (
          <p className="text-xs text-gray-400 italic mt-1">{t('noConditions', uiLang)}</p>
        )}
        <button
          onClick={addCond}
          className="mt-2 flex items-center gap-1 text-xs text-cw-blue-light hover:underline"
        >
          <PlusCircle className="w-3.5 h-3.5" /> {t('addCondition', uiLang)}
        </button>
      </div>

      <div className={`mt-4 p-3 rounded ${fc.bg} flex items-center gap-2`}>
        <FlagIcon className={`w-4 h-4 ${fc.color}`} />
        <span className={`text-sm font-medium ${fc.color}`}>
          {flag.name || t('noName', uiLang)} — {getFlagTypeLabel(flag.type, uiLang)}
        </span>
      </div>
    </div>
  );
}

export function FlagEditor({ questionnaire, onChange }: Props) {
  const uiLang = useUILang();
  const flags = questionnaire.flags ?? [];
  const [selectedIdx, setSelectedIdx] = useState<number | null>(flags.length > 0 ? 0 : null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; idx: number } | null>(null);

  useEffect(() => {
    function handler(e: Event) {
      const idx = (e as CustomEvent<{ index: number }>).detail.index;
      if (idx >= 0 && idx < flags.length) setSelectedIdx(idx);
    }
    window.addEventListener('select-flag', handler);
    return () => window.removeEventListener('select-flag', handler);
  }, [flags.length]);

  const calcCodes = (questionnaire.calculations?.calculations ?? [])
    .map((c) => c.code)
    .filter(Boolean);

  function setFlags(updated: Flag[]) {
    onChange({ ...questionnaire, flags: updated });
  }

  function addFlag() {
    const updated = [...flags, newFlag()];
    setFlags(updated);
    setSelectedIdx(updated.length - 1);
  }

  function updateFlag(i: number, f: Flag) {
    setFlags(flags.map((x, idx) => (idx === i ? f : x)));
  }

  function deleteFlag(i: number) {
    const updated = flags.filter((_, idx) => idx !== i);
    setFlags(updated);
    setSelectedIdx(updated.length > 0 ? Math.min(i, updated.length - 1) : null);
  }
  function dupFlag(i: number) {
    const src = flags[i];
    const dup: Flag = { ...src, code: src.code ? `${src.code}-kopi` : '', conditions: [...src.conditions] };
    const next = [...flags];
    next.splice(i + 1, 0, dup);
    setFlags(next);
    setSelectedIdx(i + 1);
  }

  const selected = selectedIdx !== null ? flags[selectedIdx] : null;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: flag list */}
      <div className="w-60 border-r border-cw-border flex flex-col bg-cw-gray shrink-0">
        <div className="px-3 py-3 border-b border-cw-border bg-white">
          <h2 className="text-sm font-semibold text-cw-blue">{t('flagsHeader', uiLang)}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{t('flagsSubtitle', uiLang)}</p>
        </div>
        <div className="flex-1 overflow-auto py-1">
          {flags.map((flag, i) => {
            const fc = flagColor(flag.type);
            return (
              <button
                key={i}
                onClick={() => setSelectedIdx(i)}
                onContextMenu={(e) => { e.preventDefault(); setSelectedIdx(i); setCtxMenu({ x: e.clientX, y: e.clientY, idx: i }); }}
                className={`w-full text-left px-3 py-2.5 flex items-center gap-2 border-b border-cw-border/50 hover:bg-white/60 ${
                  selectedIdx === i ? 'bg-white border-l-2 border-l-cw-blue' : ''
                }`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${fc.bg.replace('bg-', 'bg-').replace('-100', '-400')}`} />
                <div className="min-w-0">
                  <div className="text-xs font-mono truncate text-gray-700">{flag.code || t('noCode', uiLang)}</div>
                  <div className="text-xs text-gray-400 truncate">{flag.name || getFlagTypeLabel(flag.type, uiLang)}</div>
                </div>
              </button>
            );
          })}
          {flags.length === 0 && (
            <p className="text-xs text-gray-400 text-center mt-6 px-3">{t('noFlags', uiLang)}</p>
          )}
        </div>
        <div className="p-2 border-t border-cw-border">
          <button
            onClick={addFlag}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-cw-blue-light hover:bg-white rounded border border-dashed border-cw-blue-light/50"
          >
            <PlusCircle className="w-3.5 h-3.5" /> {t('newFlag', uiLang)}
          </button>
        </div>
      </div>

      {/* Right: editor */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selected !== null && selectedIdx !== null ? (
          <>
            <div className="bg-white border-b border-cw-border px-5 py-3 flex items-center justify-between shrink-0">
              <h3 className="text-sm font-semibold text-gray-700">
                {selected.code || t('newFlag', uiLang)}
              </h3>
              <button
                onClick={() => deleteFlag(selectedIdx)}
                className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" /> {t('deleteBtn', uiLang)}
              </button>
            </div>
            <FlagForm
              flag={selected}
              calcCodes={calcCodes}
              onChange={(f) => updateFlag(selectedIdx, f)}
            />
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            {t('selectOrCreateFlag', uiLang)}
          </div>
        )}
      </div>
      {ctxMenu && (
        <ItemContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          items={[
            { label: t('duplicate', uiLang), icon: <Copy className="w-3.5 h-3.5 text-gray-400" />, onClick: () => dupFlag(ctxMenu.idx) },
            { separator: true },
            { label: t('deleteBtn', uiLang), icon: <Trash2 className="w-3.5 h-3.5" />, onClick: () => deleteFlag(ctxMenu.idx), danger: true },
          ]}
        />
      )}
    </div>
  );
}
