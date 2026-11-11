import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { Calculation, Questionnaire } from '../../types/questionnaire';
import {t,  useUILang } from '../../i18n';

interface Props {
  questionnaire: Questionnaire;
  onImport: (calculations: Calculation[]) => void;
  onClose: () => void;
}

interface ParsedRow {
  code: string;
  name: string;
  type: string;
  questionCodes: string[];
  valid: boolean;
  error?: string;
}

const VALID_TYPES = new Set(['SUM', 'MEAN', 'COUNT']);

function detectSeparator(text: string): string {
  const tabCount = (text.match(/\t/g) ?? []).length;
  const pipeCount = (text.match(/\|/g) ?? []).length;
  return tabCount >= pipeCount ? '\t' : '|';
}

function parseRows(text: string, hasHeader: boolean): ParsedRow[] {
  const sep = detectSeparator(text);
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines.map((line): ParsedRow => {
    const cols = line.split(sep).map((c) => c.trim());
    if (cols.length < 3) {
      return { code: '', name: '', type: '', questionCodes: [], valid: false, error: `Too few columns: "${line}"` };
    }
    const [code, name, type, qCodesRaw] = cols;
    const typeCleaned = type.toUpperCase();
    const questionCodes = (qCodesRaw ?? '')
      .split(',')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    if (!code) {
      return { code, name, type: typeCleaned, questionCodes, valid: false, error: 'Code is empty' };
    }
    if (!VALID_TYPES.has(typeCleaned)) {
      return { code, name, type: typeCleaned, questionCodes, valid: false, error: `Unknown type "${type}" — use SUM, MEAN or COUNT` };
    }

    return { code, name, type: typeCleaned, questionCodes, valid: true };
  });
}

function rowToCalculation(row: ParsedRow): Calculation {
  return {
    code: row.code,
    name: row.name,
    type: row.type as 'SUM' | 'MEAN' | 'COUNT',
    innerCalculations: row.questionCodes.map((qc) => ({
      id: crypto.randomUUID(),
      questionCode: qc,
      multiplier: 1,
    })),
  };
}

