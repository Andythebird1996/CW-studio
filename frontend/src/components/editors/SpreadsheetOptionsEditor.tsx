import { useRef, useState, useCallback } from 'react';
import { ChevronDown, ChevronUp, PlusCircle, X } from 'lucide-react';
import type { TextOption, LanguageType } from '../../types/questionnaire';

// ── Props ──────────────────────────────────────────────────────────────────────

export interface SpreadsheetOptionsEditorProps {
  options: TextOption[];
  languages: string[]; // e.g. ['NO', 'EN']
  onChange: (options: TextOption[]) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function emptyOption(languages: string[]): TextOption {
  const texts = Object.fromEntries(languages.map((l) => [l, ''])) as Record<LanguageType, string>;
  return { code: '', score: undefined, reverseValue: undefined, texts };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SpreadsheetOptionsEditor({
  options,
  languages,
  onChange,
}: SpreadsheetOptionsEditorProps) {
  // Track which row index currently has focus (used for paste insertion point)
  const [focusedRow, setFocusedRow] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Mutation helpers ───────────────────────────────────────────────────────

  function updateOption(i: number, patch: Partial<TextOption>) {
    onChange(options.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  }

  function updateText(i: number, lang: string, value: string) {
    const texts = { ...options[i].texts, [lang]: value } as Record<LanguageType, string>;
    updateOption(i, { texts });
  }

  function addRow() {
    onChange([...options, emptyOption(languages)]);
  }

  function removeRow(i: number) {
    onChange(options.filter((_, idx) => idx !== i));
    if (focusedRow === i) setFocusedRow(null);
  }

  function moveRow(i: number, direction: -1 | 1) {
    const j = i + direction;
    if (j < 0 || j >= options.length) return;
    const next = [...options];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
    setFocusedRow(j);
  }

  // ── Paste from Excel ───────────────────────────────────────────────────────

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      const text = e.clipboardData.getData('text/plain');
      if (!text.includes('\t') && !text.includes('\n')) return; // not TSV, let default paste happen

      e.preventDefault();

      const rawRows = text.split('\n').map((r) => r.replace(/\r$/, ''));
      // Remove trailing empty line
      while (rawRows.length > 0 && rawRows[rawRows.length - 1] === '') rawRows.pop();

      if (rawRows.length === 0) return;

      const cells = rawRows.map((r) => r.split('\t'));

      // Skip header row if first cell is "code" (case-insensitive)
      const startIndex = cells[0][0].toLowerCase() === 'code' ? 1 : 0;
      const dataRows = cells.slice(startIndex);

      if (dataRows.length === 0) return;

      // Build parsed options
      // Column order: code, score, texts per language in order
      const parsed: TextOption[] = dataRows.map((cols) => {
        const code = cols[0] ?? '';
        const scoreRaw = cols[1] ?? '';
        const score = scoreRaw !== '' ? Number(scoreRaw) : undefined;
        const texts = Object.fromEntries(
          languages.map((lang, li) => [lang, cols[2 + li] ?? ''])
        ) as Record<LanguageType, string>;
        return { code, score, reverseValue: undefined, texts };
      });

      // Insert at focused row or append
      const insertAt = focusedRow !== null ? focusedRow : options.length;
      const next = [
        ...options.slice(0, insertAt),
        ...parsed,
        ...options.slice(insertAt),
      ];
      onChange(next);
      setFocusedRow(insertAt + parsed.length - 1);
    },
    [focusedRow, languages, options, onChange]
  );

  // ── Cell class ─────────────────────────────────────────────────────────────

  const cellInput =
    'border-0 border-r border-cw-border bg-transparent px-1.5 py-0.5 text-xs focus:outline-none focus:bg-blue-50 w-full min-w-0';

  const thCell =
    'border-r border-cw-border px-1.5 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide text-left last:border-r-0 whitespace-nowrap';

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div ref={containerRef} onPaste={handlePaste}>
      <div className="overflow-x-auto rounded border border-cw-border">
        <table className="w-full border-collapse text-xs" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            {/* code */}
            <col style={{ width: 80 }} />
            {/* score */}
            <col style={{ width: 56 }} />
            {/* rev */}
            <col style={{ width: 40 }} />
            {/* one col per language */}
            {languages.map((l) => (
              <col key={l} style={{ width: `${Math.max(100, Math.floor(400 / languages.length))}px` }} />
            ))}
            {/* move up */}
            <col style={{ width: 22 }} />
            {/* move down */}
            <col style={{ width: 22 }} />
            {/* delete */}
            <col style={{ width: 22 }} />
          </colgroup>

          <thead>
            <tr className="bg-cw-gray border-b border-cw-border">
              <th className={thCell}>Code</th>
              <th className={thCell}>Score</th>
              <th className={thCell} title="Reverse value">Rev.</th>
              {languages.map((l) => (
                <th key={l} className={thCell}>{l}</th>
              ))}
              {/* action columns — empty headers */}
              <th className="border-r border-cw-border w-[22px]" />
              <th className="border-r border-cw-border w-[22px]" />
              <th className="w-[22px]" />
            </tr>
          </thead>

          <tbody>
            {options.length === 0 && (
              <tr>
                <td
                  colSpan={3 + languages.length + 3}
                  className="px-3 py-3 text-xs text-gray-400 italic text-center border-b border-cw-border"
                >
                  Ingen rader — klikk «Legg til» eller lim inn fra Excel
                </td>
              </tr>
            )}

            {options.map((opt, i) => (
              <tr
                key={i}
                className={`border-b border-cw-border last:border-b-0 ${
                  focusedRow === i ? 'bg-blue-50/40' : 'hover:bg-gray-50/60'
                }`}
                onFocus={() => setFocusedRow(i)}
              >
                {/* Code */}
                <td className="border-r border-cw-border">
                  <input
                    type="text"
                    value={opt.code}
                    onChange={(e) => updateOption(i, { code: e.target.value })}
                    placeholder="kode"
                    className={`${cellInput} font-mono`}
                    spellCheck={false}
                  />
                </td>

                {/* Score */}
                <td className="border-r border-cw-border">
                  <input
                    type="number"
                    value={opt.score ?? ''}
                    onChange={(e) =>
                      updateOption(i, { score: e.target.value !== '' ? Number(e.target.value) : undefined })
                    }
                    placeholder="0"
                    className={cellInput}
                  />
                </td>

                {/* Reverse value */}
                <td className="border-r border-cw-border text-center">
                  <input
                    type="checkbox"
                    checked={opt.reverseValue ?? false}
                    onChange={(e) =>
                      updateOption(i, { reverseValue: e.target.checked || undefined })
                    }
                    className="accent-cw-blue"
                    title="Reverser skår"
                  />
                </td>

                {/* Text per language */}
                {languages.map((lang) => (
                  <td key={lang} className="border-r border-cw-border last:border-r-0">
                    <input
                      type="text"
                      value={(opt.texts as Record<string, string>)[lang] ?? ''}
                      onChange={(e) => updateText(i, lang, e.target.value)}
                      placeholder={`Tekst (${lang})...`}
                      className={cellInput}
                    />
                  </td>
                ))}

                {/* Move up */}
                <td className="border-r border-cw-border text-center p-0">
                  <button
                    onClick={() => moveRow(i, -1)}
                    disabled={i === 0}
                    className="w-full h-full flex items-center justify-center py-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20 disabled:cursor-default"
                    title="Flytt opp"
                    tabIndex={-1}
                  >
                    <ChevronUp className="w-3 h-3" />
                  </button>
                </td>

                {/* Move down */}
                <td className="border-r border-cw-border text-center p-0">
                  <button
                    onClick={() => moveRow(i, 1)}
                    disabled={i === options.length - 1}
                    className="w-full h-full flex items-center justify-center py-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20 disabled:cursor-default"
                    title="Flytt ned"
                    tabIndex={-1}
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </td>

                {/* Delete */}
                <td className="text-center p-0">
                  <button
                    onClick={() => removeRow(i)}
                    className="w-full h-full flex items-center justify-center py-0.5 text-gray-300 hover:text-red-500"
                    title="Slett rad"
                    tabIndex={-1}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add row button */}
      <button
        onClick={addRow}
        className="mt-2 flex items-center gap-1 text-xs text-cw-blue-light hover:underline"
      >
        <PlusCircle className="w-3.5 h-3.5" /> Legg til rad
      </button>

      {/* Paste hint */}
      <p className="mt-1 text-[10px] text-gray-400">
        Tips: Lim inn TSV fra Excel direkte i tabellen (kolonner: code, score, tekst per språk).
      </p>
    </div>
  );
}
