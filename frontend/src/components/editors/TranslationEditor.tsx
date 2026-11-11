import { useState, useEffect } from 'react';
import { Trash2, Wand2 } from 'lucide-react';
import type { Questionnaire, LanguageType, Section } from '../../types/questionnaire';
import { autoTranslate } from '../../services/translate-api';
import { t, useUILang } from '../../i18n';

function flattenSections(sections: Section[]): Section[] {
  const result: Section[] = [];
  const queue = [...sections];
  while (queue.length > 0) {
    const s = queue.shift()!;
    result.push(s);
    if (s.subSections?.length) queue.push(...s.subSections);
  }
  return result;
}

function updateSectionTitle(sections: Section[], id: string, lang: LanguageType, val: string): Section[] {
  return sections.map((s) => {
    if (s.id === id) return { ...s, titles: { ...s.titles, [lang]: val } };
    if (s.subSections?.length)
      return { ...s, subSections: updateSectionTitle(s.subSections, id, lang, val) };
    return s;
  });
}

function updateQuestionText(sections: Section[], sId: string, qId: string, lang: LanguageType, val: string): Section[] {
  return sections.map((s) => {
    if (s.id === sId) {
      return {
        ...s,
        questions: s.questions.map((q) =>
          q.id === qId ? { ...q, texts: { ...q.texts, [lang]: val } } : q,
        ),
      };
    }
    if (s.subSections?.length)
      return { ...s, subSections: updateQuestionText(s.subSections, sId, qId, lang, val) };
    return s;
  });
}

function updateQuestionHelpText(sections: Section[], sId: string, qId: string, lang: LanguageType, val: string): Section[] {
  return sections.map((s) => {
    if (s.id === sId) {
      return {
        ...s,
        questions: s.questions.map((q) =>
          q.id === qId
            ? { ...q, helpTexts: { ...(q.helpTexts ?? {}), [lang]: val } as Record<LanguageType, string> }
            : q,
        ),
      };
    }
    if (s.subSections?.length)
      return { ...s, subSections: updateQuestionHelpText(s.subSections, sId, qId, lang, val) };
    return s;
  });
}

function updateSliderLabel(sections: Section[], sId: string, qId: string, field: 'minLabel' | 'maxLabel', lang: LanguageType, val: string): Section[] {
  return sections.map((s) => {
    if (s.id === sId) {
      return {
        ...s,
        questions: s.questions.map((q) => {
          if (q.id !== qId || q.type !== 'slider') return q;
          return {
            ...q,
            [field]: { ...((q as any)[field] ?? {}), [lang]: val } as Record<LanguageType, string>,
          };
        }),
      };
    }
    if (s.subSections?.length)
      return { ...s, subSections: updateSliderLabel(s.subSections, sId, qId, field, lang, val) };
    return s;
  });
}

function updateOptionText(
  sections: Section[],
  sId: string,
  qId: string,
  optCode: string,
  lang: LanguageType,
  val: string,
): Section[] {
  return sections.map((s) => {
    if (s.id === sId) {
      return {
        ...s,
        questions: s.questions.map((q) => {
          if (q.id !== qId) return q;
          const opts = (q as any).options as Array<{ code: string; texts?: Partial<Record<LanguageType, string>> }> | undefined;
          if (!opts) return q;
          return {
            ...q,
            options: opts.map((o) =>
              o.code === optCode
                ? { ...o, texts: { ...(o.texts ?? {}), [lang]: val } as Record<LanguageType, string> }
                : o,
            ),
          } as typeof q;
        }),
      };
    }
    if (s.subSections?.length)
      return { ...s, subSections: updateOptionText(s.subSections, sId, qId, optCode, lang, val) };
    return s;
  });
}

// ── Bulk translation helper ────────────────────────────────────────────────────
// Applies a Map<rowKey, translatedText> to the questionnaire in a single pass.