export function ImportCalculationsDialog({ questionnaire, onImport, onClose }: Props) {
  const uiLang = useUILang();
  const [rawText, setRawText] = useState('');
  const [hasHeader, setHasHeader] = useState(true);
  const [replaceExisting, setReplaceExisting] = useState(false);

  const parsedRows = rawText.trim().length > 0 ? parseRows(rawText, hasHeader) : [];
  const validRows = parsedRows.filter((r) => r.valid);
  const invalidRows = parsedRows.filter((r) => !r.valid);

  function handleImport() {
    const calculations = validRows.map(rowToCalculation);
    if (replaceExisting) {
      onImport(calculations);
    } else {
      const existing = questionnaire.calculations?.calculations ?? [];
      onImport([...existing, ...calculations]);
    }
  }

  const hint = t('importCalcsFormat', uiLang);
  const example = 'TOTAL | Total score | SUM | Q1,Q2,Q3';

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40" />
        <Dialog.Content className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-xl w-[680px] max-w-[95vw] max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-cw-border shrink-0">
            <div>
              <Dialog.Title className="text-sm font-semibold text-cw-blue">
                {t('importCalcsTitle', uiLang)}
              </Dialog.Title>
              <Dialog.Description className="text-xs text-gray-500 mt-0.5">
                {t('importCalcsHelp', uiLang)}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button className="p-1.5 text-gray-400 hover:text-gray-700 rounded">
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-auto px-5 py-4 space-y-4">
            {/* Format hint */}
            <div className="bg-gray-50 border border-cw-border rounded p-3 text-xs space-y-1">
              <p className="font-medium text-gray-600">{hint}</p>
              <p className="text-gray-500">{t('importCalcsTypes', uiLang)}</p>
              <p className="text-gray-500">{t('importCalcsCodes', uiLang)}</p>
              <p className="font-mono text-gray-700 bg-white border border-cw-border rounded px-2 py-1 mt-1 select-all">{example}</p>
              <p className="text-gray-400 text-[11px]">
                {t('importCalcsSep', uiLang)}
              </p>
            </div>

            {/* Options */}
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasHeader}
                  onChange={(e) => setHasHeader(e.target.checked)}
                  className="w-3.5 h-3.5 accent-cw-blue"
                />
                {t('skipHeader', uiLang)}
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={replaceExisting}
                  onChange={(e) => setReplaceExisting(e.target.checked)}
                  className="w-3.5 h-3.5 accent-cw-blue"
                />
                {t('replaceExistingCalcs', uiLang)}
              </label>
            </div>

            {/* Textarea */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                {t('pasteData', uiLang)}
              </label>
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                rows={8}
                spellCheck={false}
                placeholder={`code\tname\ttype\tquestionCodes\nTOTAL\tTotal score\tSUM\tQ1,Q2,Q3\nSUBSCALE\tSubscale\tMEAN\tQ4,Q5`}
                className="w-full border border-cw-border rounded px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-cw-blue-light resize-y"
              />
            </div>

            {/* Preview */}
            {parsedRows.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">
                  {t('previewPanel', uiLang)}
                  {' — '}
                  <span className="text-green-600">{validRows.length} {t('validWord', uiLang)}</span>
                  {invalidRows.length > 0 && (
                    <span className="text-red-500 ml-2">{invalidRows.length} {t('validationErrorsPlural', uiLang)}</span>
                  )}
                </p>
                <div className="border border-cw-border rounded overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b border-cw-border">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-medium text-gray-500 w-8">#</th>
                        <th className="px-2 py-1.5 text-left font-medium text-gray-500">{t('code', uiLang)}</th>
                        <th className="px-2 py-1.5 text-left font-medium text-gray-500">{t('name', uiLang)}</th>
                        <th className="px-2 py-1.5 text-left font-medium text-gray-500">{t('typeLabel', uiLang)}</th>
                        <th className="px-2 py-1.5 text-left font-medium text-gray-500">{t('questions', uiLang)}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedRows.map((row, i) => (
                        <tr
                          key={i}
                          className={`border-t border-cw-border ${row.valid ? '' : 'bg-red-50'}`}
                        >
                          <td className="px-2 py-1 text-gray-400">{i + 1 + (hasHeader ? 1 : 0)}</td>
                          <td className="px-2 py-1 font-mono font-semibold text-cw-blue">{row.code || <span className="text-red-400 italic">{t('emptyWord', uiLang)}</span>}</td>
                          <td className="px-2 py-1 text-gray-700">{row.name}</td>
                          <td className="px-2 py-1">
                            {row.valid ? (
                              <span className="font-mono text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5">{row.type}</span>
                            ) : (
                              <span className="text-red-500 font-mono">{row.type || '—'}</span>
                            )}
                          </td>
                          <td className="px-2 py-1 text-gray-600">
                            {row.valid
                              ? row.questionCodes.join(', ') || <span className="text-gray-400 italic">{t('noneWord', uiLang)}</span>
                              : <span className="text-red-500 text-[11px]">{row.error}</span>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-cw-border shrink-0">
            <p className="text-xs text-gray-400">
              {replaceExisting
                ? (t('willReplaceCalcs', uiLang))
                : (t('willAppendCalcs', uiLang))}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-3 py-1.5 text-sm text-gray-600 border border-cw-border rounded hover:bg-gray-50 transition-colors"
              >
                {t('cancelBtn', uiLang)}
              </button>
              <button
                onClick={handleImport}
                disabled={validRows.length === 0}
                className="px-4 py-1.5 text-sm bg-cw-blue text-white rounded hover:bg-cw-blue-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {uiLang === 'NO'
                  ? `Importer ${validRows.length > 0 ? `(${validRows.length})` : ''}`
                  : `Import ${validRows.length > 0 ? `(${validRows.length})` : ''}`}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
