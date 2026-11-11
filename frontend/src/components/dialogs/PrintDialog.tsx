import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { t, useUILang, type UILang } from '../../i18n';
import type { Questionnaire, LanguageType } from '../../types/questionnaire';
import { RespondentSheet, type AnswerMap } from '../preview/AssessmentPreview';

const EMPTY_ANSWERS: AnswerMap = new Map();

interface Props {
  open: boolean;
  onClose: () => void;
  questionnaire: Questionnaire;
}

const LANGUAGE_NAMES: Record<LanguageType, string> = {
  NO: 'Norsk',
  EN: 'English',
  SV: 'Svenska',
  DA: 'Dansk',
  FI: 'Suomi',
  DE: 'Deutsch',
  FR: 'Français',
  PL: 'Polski',
};

function annotationLang(lang: LanguageType): UILang {
  if (lang === 'NO') return 'NO';
  return 'EN';
}

export function PrintDialog({ open, onClose, questionnaire }: Props) {
  const lang = useUILang();
  const [printLang, setPrintLang] = useState<LanguageType>(questionnaire.defaultLanguage);
  const [expertMode, setExpertMode] = useState(false);

  function handlePrint() {
    // The sheet is already in the document, so print uses the same CSS as the preview.
    setTimeout(() => window.print(), 50);
  }

  const inputCls =
    'w-full border border-cw-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cw-blue-light';

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Dialog.Content
          aria-describedby={undefined}
          className="cw-dialog fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl z-50 flex flex-col p-4 sm:p-6 overflow-y-auto"
          style={{ width: 420 }}
        >
          <Dialog.Title className="text-lg font-semibold text-cw-blue mb-5">
            {t('printDialogTitle', lang)}
          </Dialog.Title>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('printLanguage', lang)}
              </label>
              <select
                className={inputCls}
                value={printLang}
                onChange={(e) => setPrintLang(e.target.value as LanguageType)}
              >
                {questionnaire.supportedLanguages.map((l) => (
                  <option key={l} value={l}>
                    {LANGUAGE_NAMES[l] ?? l}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={expertMode}
                onChange={(e) => setExpertMode(e.target.checked)}
                className="w-4 h-4 accent-cw-blue"
              />
              <span className="text-sm text-gray-700">{t('printExpertMode', lang)}</span>
            </label>
          </div>

          <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-cw-border">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm border border-cw-border rounded hover:bg-gray-50"
            >
              {t('printCancel', lang)}
            </button>
            <button
              onClick={handlePrint}
              className="px-4 py-2 text-sm bg-cw-blue text-white rounded hover:bg-cw-blue-light"
            >
              {t('printBtn', lang)}
            </button>
          </div>

        </Dialog.Content>
      </Dialog.Portal>
      {open && createPortal(
        <div className="cw-print-sheet" id="cw-print-sheet" aria-hidden="true">
          <RespondentSheet
            mode="document"
            questionnaire={questionnaire}
            lang={printLang}
            answers={EMPTY_ANSWERS}
            expertMode={expertMode}
            chromeLang={annotationLang(printLang)}
            showAll
          />
        </div>,
        document.body,
      )}
    </Dialog.Root>
  );
}
