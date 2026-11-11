import * as Dialog from '@radix-ui/react-dialog';
import { useState, useMemo } from 'react';
import type { NormType } from '../../types/questionnaire';
import { t, countPhrase, useUILang } from '../../i18n';

/** Matches the inline element type of Norm.data */
export type NormDataRow = { score: number; normValue: number; age?: number; gender?: string };

type SepType = 'tab' | 'semicolon';

interface Props {
  open: boolean;
  normType: NormType;
  onClose: () => void;
  onImport: (rows: NormDataRow[]) => void;
}

interface ParseResult {
  rows: NormDataRow[];
  errors: string[];
}

function parseRows(raw: string, sep: SepType, skipHeader: boolean, normType: NormType): ParseResult {
  const sepChar = sep === 'tab' ? '\t' : ';';
  const errors: string[] = [];
  const rows: NormDataRow[] = [];

  const lines = raw
    .split('\n')
    .map((l) => l.trimEnd())
    .filter(Boolean);

  const startIdx = skipHeader && lines.length > 0 ? 1 : 0;

  for (let i = startIdx; i < lines.length; i++) {
    const lineNum = i + 1;
    const cols = lines[i].split(sepChar);

    if (normType === 'ZSCORE') {
      // 2-3 columns: score, normValue[, label (ignored)]
      if (cols.length < 2) {
        errors.push(
          `Linje ${lineNum}: Feil antall kolonner (forventet minst 2, fikk ${cols.length})`
        );
        continue;
      }
      const score = parseFloat(cols[0].trim());
      const normValue = parseFloat(cols[1].trim());
      if (isNaN(score)) {
        errors.push(`Linje ${lineNum}: Ugyldig score-verdi "${cols[0].trim()}"`);
        continue;
      }
      if (isNaN(normValue)) {
        errors.push(`Linje ${lineNum}: Ugyldig normverdi "${cols[1].trim()}"`);
        continue;
      }
      rows.push({ score, normValue });
    } else {
      // NORM / PERCENTILE — LOOKUP format: min, maks, verdi[, etikett]
      // We map: min→score, verdi→normValue (maks and etikett stored separately if needed)
      // Since Norm.data only has score/normValue/age/gender, we map min→score, value→normValue
      if (cols.length < 3 || cols.length > 4) {
        errors.push(
          `Linje ${lineNum}: Feil antall kolonner (forventet 3-4, fikk ${cols.length})`
        );
        continue;
      }
      const min = parseFloat(cols[0].trim());
      const maks = cols[1].trim() !== '' ? parseFloat(cols[1].trim()) : NaN;
      const verdi = parseFloat(cols[2].trim());

      if (isNaN(min)) {
        errors.push(`Linje ${lineNum}: Ugyldig min-verdi "${cols[0].trim()}"`);
        continue;
      }
      if (cols[1].trim() !== '' && isNaN(maks)) {
        errors.push(`Linje ${lineNum}: Ugyldig maks-verdi "${cols[1].trim()}"`);
        continue;
      }
      if (cols[2].trim() === '') {
        errors.push(`Linje ${lineNum}: Tom verdi (kolonne 3)`);
        continue;
      }
      if (isNaN(verdi)) {
        errors.push(`Linje ${lineNum}: Ugyldig verdi "${cols[2].trim()}"`);
        continue;
      }
      rows.push({ score: min, normValue: verdi });
    }
  }

  return { rows, errors };
}

export function ImportNormDialog({ open, normType, onClose, onImport }: Props) {
  const uiLang = useUILang();

  const [rawText, setRawText] = useState('');
  const [sep, setSep] = useState<SepType>('tab');
  const [skipHeader, setSkipHeader] = useState(false);

  function handleClose() {
    setRawText('');
    setSep('tab');
    setSkipHeader(false);
    onClose();
  }

  const { rows, errors } = useMemo(
    () => parseRows(rawText, sep, skipHeader, normType),
    [rawText, sep, skipHeader, normType]
  );

  const canImport = rawText.trim().length > 0 && errors.length === 0 && rows.length > 0;

  function handleImport() {
    if (!canImport) return;
    onImport(rows);
    handleClose();
  }

  const isLookup = normType !== 'ZSCORE';
  const formatHint = isLookup ? t('normFormatLookup', uiLang) : t('normFormatZ', uiLang);
  const placeholder = isLookup ? '0\t5\t50\n6\t10\t60\n11\t15\t70' : '0\t50\n1\t52\n2\t54';

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl w-[540px] flex flex-col z-50"
        >
          <div className="p-4 border-b border-cw-border">
            <Dialog.Title className="text-lg font-semibold text-cw-blue">
              {t('importNormTitle', uiLang)}
            </Dialog.Title>
          </div>

          <div className="p-4 flex flex-col gap-4 overflow-auto">
            {/* Textarea */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                {t('importNormHelp', uiLang)}
              </label>
              <textarea
                rows={8}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder={placeholder}
                className="w-full border border-cw-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cw-blue-light resize-none"
                spellCheck={false}
              />
              {/* Format hint */}
              <p className="mt-1 text-xs text-gray-400 font-mono">{formatHint}</p>

              {/* Validation errors */}
              {errors.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {errors.map((err, i) => (
                    <li key={i} className="text-xs text-red-600">
                      {err}
                    </li>
                  ))}
                </ul>
              )}

              {/* Row count feedback when valid */}
              {rawText.trim().length > 0 && errors.length === 0 && rows.length > 0 && (
                <p className="mt-1 text-xs text-green-600">
                  {countPhrase(rows.length, uiLang, 'nRowReadyOne', 'nRowReadyMany')}
                </p>
              )}
            </div>

            {/* Options row */}
            <div className="flex items-center gap-6">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  {t('separator', uiLang)}
                </label>
                <select
                  value={sep}
                  onChange={(e) => setSep(e.target.value as SepType)}
                  className="border border-cw-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
                >
                  <option value="tab">{t('separatorTab', uiLang)}</option>
                  <option value="semicolon">{t('separatorSemicolon', uiLang)}</option>
                </select>
              </div>

              <label className="flex items-center gap-2 text-sm cursor-pointer select-none mt-4">
                <input
                  type="checkbox"
                  checked={skipHeader}
                  onChange={(e) => setSkipHeader(e.target.checked)}
                  className="w-4 h-4 accent-cw-blue"
                />
                {t('hasHeaderRow', uiLang)}
              </label>
            </div>
          </div>

          <div className="p-4 border-t border-cw-border flex justify-end gap-2">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm border border-cw-border rounded hover:bg-gray-50"
            >
              {t('cancelBtn', uiLang)}
            </button>
            <button
              onClick={handleImport}
              disabled={!canImport}
              className="px-4 py-2 text-sm bg-cw-blue text-white rounded hover:bg-cw-blue-light disabled:opacity-50"
            >
              {t('import', uiLang)}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