function applyBulkTranslations(
  questionnaire: Questionnaire,
  updates: Map<string, string>,
  lang: LanguageType,
): Questionnaire {
  if (updates.size === 0) return questionnaire;

  let q = questionnaire;

  // Questionnaire name
  const nameTrans = updates.get('q.name');
  if (nameTrans) q = { ...q, name: { ...q.name, [lang]: nameTrans } };

  // Sections (recursive)
  function applyToSections(sections: Section[]): Section[] {
    return sections.map((section) => {
      const titleTrans = updates.get(`s.${section.id}.title`);

      const newQuestions = section.questions.map((question, qi) => {
        const prefix = `s.${section.id}.q${qi}`;
        let updated: any = question;

        const textTrans = updates.get(`${prefix}.text`);
        if (textTrans) updated = { ...updated, texts: { ...updated.texts, [lang]: textTrans } };

        const helpTrans = updates.get(`${prefix}.helpText`);
        if (helpTrans) updated = { ...updated, helpTexts: { ...(updated.helpTexts ?? {}), [lang]: helpTrans } };

        if (question.type === 'slider') {
          const minTrans = updates.get(`${prefix}.minLabel`);
          if (minTrans) updated = { ...updated, minLabel: { ...(updated.minLabel ?? {}), [lang]: minTrans } };
          const maxTrans = updates.get(`${prefix}.maxLabel`);
          if (maxTrans) updated = { ...updated, maxLabel: { ...(updated.maxLabel ?? {}), [lang]: maxTrans } };
        }

        const opts = (question as any).options as Array<{ code: string; texts?: Record<string, string> }> | undefined;
        if (opts) {
          const newOpts = opts.map((opt) => {
            const optTrans = updates.get(`${prefix}.opt.${opt.code}`);
            return optTrans ? { ...opt, texts: { ...(opt.texts ?? {}), [lang]: optTrans } } : opt;
          });
          if (newOpts.some((o, i) => o !== opts[i])) updated = { ...updated, options: newOpts };
        }

        return updated;
      });

      const newSubs = section.subSections ? applyToSections(section.subSections) : undefined;
      const changed =
        titleTrans ||
        newQuestions.some((nq, i) => nq !== section.questions[i]) ||
        (newSubs && newSubs.some((ns, i) => ns !== section.subSections![i]));
      if (!changed) return section;

      return {
        ...section,
        ...(titleTrans ? { titles: { ...section.titles, [lang]: titleTrans } } : {}),
        questions: newQuestions,
        ...(newSubs ? { subSections: newSubs } : {}),
      };
    });
  }

  q = { ...q, sections: applyToSections(q.sections) };

  // Response templates
  if (q.responseTemplates) {
    const newTemplates = q.responseTemplates.templates.map((tpl) => {
      const newOpts = tpl.options.map((opt) => {
        const t = updates.get(`rt.${tpl.code}.${opt.code}`);
        return t ? { ...opt, texts: { ...(opt.texts ?? {}), [lang]: t } } : opt;
      });
      if (newOpts.every((o, i) => o === tpl.options[i])) return tpl;
      return { ...tpl, options: newOpts };
    });
    q = { ...q, responseTemplates: { templates: newTemplates } };
  }

  return q;
}

// ──────────────────────────────────────────────────────────────────────────────

const ALL_LANGUAGES: Array<{ code: LanguageType; label: string }> = [
  { code: 'NO', label: 'Norsk' },
  { code: 'EN', label: 'English' },
  { code: 'SV', label: 'Svenska' },
  { code: 'DA', label: 'Dansk' },
  { code: 'FI', label: 'Suomi' },
  { code: 'DE', label: 'Deutsch' },
  { code: 'FR', label: 'Français' },
  { code: 'PL', label: 'Polski' },
];

interface TranslationRow {
  key: string;
  context: string;
  texts: Partial<Record<LanguageType, string>>;
  update: (lang: LanguageType, value: string) => void;
}

