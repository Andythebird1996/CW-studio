import * as Dialog from '@radix-ui/react-dialog';
import { useState, useRef } from 'react';
import { t, tf, useUILang, type UILang } from '../../i18n';
import type { Questionnaire, Section, Question, LanguageType, TextOption } from '../../types/questionnaire';

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

function getQuestionOptions(q: Question, questionnaire: Questionnaire): TextOption[] {
  if (
    q.type === 'radiobutton' ||
    q.type === 'checkbox' ||
    q.type === 'combobox' ||
    q.type === 'rank'
  ) {
    if (q.options && q.options.length > 0) return q.options;
    if (q.type !== 'rank' && q.responseTemplateCode) {
      const tpl = questionnaire.responseTemplates?.templates.find(
        (t) => t.code === q.responseTemplateCode,
      );
      return tpl?.options ?? [];
    }
  }
  return [];
}

function annotationLang(lang: LanguageType): UILang {
  if (lang === 'NO') return 'NO';
  return 'EN';
}

function renderQuestionType(q: Question, lang: LanguageType): string {
  const ui = annotationLang(lang);
  switch (q.type) {
    case 'numericInput': {
      const parts: string[] = [];
      if (q.min !== undefined) parts.push(`min: ${q.min}`);
      if (q.max !== undefined) parts.push(`max: ${q.max}`);
      if (q.unit) parts.push(q.unit);
      return parts.length > 0 ? `[${parts.join(', ')}]` : t('printNumeric', ui);
    }
    case 'stringInput':
      return q.multiline ? t('printTextArea', ui) : t('printTextField', ui);
    case 'dateInput':
      return t('printDate', ui);
    case 'slider':
      return tf('printSlider', ui, { min: q.min, max: q.max });
    case 'image':
      return t('printImage', ui);
    case 'country':
      return t('printCountry', ui);
    default:
      return '';
  }
}

function buildSectionHtml(
  section: Section,
  lang: LanguageType,
  expertMode: boolean,
  questionnaire: Questionnaire,
  questionCounter: { n: number },
  depth: number,
): string {
  const title = section.titles[lang] || section.titles[questionnaire.defaultLanguage] || '';
  const headingTag = depth === 0 ? 'h2' : 'h3';
  const headingStyle =
    depth === 0
      ? 'font-size:16px;font-weight:bold;margin:24px 0 8px;border-bottom:1px solid #ccc;padding-bottom:4px;'
      : 'font-size:14px;font-weight:bold;margin:16px 0 6px;';

  let html = '';
  if (title) {
    html += `<${headingTag} style="${headingStyle}">${escHtml(title)}</${headingTag}>\n`;
  }

  for (const q of section.questions) {
    if (q.type === 'text') {
      const text = q.texts[lang] || q.texts[questionnaire.defaultLanguage] || '';
      if (text) {
        html += `<p style="margin:6px 0;font-style:italic;color:#555;">${escHtml(text)}</p>\n`;
      }
      continue;
    }

    if (q.type === 'image') {
      continue;
    }

    questionCounter.n += 1;
    const num = questionCounter.n;
    const qText = q.texts[lang] || q.texts[questionnaire.defaultLanguage] || '';
    const codePrefix = expertMode && q.code ? `<span style="color:#666;font-family:monospace;font-size:12px;">[${escHtml(q.code)}]</span> ` : '';
    const typeHint = renderQuestionType(q, lang);
    const typeSpan = typeHint
      ? ` <span style="color:#888;font-size:11px;">${escHtml(typeHint)}</span>`
      : '';

    html += `<div style="margin:8px 0 4px;">\n`;
    html += `  <span style="font-weight:600;">${num}.</span> ${codePrefix}${escHtml(qText)}${typeSpan}\n`;

    const options = getQuestionOptions(q, questionnaire);
    if (options.length > 0) {
      html += `  <ul style="margin:4px 0 0 24px;list-style:none;padding:0;">\n`;
      for (const opt of options) {
        const optText = opt.texts[lang] || opt.texts[questionnaire.defaultLanguage] || opt.code;
        const scoreStr =
          opt.score !== undefined
            ? ` <span style="color:#888;font-size:11px;">(${opt.score})</span>`
            : '';
        html += `    <li style="margin:2px 0;">&#9675; ${escHtml(optText)}${scoreStr}</li>\n`;
      }
      html += `  </ul>\n`;
    }

    html += `</div>\n`;
  }

  if (section.subSections && section.subSections.length > 0) {
    for (const sub of section.subSections) {
      html += buildSectionHtml(sub, lang, expertMode, questionnaire, questionCounter, depth + 1);
    }
  }

  return html;
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildPrintHtml(
  questionnaire: Questionnaire,
  lang: LanguageType,
  expertMode: boolean,
): string {
  const title = questionnaire.name[lang] || questionnaire.name[questionnaire.defaultLanguage] || questionnaire.code;
  const codeStr = questionnaire.code ? ` (${questionnaire.code})` : '';

  let body = '';
  body += `<h1 style="font-size:20px;font-weight:bold;margin:0 0 4px;">${escHtml(title)}</h1>\n`;
  body += `<p style="color:#666;font-size:12px;margin:0 0 16px;">${escHtml(questionnaire.code)}${questionnaire.version ? ` v${escHtml(questionnaire.version)}` : ''}</p>\n`;

  const counter = { n: 0 };
  for (const section of questionnaire.sections) {
    body += buildSectionHtml(section, lang, expertMode, questionnaire, counter, 0);
  }

  return `<!DOCTYPE html>
<html lang="${lang.toLowerCase()}">
<head>
  <meta charset="UTF-8" />
  <title>${escHtml(title)}${escHtml(codeStr)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: Arial, sans-serif;
      font-size: 13px;
      color: #222;
      margin: 20mm 20mm 20mm 20mm;
      line-height: 1.5;
    }
    @media print {
      body { margin: 0; }
      @page { margin: 20mm; }
    }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

export function PrintDialog({ open, onClose, questionnaire }: Props) {
  const lang = useUILang();
  const [printLang, setPrintLang] = useState<LanguageType>(questionnaire.defaultLanguage);
  const [expertMode, setExpertMode] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  function handlePrint() {
    const html = buildPrintHtml(questionnaire, printLang, expertMode);
    const iframe = iframeRef.current;
    if (!iframe) return;

    const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (!doc) return;

    doc.open();
    doc.write(html);
    doc.close();

    // Small delay to let the iframe render before printing
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    }, 150);
  }

  const inputCls =
    'w-full border border-cw-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cw-blue-light';

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl z-50 flex flex-col p-6"
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

          {/* Hidden iframe used as print target */}
          <iframe
            ref={iframeRef}
            title="print-frame"
            style={{ position: 'fixed', top: -9999, left: -9999, width: 1, height: 1, border: 'none' }}
            aria-hidden="true"
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
