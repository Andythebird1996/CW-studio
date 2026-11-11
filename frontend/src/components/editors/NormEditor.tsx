import { useState, useRef, useEffect } from 'react';
import { ClipboardPaste, Copy, PlusCircle, Trash2, Upload } from 'lucide-react';
import type { Questionnaire, Norm, NormType, Calculations } from '../../types/questionnaire';
import { t, useUILang } from '../../i18n';
import { ImportNormDialog, type NormDataRow } from '../dialogs/ImportNormDialog';
import { ItemContextMenu } from './ItemContextMenu';

interface Props {
  questionnaire: Questionnaire;
  onChange: (q: Questionnaire) => void;
}

function newNorm(): Norm {
  return { code: '', name: '', type: 'NORM', description: '', origin: '', data: [] };
}

function newRow() {
  return { score: 0, normValue: 0 };
}

type NormRowField = 'score' | 'normValue' | 'age' | 'gender';

function NormForm({
  norm,
  onChange,
}: {
  norm: Norm;
  onChange: (n: Norm) => void;
}) {
  const uiLang = useUILang();
  const [showAge, setShowAge] = useState(() => norm.data.some((r) => r.age !== undefined));
  const [showGender, setShowGender] = useState(() => norm.data.some((r) => r.gender !== undefined));
  const pasteRef = useRef<HTMLTextAreaElement>(null);
  const [showPaste, setShowPaste] = useState(false);

  const normTypes: Array<{ value: NormType; label: string }> = [
    { value: 'NORM',       label: t('normTypeTScore', uiLang) },
    { value: 'PERCENTILE', label: t('normTypePerc', uiLang)   },
    { value: 'ZSCORE',     label: t('normTypeZ', uiLang)      },
  ];

  function updateRow(i: number, field: NormRowField, val: string | number) {
    onChange({
      ...norm,
      data: norm.data.map((r, idx) => (idx === i ? { ...r, [field]: val } : r)),
    });
  }
  function deleteRow(i: number) {
    onChange({ ...norm, data: norm.data.filter((_, idx) => idx !== i) });
  }
  function addRow() {
    onChange({ ...norm, data: [...norm.data, newRow()] });
  }

  function handlePaste() {
    const raw = pasteRef.current?.value ?? '';
    const rows = raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const cols = line.split('\t');
        const score = parseFloat(cols[0] ?? '') || 0;
        const normValue = parseFloat(cols[1] ?? '') || 0;
        const age = cols[2] !== undefined && cols[2] !== '' ? parseFloat(cols[2]) : undefined;
        const gender = cols[3] !== undefined && cols[3] !== '' ? cols[3] : undefined;
        return { score, normValue, ...(age !== undefined ? { age } : {}), ...(gender !== undefined ? { gender } : {}) };
      });
    if (rows.length > 0) {
      onChange({ ...norm, data: rows });
      if (rows.some((r) => r.age !== undefined)) setShowAge(true);
      if (rows.some((r) => r.gender !== undefined)) setShowGender(true);
    }
    setShowPaste(false);
    if (pasteRef.current) pasteRef.current.value = '';
  }

  const normValueLabel = norm.type === 'NORM'
    ? t('normTypeTScore', uiLang)
    : norm.type === 'PERCENTILE'
    ? t('normTypePerc', uiLang)
    : t('normTypeZ', uiLang);

  const colCount = 2 + (showAge ? 1 : 0) + (showGender ? 1 : 0) + 1;

  return (
    <div className="flex-1 overflow-auto p-5">
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs text-cw-gray-text mb-1">{t('code', uiLang)}</label>
          <input
            type="text"
            value={norm.code}
            onChange={(e) => onChange({ ...norm, code: e.target.value })}
            className="w-full border border-cw-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cw-blue/30"
            placeholder="NORM-TOTAL"
          />
        </div>
        <div>
          <label className="block text-xs text-cw-gray-text mb-1">{t('typeLabel', uiLang)}</label>
          <select
            value={norm.type}
            onChange={(e) => onChange({ ...norm, type: e.target.value as NormType })}
            className="w-full border border-cw-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cw-blue/30"
          >
            {normTypes.map((nt) => (
              <option key={nt.value} value={nt.value}>{nt.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-3">
        <label className="block text-xs text-cw-gray-text mb-1">{t('name', uiLang)}</label>
        <input
          type="text"
          value={norm.name}
          onChange={(e) => onChange({ ...norm, name: e.target.value })}
          className="w-full border border-cw-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cw-blue/30"
          placeholder={t('normPopulationPh', uiLang)}
        />
      </div>

      <div className="mb-3">
        <label className="block text-xs text-cw-gray-text mb-1">{t('descriptionLabel', uiLang)}</label>
        <textarea
          value={norm.description ?? ''}
          onChange={(e) => onChange({ ...norm, description: e.target.value })}
          rows={2}
          className="w-full border border-cw-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cw-blue/30 resize-none"
        />
      </div>

      <div className="mb-4">
        <label className="block text-xs text-cw-gray-text mb-1">{t('sourceLabel', uiLang)}</label>
        <input
          type="text"
          value={norm.origin ?? ''}
          onChange={(e) => onChange({ ...norm, origin: e.target.value })}
          className="w-full border border-cw-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cw-blue/30"
          placeholder={t('normSourcePh', uiLang)}
        />
      </div>

      {/* ZSCORE: mean + stdDev inputs */}
      {norm.type === 'ZSCORE' && (
        <div className="grid grid-cols-2 gap-3 mb-4 p-3 border border-cw-border rounded bg-cw-gray">
          <div>
            <label className="block text-xs text-cw-gray-text mb-1">{t('zscoreMean', uiLang)}</label>
            <input
              type="number"
              step="0.01"
              value={norm.data[0]?.score ?? 0}
              onChange={(e) => {
                const mean = parseFloat(e.target.value) || 0;
                const sd = norm.data[0]?.normValue ?? 0;
                onChange({ ...norm, data: [{ score: mean, normValue: sd }] });
              }}
              className="w-full border border-cw-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cw-blue/30"
            />
          </div>
          <div>
            <label className="block text-xs text-cw-gray-text mb-1">{t('zscoreStdDev', uiLang)}</label>
            <input
              type="number"
              step="0.01"
              value={norm.data[0]?.normValue ?? 0}
              onChange={(e) => {
                const mean = norm.data[0]?.score ?? 0;
                const sd = parseFloat(e.target.value) || 0;
                onChange({ ...norm, data: [{ score: mean, normValue: sd }] });
              }}
              className="w-full border border-cw-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cw-blue/30"
            />
          </div>
        </div>
      )}

      {/* Data table (NORM / PERCENTILE only) */}
      {norm.type !== 'ZSCORE' && <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-cw-gray-text">
            {t('lookupTable', uiLang)}
          </label>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1 text-xs text-cw-gray-text cursor-pointer">
              <input
                type="checkbox"
                checked={showAge}
                onChange={(e) => setShowAge(e.target.checked)}
                className="w-3 h-3 accent-cw-blue"
              />
              {t('ageCol', uiLang)}
            </label>
            <label className="flex items-center gap-1 text-xs text-cw-gray-text cursor-pointer">
              <input
                type="checkbox"
                checked={showGender}
                onChange={(e) => setShowGender(e.target.checked)}
                className="w-3 h-3 accent-cw-blue"
              />
              {t('genderCol', uiLang)}
            </label>
            <button
              onClick={() => setShowPaste((v) => !v)}
              className="flex items-center gap-1 text-xs text-cw-blue-light hover:underline"
              title={t('pasteTsvTitle', uiLang)}
            >
              <ClipboardPaste className="w-3.5 h-3.5" /> {t('pasteData', uiLang)}
            </button>
          </div>
        </div>

        {showPaste && (
          <div className="mb-3 p-3 bg-cw-gray border border-cw-border rounded">
            <p className="text-xs text-cw-gray-text mb-2">
              {t('pasteColumns', uiLang)}{' '}
              <code className="bg-cw-gray px-1 rounded">{t('rawScore', uiLang)}</code>{' '}
              <code className="bg-cw-gray px-1 rounded">{normValueLabel}</code>
              {showAge && <> <code className="bg-cw-gray px-1 rounded">{t('ageCol', uiLang)}</code></>}
              {showGender && <> <code className="bg-cw-gray px-1 rounded">{t('genderCol', uiLang)}</code></>}
              {t('oneRowPerLine', uiLang)}
            </p>
            <textarea
              ref={pasteRef}
              rows={6}
              className="w-full border border-cw-border rounded px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-cw-blue/30 resize-none"
              placeholder={`0\t50\n1\t52\n2\t54`}
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={handlePaste}
                className="px-3 py-1 text-xs bg-cw-blue text-white rounded hover:bg-cw-blue/90"
              >
                {t('import', uiLang)}
              </button>
              <button
                onClick={() => setShowPaste(false)}
                className="px-3 py-1 text-xs border border-cw-border rounded hover:bg-cw-gray"
              >
                {t('cancelBtn', uiLang)}
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
        <table className="w-full text-sm border border-cw-border rounded" style={{ minWidth: '28rem' }}>
          <thead className="bg-cw-gray">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-cw-gray-text">{t('rawScore', uiLang)}</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-cw-gray-text">{normValueLabel}</th>
              {showAge && <th className="px-3 py-2 text-left text-xs font-medium text-cw-gray-text">{t('ageCol', uiLang)}</th>}
              {showGender && <th className="px-3 py-2 text-left text-xs font-medium text-cw-gray-text">{t('genderCol', uiLang)}</th>}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {norm.data.map((row, i) => (
              <tr key={i} className="border-t border-cw-border">
                <td className="px-2 py-1">
                  <input
                    type="number"
                    value={row.score}
                    onChange={(e) => updateRow(i, 'score', parseFloat(e.target.value) || 0)}
                    step="0.1"
                    className="w-full border border-cw-border rounded px-2 py-1 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cw-blue/30"
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    type="number"
                    value={row.normValue}
                    onChange={(e) => updateRow(i, 'normValue', parseFloat(e.target.value) || 0)}
                    step="0.1"
                    className="w-full border border-cw-border rounded px-2 py-1 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cw-blue/30"
                  />
                </td>
                {showAge && (
                  <td className="px-2 py-1">
                    <input
                      type="number"
                      value={row.age ?? ''}
                      onChange={(e) => updateRow(i, 'age', e.target.value === '' ? (undefined as unknown as number) : parseFloat(e.target.value))}
                      placeholder="–"
                      className="w-full border border-cw-border rounded px-2 py-1 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cw-blue/30"
                    />
                  </td>
                )}
                {showGender && (
                  <td className="px-2 py-1">
                    <select
                      value={row.gender ?? ''}
                      onChange={(e) => updateRow(i, 'gender', e.target.value || (undefined as unknown as string))}
                      className="w-full border border-cw-border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-cw-blue/30"
                    >
                      <option value="">–</option>
                      <option value="M">M</option>
                      <option value="F">F</option>
                    </select>
                  </td>
                )}
                <td className="px-2 py-1 text-center">
                  <button onClick={() => deleteRow(i)} className="text-cw-gray-text hover:text-cw-negative">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {norm.data.length === 0 && (
              <tr>
                <td colSpan={colCount} className="px-3 py-4 text-center text-xs text-cw-gray-text">
                  {t('noRows', uiLang)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
        <button
          onClick={addRow}
          className="mt-2 flex items-center gap-1 text-xs text-cw-blue-light hover:underline"
        >
          <PlusCircle className="w-3.5 h-3.5" /> {t('addRow', uiLang)}
        </button>
      </div>}
    </div>
  );
}

export function NormEditor({ questionnaire, onChange }: Props) {
  const uiLang = useUILang();
  const norms = questionnaire.calculations?.norms ?? [];
  const calcs = questionnaire.calculations?.calculations ?? [];
  const [selectedIdx, setSelectedIdx] = useState<number | null>(norms.length > 0 ? 0 : null);
  const [importNormOpen, setImportNormOpen] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; idx: number } | null>(null);

  useEffect(() => {
    function handler(e: Event) {
      const idx = (e as CustomEvent<{ index: number }>).detail.index;
      if (idx >= 0 && idx < norms.length) setSelectedIdx(idx);
    }
    window.addEventListener('select-norm', handler);
    return () => window.removeEventListener('select-norm', handler);
  }, [norms.length]);

  const normTypes: Array<{ value: NormType; label: string }> = [
    { value: 'NORM',       label: t('normTypeTScore', uiLang) },
    { value: 'PERCENTILE', label: t('normTypePerc', uiLang)   },
    { value: 'ZSCORE',     label: t('normTypeZ', uiLang)      },
  ];

  function setNorms(updated: Norm[]) {
    onChange({
      ...questionnaire,
      calculations: { calculations: calcs, norms: updated } as Calculations,
    });
  }

  function addNorm() {
    const updated = [...norms, newNorm()];
    setNorms(updated);
    setSelectedIdx(updated.length - 1);
  }

  function updateNorm(i: number, n: Norm) {
    setNorms(norms.map((x, idx) => (idx === i ? n : x)));
  }

  function deleteNorm(i: number) {
    const updated = norms.filter((_, idx) => idx !== i);
    setNorms(updated);
    setSelectedIdx(updated.length > 0 ? Math.min(i, updated.length - 1) : null);
  }
  function dupNorm(i: number) {
    const src = norms[i];
    const dup: Norm = { ...src, code: src.code ? `${src.code}-kopi` : '', data: src.data.map((r) => ({ ...r })) };
    const next = [...norms];
    next.splice(i + 1, 0, dup);
    setNorms(next);
    setSelectedIdx(i + 1);
  }

  function handleImportNormRows(rows: NormDataRow[]) {
    if (selectedIdx === null) return;
    const norm = norms[selectedIdx];
    if (!norm) return;
    const updated = norms.map((n, idx) =>
      idx === selectedIdx ? { ...n, data: rows } : n
    );
    setNorms(updated);
  }

  const selected = selectedIdx !== null ? norms[selectedIdx] : null;

  return (
    <div className="flex flex-col md:flex-row h-full overflow-hidden min-w-0 min-h-0">
      {/* Left: norm list. Stacks above the form on phones. */}
      <div className="w-full max-h-[40vh] md:max-h-none md:w-60 border-b md:border-b-0 md:border-r border-cw-border flex flex-col bg-cw-gray shrink-0 min-h-0">
        <div className="px-3 py-3 border-b border-cw-border bg-white">
          <h2 className="text-sm font-semibold text-cw-blue">{t('normsHeader', uiLang)}</h2>
          <p className="text-xs text-cw-gray-text mt-0.5">{t('normsSubtitle', uiLang)}</p>
        </div>
        <div className="flex-1 overflow-auto py-1">
          {norms.map((norm, i) => (
            <button
              key={i}
              onClick={() => setSelectedIdx(i)}
              onContextMenu={(e) => { e.preventDefault(); setSelectedIdx(i); setCtxMenu({ x: e.clientX, y: e.clientY, idx: i }); }}
              className={`w-full text-left px-3 py-2.5 border-b border-cw-border/50 hover:bg-white/60 ${
                selectedIdx === i ? 'bg-white border-l-2 border-l-cw-blue' : ''
              }`}
            >
              <div className="text-xs font-mono truncate text-cw-ink">{norm.code || t('noCode', uiLang)}</div>
              <div className="text-xs text-cw-gray-text truncate">
                {norm.name || normTypes.find((nt) => nt.value === norm.type)?.label} · {norm.data.length} {t('rowsLabel', uiLang)}
              </div>
            </button>
          ))}
          {norms.length === 0 && (
            <p className="text-xs text-cw-gray-text text-center mt-6 px-3">{t('noNorms', uiLang)}</p>
          )}
        </div>
        <div className="p-2 border-t border-cw-border flex flex-col gap-1.5">
          <button
            onClick={addNorm}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-cw-blue-light hover:bg-white rounded border border-dashed border-cw-blue-light/50"
          >
            <PlusCircle className="w-3.5 h-3.5" /> {t('newNormBtn', uiLang)}
          </button>
          <button
            onClick={() => setImportNormOpen(true)}
            disabled={selectedIdx === null}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-cw-gray-text hover:bg-white hover:text-cw-blue-light rounded border border-dashed border-cw-border disabled:opacity-40 disabled:cursor-not-allowed"
            title={
              selectedIdx === null
                ? t('selectNormFirst', uiLang)
                : t('importSpreadsheet', uiLang)
            }
          >
            <Upload className="w-3.5 h-3.5" />
            {t('importData', uiLang)}
          </button>
        </div>
      </div>

      <ImportNormDialog
        open={importNormOpen}
        normType={selected?.type ?? 'NORM'}
        onClose={() => setImportNormOpen(false)}
        onImport={(rows) => {
          handleImportNormRows(rows);
          setImportNormOpen(false);
        }}
      />

      {/* Right: editor */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0 min-h-0">
        {selected !== null && selectedIdx !== null ? (
          <>
            <div className="bg-white border-b border-cw-border px-5 py-3 flex items-center justify-between shrink-0">
              <h3 className="text-sm font-semibold text-cw-ink">
                {selected.code || t('newNormBtn', uiLang)}
              </h3>
              <button
                onClick={() => deleteNorm(selectedIdx)}
                className="text-xs text-cw-negative hover:text-cw-negative flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" /> {t('deleteBtn', uiLang)}
              </button>
            </div>
            <NormForm
              norm={selected}
              onChange={(n) => updateNorm(selectedIdx, n)}
            />
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-cw-gray-text text-sm">
            {t('selectOrCreateNorm', uiLang)}
          </div>
        )}
      </div>
      {ctxMenu && (
        <ItemContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          items={[
            { label: t('duplicate', uiLang), icon: <Copy className="w-3.5 h-3.5 text-cw-gray-text" />, onClick: () => dupNorm(ctxMenu.idx) },
            { separator: true },
            { label: t('deleteBtn', uiLang), icon: <Trash2 className="w-3.5 h-3.5" />, onClick: () => deleteNorm(ctxMenu.idx), danger: true },
          ]}
        />
      )}
    </div>
  );
}