interface Props {
  questionnaire: Questionnaire;
  onChange: (q: Questionnaire) => void;
}

function Cell({
  value,
  onChange,
  isMissing,
  isStale,
  onEdit,
}: {
  value: string;
  onChange: (v: string) => void;
  isMissing: boolean;
  isStale?: boolean;
  onEdit?: () => void;
}) {
  return (
    <td className={`px-2 py-1.5 border-b border-r border-cw-border ${isMissing ? 'bg-amber-50' : ''}`}>
      <div className="flex items-start gap-1">
        {isStale && (
          <span
            title="Source text has changed"
            className="mt-0.5 shrink-0 text-amber-500 cursor-default select-none"
            aria-label="Source text has changed"
          >
            ⚠
          </span>
        )}
        <textarea
          value={value}
          onChange={(e) => { onEdit?.(); onChange(e.target.value); }}
          rows={1}
          className="w-full text-sm resize-none bg-transparent focus:outline-none focus:bg-white focus:ring-1 focus:ring-cw-blue-light rounded px-1"
          style={{ minHeight: '1.5rem' }}
          onInput={(e) => {
            const t = e.currentTarget;
            t.style.height = 'auto';
            t.style.height = t.scrollHeight + 'px';
          }}
        />
      </div>
    </td>
  );
}

// Returns a simple hash of a string (btoa of value, safe-guarded for non-ASCII).
function hashSource(text: string): string {
  try {
    return btoa(unescape(encodeURIComponent(text)));
  } catch {
    return btoa(text);
  }
}

