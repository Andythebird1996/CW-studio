import * as Dialog from '@radix-ui/react-dialog';
import { useState, useMemo, useCallback } from 'react';
import { X } from 'lucide-react';
import type {
  Questionnaire,
  Section,
  Question,
  LanguageType,
  TextOption,
} from '../../types/questionnaire';
import { t, countPhrase, useUILang } from '../../i18n';

// ─── Props ────────────────────────────────────────────────────────────────────

interface FindReplaceDialogProps {
  questionnaire: Questionnaire;
  onChange: (q: Questionnaire) => void;
  onClose: () => void;
}

// ─── Scope flags ──────────────────────────────────────────────────────────────

interface Scopes {
  questionTexts: boolean;
  sectionTitles: boolean;
  codes: boolean;
  answerOptions: boolean;
}

// ─── Match descriptor ─────────────────────────────────────────────────────────

interface Match {
  /** Human-readable label */
  label: string;
  /** The full text field value that contains the match */
  fieldValue: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function applyReplace(value: string, find: string, replace: string, caseSensitive: boolean): string {
  if (!find) return value;
  if (caseSensitive) {
    return value.split(find).join(replace);
  }
  // Case-insensitive: rebuild with preserved surrounding chars
  const regex = new RegExp(escapeRegex(find), 'gi');
  return value.replace(regex, replace);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsMatch(value: string, find: string, caseSensitive: boolean): boolean {
  if (!find || !value) return false;
  if (caseSensitive) return value.includes(find);
  return value.toLowerCase().includes(find.toLowerCase());
}

function replaceInTexts(
  texts: Record<LanguageType, string>,
  find: string,
  replace: string,
  caseSensitive: boolean,
): Record<LanguageType, string> {
  const result = { ...texts };
  for (const lang of Object.keys(result) as LanguageType[]) {
    if (result[lang]) {
      result[lang] = applyReplace(result[lang], find, replace, caseSensitive);
    }
  }
  return result;
}

function replaceInOptions(
  options: TextOption[],
  find: string,
  replace: string,
  caseSensitive: boolean,
  scopes: Scopes,
): TextOption[] {
  return options.map((opt) => {
    let newOpt = { ...opt };
    if (scopes.codes && containsMatch(opt.code, find, caseSensitive)) {
      newOpt = { ...newOpt, code: applyReplace(opt.code, find, replace, caseSensitive) };
    }
    if (scopes.answerOptions && opt.texts) {
      newOpt = { ...newOpt, texts: replaceInTexts(opt.texts, find, replace, caseSensitive) };
    }
    return newOpt;
  });
}

function replaceInQuestion(
  q: Question,
  find: string,
  replace: string,
  caseSensitive: boolean,
  scopes: Scopes,
): Question {
  let updated = { ...q };

  if (scopes.codes && containsMatch(q.code, find, caseSensitive)) {
    updated = { ...updated, code: applyReplace(q.code, find, replace, caseSensitive) };
  }

  if (scopes.questionTexts && q.texts) {
    updated = { ...updated, texts: replaceInTexts(q.texts, find, replace, caseSensitive) };
  }

  // Answer options on applicable question types
  if (scopes.answerOptions || scopes.codes) {
    if (
      (updated.type === 'radiobutton' || updated.type === 'checkbox' || updated.type === 'combobox' || updated.type === 'rank') &&
      (updated as any).options
    ) {
      (updated as any) = {
        ...updated,
        options: replaceInOptions((updated as any).options, find, replace, caseSensitive, scopes),
      };
    }
  }

  return updated;
}

function replaceInSection(
  section: Section,
  find: string,
  replace: string,
  caseSensitive: boolean,
  scopes: Scopes,
): Section {
  let updated = { ...section };

  if (scopes.codes && section.code && containsMatch(section.code, find, caseSensitive)) {
    updated = { ...updated, code: applyReplace(section.code, find, replace, caseSensitive) };
  }

  if (scopes.sectionTitles && section.titles) {
    updated = { ...updated, titles: replaceInTexts(section.titles, find, replace, caseSensitive) };
  }

  updated = {
    ...updated,
    questions: section.questions.map((q) => replaceInQuestion(q, find, replace, caseSensitive, scopes)),
  };

  if (section.subSections) {
    updated = {
      ...updated,
      subSections: section.subSections.map((s) => replaceInSection(s, find, replace, caseSensitive, scopes)),
    };
  }

  return updated;
}

function applyReplaceAll(
  questionnaire: Questionnaire,
  find: string,
  replace: string,
  caseSensitive: boolean,
  scopes: Scopes,
): Questionnaire {
  return {
    ...questionnaire,
    sections: questionnaire.sections.map((s) =>
      replaceInSection(s, find, replace, caseSensitive, scopes),
    ),
  };
}

// ─── Match collection (for preview) ──────────────────────────────────────────

function collectMatchesInOptions(
  options: TextOption[],
  find: string,
  caseSensitive: boolean,
  scopes: Scopes,
  contextLabel: string,
  out: Match[],
): void {
  for (const opt of options) {
    if (out.length >= 200) return;
    if (scopes.codes && containsMatch(opt.code, find, caseSensitive)) {
      out.push({ label: `${contextLabel} / option code`, fieldValue: opt.code });
    }
    if (scopes.answerOptions && opt.texts) {
      for (const lang of Object.keys(opt.texts) as LanguageType[]) {
        if (opt.texts[lang] && containsMatch(opt.texts[lang], find, caseSensitive)) {
          out.push({ label: `${contextLabel} / option [${lang}]`, fieldValue: opt.texts[lang] });
        }
      }
    }
  }
}

function collectMatchesInQuestion(
  q: Question,
  find: string,
  caseSensitive: boolean,
  scopes: Scopes,
  sectionLabel: string,
  out: Match[],
): void {
  const qLabel = `${sectionLabel} > ${q.code || '(no code)'}`;
  if (scopes.codes && containsMatch(q.code, find, caseSensitive)) {
    out.push({ label: `${qLabel} [code]`, fieldValue: q.code });
  }
  if (scopes.questionTexts && q.texts) {
    for (const lang of Object.keys(q.texts) as LanguageType[]) {
      if (q.texts[lang] && containsMatch(q.texts[lang], find, caseSensitive)) {
        out.push({ label: `${qLabel} [text ${lang}]`, fieldValue: q.texts[lang] });
      }
    }
  }
  if ((scopes.answerOptions || scopes.codes) &&
    (q.type === 'radiobutton' || q.type === 'checkbox' || q.type === 'combobox' || q.type === 'rank') &&
    (q as any).options) {
    collectMatchesInOptions((q as any).options, find, caseSensitive, scopes, qLabel, out);
  }
}

function collectMatchesInSection(
  section: Section,
  find: string,
  caseSensitive: boolean,
  scopes: Scopes,
  out: Match[],
): void {
  const sLabel = section.code ?? '(no code)';
  if (scopes.codes && section.code && containsMatch(section.code, find, caseSensitive)) {
    out.push({ label: `Section: ${sLabel} [code]`, fieldValue: section.code });
  }
  if (scopes.sectionTitles && section.titles) {
    for (const lang of Object.keys(section.titles) as LanguageType[]) {
      if (section.titles[lang] && containsMatch(section.titles[lang], find, caseSensitive)) {
        out.push({ label: `Section: ${sLabel} [title ${lang}]`, fieldValue: section.titles[lang] });
      }
    }
  }
  for (const q of section.questions) {
    if (out.length >= 200) return;
    collectMatchesInQuestion(q, find, caseSensitive, scopes, `Section: ${sLabel}`, out);
  }
  if (section.subSections) {
    for (const sub of section.subSections) {
      if (out.length >= 200) return;
      collectMatchesInSection(sub, find, caseSensitive, scopes, out);
    }
  }
}

function collectAllMatches(
  questionnaire: Questionnaire,
  find: string,
  caseSensitive: boolean,
  scopes: Scopes,
): Match[] {
  const out: Match[] = [];
  if (!find) return out;
  for (const section of questionnaire.sections) {
    if (out.length >= 200) break;
    collectMatchesInSection(section, find, caseSensitive, scopes, out);
  }
  return out;
}

// ─── Highlighted preview text ─────────────────────────────────────────────────

function HighlightedPreview({
  text,
  find,
  caseSensitive,
}: {
  text: string;
  find: string;
  caseSensitive: boolean;
}) {
  if (!find) return <span className="text-gray-700">{text}</span>;
  const flags = caseSensitive ? 'g' : 'gi';
  const regex = new RegExp(`(${escapeRegex(find)})`, flags);
  const parts = text.split(regex);
  return (
    <span className="text-gray-700">
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-yellow-200 text-yellow-900 rounded-[2px]">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FindReplaceDialog({ questionnaire, onChange, onClose }: FindReplaceDialogProps) {
  const uiLang = useUILang();

  const [find, setFind] = useState('');
  const [replace, setReplace] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [scopes, setScopes] = useState<Scopes>({
    questionTexts: true,
    sectionTitles: true,
    codes: false,
    answerOptions: false,
  });
  const [replaced, setReplaced] = useState<number | null>(null);

  const matches = useMemo(
    () => collectAllMatches(questionnaire, find, caseSensitive, scopes),
    [questionnaire, find, caseSensitive, scopes],
  );

  function toggleScope(key: keyof Scopes) {
    setScopes((s) => ({ ...s, [key]: !s[key] }));
    setReplaced(null);
  }

  const handleReplaceAll = useCallback(() => {
    if (!find) return;
    const updated = applyReplaceAll(questionnaire, find, replace, caseSensitive, scopes);
    onChange(updated);
    setReplaced(matches.length);
  }, [questionnaire, find, replace, caseSensitive, scopes, matches.length, onChange]);

  // Reset "replaced" indicator when inputs change
  function handleFindChange(v: string) {
    setFind(v);
    setReplaced(null);
  }
  function handleReplaceChange(v: string) {
    setReplace(v);
    setReplaced(null);
  }

  const scopeOptions: Array<{ key: keyof Scopes; labelKey: 'scopeQuestionTexts' | 'scopeSectionTitles' | 'scopeCodes' | 'optionsLabel' }> = [
    { key: 'questionTexts', labelKey: 'scopeQuestionTexts' },
    { key: 'sectionTitles', labelKey: 'scopeSectionTitles' },
    { key: 'codes',         labelKey: 'scopeCodes' },
    { key: 'answerOptions', labelKey: 'optionsLabel' },
  ];

  const matchCountLabel =
    find.trim() === ''
      ? ''
      : matches.length === 0
        ? t('noMatches', uiLang)
        : matches.length >= 200
          ? t('matchesPlus', uiLang)
          : countPhrase(matches.length, uiLang, 'nMatchOne', 'nMatchMany');

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl z-50 flex flex-col"
          style={{ width: 560, maxHeight: '85vh' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-cw-border">
            <Dialog.Title className="text-base font-semibold text-cw-blue">
              {t('findReplace', uiLang)}
            </Dialog.Title>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-cw-gray text-cw-gray-text hover:text-gray-700 transition-colors"
              aria-label={t('close', uiLang)}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

            {/* Find / Replace inputs */}
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('find', uiLang)}
                </label>
                <input
                  type="text"
                  value={find}
                  onChange={(e) => handleFindChange(e.target.value)}
                  placeholder={t('searchTextPh', uiLang)}
                  className="w-full border border-cw-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cw-blue-light"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('replaceWith', uiLang)}
                </label>
                <input
                  type="text"
                  value={replace}
                  onChange={(e) => handleReplaceChange(e.target.value)}
                  placeholder={t('replacementPh', uiLang)}
                  className="w-full border border-cw-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cw-blue-light"
                />
              </div>
            </div>

            {/* Options row */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {/* Case sensitive toggle */}
              <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={caseSensitive}
                  onChange={() => { setCaseSensitive((v) => !v); setReplaced(null); }}
                  className="rounded border-cw-border text-cw-blue"
                />
                {t('caseSensitive', uiLang)}
              </label>
            </div>

            {/* Scope checkboxes */}
            <div>
              <p className="text-xs font-medium text-cw-gray-text uppercase tracking-wide mb-2">
                {t('searchIn', uiLang)}
              </p>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {scopeOptions.map(({ key, labelKey }) => (
                  <label
                    key={key}
                    className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-700"
                  >
                    <input
                      type="checkbox"
                      checked={scopes[key]}
                      onChange={() => toggleScope(key)}
                      className="rounded border-cw-border text-cw-blue"
                    />
                    {t(labelKey, uiLang)}
                  </label>
                ))}
              </div>
            </div>

            {/* Match count + action */}
            <div className="flex items-center justify-between gap-4">
              <span className={`text-sm ${matches.length === 0 && find ? 'text-cw-gray-text' : 'text-gray-700'}`}>
                {matchCountLabel}
              </span>
              <button
                onClick={handleReplaceAll}
                disabled={!find.trim() || matches.length === 0}
                className="px-4 py-2 bg-cw-blue text-white text-sm rounded hover:bg-cw-blue/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t('replaceAll', uiLang)}
              </button>
            </div>

            {/* Replaced confirmation */}
            {replaced !== null && (
              <div className="px-3 py-2 bg-green-50 border border-green-200 rounded text-sm text-green-800">
                {countPhrase(replaced, uiLang, 'nReplaceOne', 'nReplaceMany')}
              </div>
            )}

            {/* Preview list */}
            {find.trim() !== '' && matches.length > 0 && (
              <div>
                <p className="text-xs font-medium text-cw-gray-text uppercase tracking-wide mb-2">
                  {t('previewPanel', uiLang)}
                </p>
                <ul className="border border-cw-border rounded divide-y divide-cw-border max-h-64 overflow-y-auto">
                  {matches.map((match, idx) => (
                    <li key={idx} className="px-3 py-2">
                      <div className="text-xs text-cw-gray-text font-mono truncate mb-0.5">
                        {match.label}
                      </div>
                      <div className="text-sm truncate">
                        <HighlightedPreview
                          text={match.fieldValue}
                          find={find}
                          caseSensitive={caseSensitive}
                        />
                      </div>
                    </li>
                  ))}
                  {matches.length >= 200 && (
                    <li className="px-3 py-2 text-xs text-cw-gray-text text-center">
                      {t('showingMax', uiLang)}
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-cw-border flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 border border-cw-border rounded hover:bg-cw-gray transition-colors"
            >
              {t('close', uiLang)}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
