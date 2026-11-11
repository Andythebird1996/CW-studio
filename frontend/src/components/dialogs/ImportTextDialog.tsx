import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import type { Questionnaire, Section, RadiobuttonQuestion, LanguageType } from '../../types/questionnaire';
import { t, useUILang } from '../../i18n';

interface Props {
  open: boolean;
  questionnaire: Questionnaire;
  onClose: () => void;
  onImport: (questionnaire: Questionnaire) => void;
}

type SeparatorType = 'newline' | 'double-newline' | 'custom';

const SEPARATOR_OPTIONS: Array<{ value: SeparatorType; labelKey: 'sepNewline' | 'sepDoubleNewline' | 'sepCustom' }> = [
  { value: 'newline',        labelKey: 'sepNewline' },
  { value: 'double-newline', labelKey: 'sepDoubleNewline' },
  { value: 'custom',         labelKey: 'sepCustom' },
];

function resolveSeparator(type: SeparatorType, custom: string): string {
  if (type === 'newline')        return '\n';
  if (type === 'double-newline') return '\n\n';
  return custom || '\n';
}

export function ImportTextDialog({ open, questionnaire, onClose, onImport }: Props) {
  const uiLang = useUILang();
  const lang = questionnaire.defaultLanguage;

  const [text, setText] = useState('');
  const [separatorType, setSeparatorType] = useState<SeparatorType>('newline');
  const [customSeparator, setCustomSeparator] = useState('');
  const [templateCode, setTemplateCode] = useState('');
  const [required, setRequired] = useState(false);
  const [readonly, setReadonly] = useState(false);
  const [reversedScore, setReversedScore] = useState(false);

  function handleClose() {
    // reset state on close
    setText('');
    setSeparatorType('newline');
    setCustomSeparator('');
    setTemplateCode('');
    setRequired(false);
    setReadonly(false);
    setReversedScore(false);
    onClose();
  }

  function handleImport() {
    const sep = resolveSeparator(separatorType, customSeparator);
    const lines = text
      .split(sep)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length === 0) return;

    const questions: RadiobuttonQuestion[] = lines.map((line) => {
      const q: RadiobuttonQuestion = {
        id: crypto.randomUUID(),
        code: '',
        type: 'radiobutton',
        texts: { [lang]: line } as Record<LanguageType, string>,
        required,
        readonly,
        reversedScore,
        options: [],
      };
      if (templateCode) q.responseTemplateCode = templateCode;
      return q;
    });

    const newSection: Section = {
      id: crypto.randomUUID(),
      code: '',
      type: 'NORMAL',
      titles: { [lang]: '' } as Record<LanguageType, string>,
      questions,
    };

    const updated: Questionnaire = {
      ...questionnaire,
      sections: [...questionnaire.sections, newSection],
    };

    onImport(updated);
    handleClose();
  }

  const templates = questionnaire.responseTemplates?.templates ?? [];
  const isEmpty = text.trim().length === 0;

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl w-[520px] flex flex-col z-50"
        >
          <div className="p-4 border-b border-cw-border">
            <Dialog.Title className="text-lg font-semibold text-cw-blue">
              {t('importQuestionTexts', uiLang)}
            </Dialog.Title>
          </div>

          <div className="p-4 flex flex-col gap-4 overflow-auto">
            {/* Textarea */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                {t('pasteQuestionTexts', uiLang)}
              </label>
              <textarea
                rows={8}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  t('oneQuestionPerLine', uiLang)
                }
                className="w-full border border-cw-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cw-blue-light resize-none"
              />
            </div>

            {/* Separator */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  {t('separator', uiLang)}
                </label>
                <select
                  value={separatorType}
                  onChange={(e) => setSeparatorType(e.target.value as SeparatorType)}
                  className="w-full border border-cw-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
                >
                  {SEPARATOR_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {t(opt.labelKey, uiLang)}
                    </option>
                  ))}
                </select>
              </div>

              {separatorType === 'custom' && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    {t('customSeparator', uiLang)}
                  </label>
                  <input
                    type="text"
                    value={customSeparator}
                    onChange={(e) => setCustomSeparator(e.target.value)}
                    placeholder={t('separatorExample', uiLang)}
                    className="w-full border border-cw-border rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
                  />
                </div>
              )}
            </div>

            {/* Response template */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                {t('templateLabel', uiLang)}
              </label>
              <select
                value={templateCode}
                onChange={(e) => setTemplateCode(e.target.value)}
                className="w-full border border-cw-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
              >
                <option value="">{t('noneParen', uiLang)}</option>
                {templates.map((tpl) => (
                  <option key={tpl.code} value={tpl.code}>
                    {tpl.code} — {tpl.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Checkboxes */}
            <div className="flex flex-wrap gap-5">
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={required}
                  onChange={(e) => setRequired(e.target.checked)}
                  className="w-4 h-4 accent-cw-blue"
                />
                {t('required', uiLang)}
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={readonly}
                  onChange={(e) => setReadonly(e.target.checked)}
                  className="w-4 h-4 accent-cw-blue"
                />
                {t('readonlyQ', uiLang)}
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={reversedScore}
                  onChange={(e) => setReversedScore(e.target.checked)}
                  className="w-4 h-4 accent-cw-blue"
                />
                {t('reversedScore', uiLang)}
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
              disabled={isEmpty}
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
