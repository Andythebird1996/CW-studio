import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import {t,  useUILang } from '../../i18n';
import type { LanguageType } from '../../types/questionnaire';

export interface NewQuestionnaireConfig {
  name: string;
  code: string;
  version: string;
  defaultLanguage: LanguageType;
  clinicianOnly?: boolean;
  exportAllowed?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (config: NewQuestionnaireConfig) => void;
}

const LANGUAGES: { value: LanguageType; label: string }[] = [
  { value: 'NO', label: 'Norsk (NO)' },
  { value: 'EN', label: 'English (EN)' },
  { value: 'SV', label: 'Svenska (SV)' },
  { value: 'DA', label: 'Dansk (DA)' },
  { value: 'FI', label: 'Suomi (FI)' },
  { value: 'DE', label: 'Deutsch (DE)' },
  { value: 'FR', label: 'Français (FR)' },
  { value: 'PL', label: 'Polski (PL)' },
];

export function NewQuestionnaireDialog({ open, onClose, onCreate }: Props) {
  const lang = useUILang();

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [version, setVersion] = useState('1.0');
  const [defaultLanguage, setDefaultLanguage] = useState<LanguageType>('NO');
  const [clinicianOnly, setClinicianOnly] = useState(false);
  const [exportAllowed, setExportAllowed] = useState(true);
  const [codeError, setCodeError] = useState(false);

  function resetForm() {
    setName('');
    setCode('');
    setVersion('1.0');
    setDefaultLanguage('NO');
    setClinicianOnly(false);
    setExportAllowed(true);
    setCodeError(false);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function handleSubmit() {
    if (!code.trim()) {
      setCodeError(true);
      return;
    }
    onCreate({ name, code: code.trim(), version, defaultLanguage, clinicianOnly, exportAllowed });
    resetForm();
  }

  const isValid = code.trim().length > 0;

  const inputCls =
    'w-full border border-cw-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cw-blue-light';

  const labelCls = 'block text-sm font-medium text-gray-700 mb-1';

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Dialog.Content
          aria-describedby={undefined}
          className="cw-dialog fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl z-50 flex flex-col overflow-hidden"
          style={{ width: 440, maxHeight: '90vh' }}
        >
          <div className="p-4 sm:p-6 flex flex-col gap-4 overflow-y-auto min-h-0">
            <Dialog.Title className="text-lg font-semibold text-cw-blue">
              {t('newQuestionnaire', lang)}
            </Dialog.Title>

            {/* Navn */}
            <div>
              <label className={labelCls}>
                {t('name', lang)}
              </label>
              <input
                type="text"
                className={inputCls}
                placeholder={t('assessmentNamePh', lang)}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>

            {/* Kode */}
            <div>
              <label className={labelCls}>
                {t('code', lang)}
                <span className="text-red-500 ml-0.5">*</span>
              </label>
              <input
                type="text"
                className={`${inputCls} font-mono${codeError ? ' border-red-400 focus:ring-red-300' : ''}`}
                placeholder="MY_ASSESSMENT"
                value={code}
                onChange={(e) => {
                  const formatted = e.target.value.toUpperCase().replace(/\s/g, '_');
                  setCode(formatted);
                  if (formatted.trim()) setCodeError(false);
                }}
              />
              {codeError && (
                <p className="text-xs text-red-600 mt-1">
                  {t('codeRequired', lang)}
                </p>
              )}
            </div>

            {/* Versjon */}
            <div>
              <label className={labelCls}>
                {t('version', lang)}
              </label>
              <input
                type="text"
                className={inputCls}
                placeholder="1.0"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
              />
            </div>

            {/* Standardspråk */}
            <div>
              <label className={labelCls}>
                {t('defaultLanguage', lang)}
              </label>
              <select
                className={inputCls}
                value={defaultLanguage}
                onChange={(e) => setDefaultLanguage(e.target.value as LanguageType)}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Checkboxes */}
            <div className="flex flex-col gap-2 pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-700">
                <input
                  type="checkbox"
                  className="rounded border-cw-border accent-cw-blue"
                  checked={clinicianOnly}
                  onChange={(e) => setClinicianOnly(e.target.checked)}
                />
                {t('clinicianOnly', lang)}
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-700">
                <input
                  type="checkbox"
                  className="rounded border-cw-border accent-cw-blue"
                  checked={exportAllowed}
                  onChange={(e) => setExportAllowed(e.target.checked)}
                />
                {t('allowExportShort', lang)}
              </label>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-cw-border shrink-0">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm border border-cw-border rounded hover:bg-gray-50"
            >
              {t('cancelBtn', lang)}
            </button>
            <button
              onClick={handleSubmit}
              disabled={!isValid}
              className="px-4 py-2 text-sm bg-cw-blue text-white rounded hover:bg-cw-blue-light disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t('create', lang)}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