export function TranslationEditor({ questionnaire, onChange }: Props) {
  const uiLang = useUILang();
  const defaultLang = questionnaire.defaultLanguage;
  const [activeLangs, setActiveLangs] = useState<LanguageType[]>(
    questionnaire.supportedLanguages.length > 1
      ? questionnaire.supportedLanguages
      : [defaultLang, 'EN'],
  );
  const [translating, setTranslating] = useState<LanguageType | null>(null);
  const [translateError, setTranslateError] = useState<string | null>(null);
  const [translatingStale, setTranslatingStale] = useState(false);
  const [staleTranslateStatus, setStaleTranslateStatus] = useState<string | null>(null);
  // sourceHashes: Map<`${rowKey}:${lang}`, hash of source text at time of last translation>
  // Used to detect when source text has changed since a translation was made.
  const [sourceHashes, setSourceHashes] = useState<Map<string, string>>(new Map());

  // Sync activeLangs when questionnaire changes externally (e.g. undo/redo)
  useEffect(() => {
    if (questionnaire.supportedLanguages.length > 1) {
      setActiveLangs(questionnaire.supportedLanguages);
    }
  }, [questionnaire.supportedLanguages]);

  useEffect(() => {
    function handler(e: Event) {
      const lang = (e as CustomEvent<{ lang: LanguageType }>).detail.lang;
      if (!activeLangs.includes(lang)) setActiveLangs((prev) => [...prev, lang]);
      setTimeout(() => {
        document.getElementById(`translation-col-${lang}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
      }, 80);
    }
    window.addEventListener('select-language', handler);
    return () => window.removeEventListener('select-language', handler);
  }, [activeLangs]);

  // Helper: call onChange and ensure lang is in supportedLanguages in the same update
  function pushChange(updatedQ: Questionnaire, lang: LanguageType) {
    if (lang !== defaultLang && !updatedQ.supportedLanguages.includes(lang)) {
      onChange({ ...updatedQ, supportedLanguages: [...updatedQ.supportedLanguages, lang] });
    } else {
      onChange(updatedQ);
    }
  }

  // Collect all translatable rows
  const rows: TranslationRow[] = [];

  // Questionnaire name
  rows.push({
    key: 'q.name',
    context: 'Kartlegging: navn',
    texts: questionnaire.name,
    update: (lang, val) =>
      pushChange({ ...questionnaire, name: { ...questionnaire.name, [lang]: val } }, lang),
  });

  // Questionnaire description
  if (questionnaire.description && Object.keys(questionnaire.description).length > 0) {
    rows.push({
      key: 'q.description',
      context: 'Kartlegging: beskrivelse',
      texts: questionnaire.description,
      update: (lang, val) =>
        pushChange({ ...questionnaire, description: { ...questionnaire.description, [lang]: val } as Record<import('../../types/questionnaire').LanguageType, string> }, lang),
    });
  }

  // Sections (all levels via BFS)
  flattenSections(questionnaire.sections).forEach((section) => {
    if (section.titles[defaultLang] !== undefined) {
      rows.push({
        key: `s.${section.id}.title`,
        context: `Seksjon ${section.code || section.id}: tittel`,
        texts: section.titles,
        update: (lang, val) =>
          pushChange({
            ...questionnaire,
            sections: updateSectionTitle(questionnaire.sections, section.id, lang, val),
          }, lang),
      });
    }

    // Questions in section
    section.questions.forEach((q, qi) => {
      rows.push({
        key: `s.${section.id}.q${qi}.text`,
        context: `${q.code || `Q${qi + 1}`}: spørsmål`,
        texts: q.texts,
        update: (lang, val) =>
          pushChange({
            ...questionnaire,
            sections: updateQuestionText(questionnaire.sections, section.id, q.id, lang, val),
          }, lang),
      });

      // Help text
      if (q.helpTexts && Object.keys(q.helpTexts).length > 0) {
        rows.push({
          key: `s.${section.id}.q${qi}.helpText`,
          context: `${q.code || `Q${qi + 1}`}: hjelpetekst`,
          texts: q.helpTexts as Record<LanguageType, string>,
          update: (lang, val) =>
            pushChange({
              ...questionnaire,
              sections: updateQuestionHelpText(questionnaire.sections, section.id, q.id, lang, val),
            }, lang),
        });
      }

      // Slider labels
      if (q.type === 'slider') {
        if (q.minLabel && Object.keys(q.minLabel).length > 0) {
          rows.push({
            key: `s.${section.id}.q${qi}.minLabel`,
            context: `${q.code || `Q${qi + 1}`}: min-etikett`,
            texts: q.minLabel as Record<LanguageType, string>,
            update: (lang, val) =>
              pushChange({
                ...questionnaire,
                sections: updateSliderLabel(questionnaire.sections, section.id, q.id, 'minLabel', lang, val),
              }, lang),
          });
        }
        if (q.maxLabel && Object.keys(q.maxLabel).length > 0) {
          rows.push({
            key: `s.${section.id}.q${qi}.maxLabel`,
            context: `${q.code || `Q${qi + 1}`}: maks-etikett`,
            texts: q.maxLabel as Record<LanguageType, string>,
            update: (lang, val) =>
              pushChange({
                ...questionnaire,
                sections: updateSliderLabel(questionnaire.sections, section.id, q.id, 'maxLabel', lang, val),
              }, lang),
          });
        }
      }

      // Inline options (checkbox / radiobutton)
      const opts = (q as any).options as Array<{ code: string; texts?: Record<string, string> }> | undefined;
      opts?.forEach((opt) => {
        if (!opt.texts) return;
        rows.push({
          key: `s.${section.id}.q${qi}.opt.${opt.code}`,
          context: `${q.code || `Q${qi + 1}`} › ${opt.code}`,
          texts: opt.texts as Record<LanguageType, string>,
          update: (lang, val) =>
            pushChange({
              ...questionnaire,
              sections: updateOptionText(questionnaire.sections, section.id, q.id, opt.code, lang, val),
            }, lang),
        });
      });
    });
  });

  // Response template options
  questionnaire.responseTemplates?.templates.forEach((tmpl) => {
    tmpl.options.forEach((opt, oi) => {
      rows.push({
        key: `rt.${tmpl.code}.${opt.code}`,
        context: `${tmpl.code} › ${opt.code}`,
        texts: opt.texts,
        update: (lang, val) => {
          const newTemplates = questionnaire.responseTemplates!.templates.map((t) => {
            if (t.code !== tmpl.code) return t;
            return {
              ...t,
              options: t.options.map((o, oi2) =>
                oi2 !== oi ? o : { ...o, texts: { ...o.texts, [lang]: val } },
              ),
            };
          });
          pushChange({
            ...questionnaire,
            responseTemplates: { templates: newTemplates },
          }, lang);
        },
      });
    });
  });

  // ── Compute stale combos ────────────────────────────────────────────────────
  // A row:lang combo is stale when:
  //   - there is a stored hash AND the current source hash differs from it, OR
  //   - there is no stored hash BUT a translation already exists (was translated
  //     before hash tracking began and we cannot confirm it is still fresh).
  // We only consider target languages (not the default language).
  interface StaleCombo {
    row: TranslationRow;
    lang: LanguageType;
    sourceText: string;
  }

  const staleCount = (() => {
    let count = 0;
    for (const row of rows) {
      for (const lang of activeLangs) {
        if (lang === defaultLang) continue;
        const sourceText = row.texts[defaultLang] ?? '';
        const storedHash = sourceHashes.get(`${row.key}:${lang}`);
        const hasTranslation = !!row.texts[lang];
        const isStale =
          storedHash
            ? storedHash !== hashSource(sourceText)
            : false; // no hash → not counted as stale (only counted if hash exists and differs)
        if (isStale) count++;
        // Also count rows that have a translation but no hash at all (pre-hash era)
        else if (!storedHash && hasTranslation && sourceText) count++;
      }
    }
    return count;
  })();

  async function handleAutoTranslate(targetLang: LanguageType) {
    const missing = rows.filter((r) => !r.texts[targetLang]);
    if (missing.length === 0) return;

    setTranslating(targetLang);
    setTranslateError(null);
    try {
      const sourceTexts = missing.map((r) => r.texts[defaultLang] ?? '');
      const translated = await autoTranslate(sourceTexts, defaultLang, targetLang);

      const updates = new Map<string, string>();
      missing.forEach((r, i) => {
        if (translated[i]) updates.set(r.key, translated[i]);
      });

      const updatedQ = applyBulkTranslations(questionnaire, updates, targetLang);
      const supportedLanguages = updatedQ.supportedLanguages.includes(targetLang)
        ? updatedQ.supportedLanguages
        : [...updatedQ.supportedLanguages, targetLang];
      onChange({ ...updatedQ, supportedLanguages });

      // Record source hashes for translated rows so we can detect future staleness.
      setSourceHashes((prev) => {
        const next = new Map(prev);
        missing.forEach((r) => {
          const sourceText = r.texts[defaultLang] ?? '';
          next.set(`${r.key}:${targetLang}`, hashSource(sourceText));
        });
        return next;
      });
    } catch (err: any) {
      setTranslateError(err.message);
    } finally {
      setTranslating(null);
    }
  }

  async function handleTranslateStale() {
    // Collect all stale combos grouped by target language.
    const byLang = new Map<LanguageType, StaleCombo[]>();

    for (const row of rows) {
      for (const lang of activeLangs) {
        if (lang === defaultLang) continue;
        const sourceText = row.texts[defaultLang] ?? '';
        if (!sourceText) continue;
        const storedHash = sourceHashes.get(`${row.key}:${lang}`);
        const hasTranslation = !!row.texts[lang];
        const isStale =
          storedHash
            ? storedHash !== hashSource(sourceText)
            : hasTranslation; // no hash + has translation → treat as stale
        if (!isStale) continue;
        if (!byLang.has(lang)) byLang.set(lang, []);
        byLang.get(lang)!.push({ row, lang, sourceText });
      }
    }

    if (byLang.size === 0) return;

    const totalCount = [...byLang.values()].reduce((s, arr) => s + arr.length, 0);
    setTranslatingStale(true);
    setTranslateError(null);
    setStaleTranslateStatus(`Oversetter ${totalCount} utdaterte...`);

    try {
      let translatedTotal = 0;
      // We need to apply updates language by language, carrying the latest questionnaire
      // state forward so each language's applyBulkTranslations sees previous changes.
      let currentQ = questionnaire;

      for (const [lang, combos] of byLang) {
        const sourceTexts = combos.map((c) => c.sourceText);
        const translated = await autoTranslate(sourceTexts, defaultLang, lang);

        const updates = new Map<string, string>();
        combos.forEach((c, i) => {
          if (translated[i]) updates.set(c.row.key, translated[i]);
        });

        currentQ = applyBulkTranslations(currentQ, updates, lang);
        if (!currentQ.supportedLanguages.includes(lang)) {
          currentQ = { ...currentQ, supportedLanguages: [...currentQ.supportedLanguages, lang] };
        }

        // Update hashes for successfully translated combos.
        setSourceHashes((prev) => {
          const next = new Map(prev);
          combos.forEach((c, i) => {
            if (translated[i]) {
              next.set(`${c.row.key}:${lang}`, hashSource(c.sourceText));
            }
          });
          return next;
        });

        translatedTotal += combos.filter((_, i) => !!translated[i]).length;
      }

      onChange(currentQ);
      setStaleTranslateStatus(`Ferdig — ${translatedTotal} tekster oversatt`);
    } catch (err: any) {
      setTranslateError(err.message);
      setStaleTranslateStatus(null);
    } finally {
      setTranslatingStale(false);
    }
  }

  function addLanguage(lang: LanguageType) {
    if (activeLangs.includes(lang)) return;
    const newLangs = [...activeLangs, lang];
    setActiveLangs(newLangs);
    onChange({ ...questionnaire, supportedLanguages: newLangs });
  }

  function removeLanguage(lang: LanguageType) {
    const newLangs = activeLangs.filter((l) => l !== lang);
    setActiveLangs(newLangs);
    onChange({ ...questionnaire, supportedLanguages: newLangs.filter((l) => l !== defaultLang) });
  }

  const availableToAdd = ALL_LANGUAGES.filter((l) => !activeLangs.includes(l.code));

  const missingCount = rows.reduce(
    (acc, row) =>
      acc +
      activeLangs.filter((l) => l !== defaultLang && !row.texts[l]).length,
    0,
  );

  return (
    <div className="flex flex-col h-full overflow-hidden min-w-0 min-h-0">
      {/* Header */}
      <div className="bg-white border-b border-cw-border px-4 py-3 shrink-0 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-cw-blue">{t('tabTranslations', uiLang)}</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {rows.length} {t('stringsLabel', uiLang)} · {missingCount > 0 ? (
              <span className="text-amber-600">{missingCount} {t('missingLabel', uiLang)}</span>
            ) : (
              <span className="text-green-600">{t('allTranslated', uiLang)}</span>
            )}
          </p>
          {translateError && (
            <p className="text-xs text-red-500 mt-1">{translateError}</p>
          )}
          {staleTranslateStatus && !translateError && (
            <p className="text-xs text-green-600 mt-1">{staleTranslateStatus}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Oversett utdaterte button */}
          <button
            onClick={handleTranslateStale}
            disabled={staleCount === 0 || translatingStale || translating !== null}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title={staleCount === 0 ? 'Ingen utdaterte oversettelser' : `Oversett ${staleCount} utdaterte tekster på nytt`}
          >
            {translatingStale ? (
              <span className="animate-spin inline-block w-3 h-3 border border-white border-t-transparent rounded-full" />
            ) : (
              <Wand2 className="w-3 h-3" />
            )}
            {translatingStale
              ? 'Oversetter...'
              : `Oversett utdaterte${staleCount > 0 ? ` (${staleCount})` : ''}`}
          </button>
          {availableToAdd.length > 0 && (
            <select
              className="text-xs border border-cw-border rounded px-2 py-1.5 focus:outline-none"
              defaultValue=""
              onChange={(e) => { if (e.target.value) addLanguage(e.target.value as LanguageType); e.target.value = ''; }}
            >
              <option value="" disabled>{t('addLanguage', uiLang)}</option>
              {availableToAdd.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto min-w-0">
        <table className="w-full text-sm border-collapse" style={{ minWidth: 280 + activeLangs.length * 220 }}>
          <thead className="sticky top-0 bg-cw-gray z-10">
            <tr>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 border-b border-r border-cw-border w-40">
                {t('contextCol', uiLang)}
              </th>
              {activeLangs.map((lang) => {
                const langLabel = ALL_LANGUAGES.find((l) => l.code === lang)?.label ?? lang;
                const missingForLang = lang !== defaultLang
                  ? rows.filter((r) => !r.texts[lang]).length
                  : 0;
                return (
                  <th
                    key={lang}
                    id={`translation-col-${lang}`}
                    className="text-left px-3 py-2 text-xs font-medium text-gray-500 border-b border-r border-cw-border"
                  >
                    <div className="flex items-center gap-2">
                      <span>
                        {langLabel}
                        {lang === defaultLang && (
                          <span className="ml-1 text-cw-blue">{t('defaultLangBadge', uiLang)}</span>
                        )}
                      </span>
                      {lang !== defaultLang && missingForLang > 0 && (
                        <button
                          onClick={() => handleAutoTranslate(lang)}
                          disabled={translating !== null || translatingStale}
                          className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-cw-blue text-white rounded hover:bg-cw-blue-light disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          title={`${uiLang === 'NO' ? 'Auto-oversett' : 'Auto-translate'} ${missingForLang} ${uiLang === 'NO' ? 'manglende strenger' : 'missing strings'}`}
                        >
                          {translating === lang ? (
                            <span className="animate-spin inline-block w-2.5 h-2.5 border border-white border-t-transparent rounded-full" />
                          ) : (
                            <Wand2 className="w-2.5 h-2.5" />
                          )}
                          {translating === lang ? t('translatingLabel', uiLang) : `AI (${missingForLang})`}
                        </button>
                      )}
                      {lang !== defaultLang && (
                        <button
                          onClick={() => removeLanguage(lang)}
                          className="ml-auto text-gray-300 hover:text-red-500 transition-colors"
                          title={uiLang === 'NO' ? `Fjern ${langLabel}` : `Remove ${langLabel}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="hover:bg-blue-50/30">
                <td className="px-3 py-1.5 text-xs text-gray-500 border-b border-r border-cw-border whitespace-nowrap">
                  {row.context}
                </td>
                {activeLangs.map((lang) => {
                  const hashKey = `${row.key}:${lang}`;
                  const storedHash = sourceHashes.get(hashKey);
                  const currentSourceText = row.texts[defaultLang] ?? '';
                  const isStale =
                    lang !== defaultLang &&
                    !!storedHash &&
                    !!row.texts[lang] &&
                    storedHash !== hashSource(currentSourceText);
                  return (
                    <Cell
                      key={lang}
                      value={row.texts[lang] ?? ''}
                      onChange={(val) => row.update(lang, val)}
                      isMissing={lang !== defaultLang && !row.texts[lang]}
                      isStale={isStale}
                      onEdit={() => {
                        if (sourceHashes.has(hashKey)) {
                          setSourceHashes((prev) => {
                            const next = new Map(prev);
                            next.delete(hashKey);
                            return next;
                          });
                        }
                      }}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
