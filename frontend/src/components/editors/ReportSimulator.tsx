import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { Download } from 'lucide-react';
import { interpretRap, type SimAnswer, type SimContext, type SimPatient } from '../../services/rap-interpreter';
import type { Questionnaire, LanguageType } from '../../types/questionnaire';
import { AssessmentPreview, type AnswerMap } from '../preview/AssessmentPreview';
import {t,  useUILang } from '../../i18n';

const LANG_LABELS: Record<string, string> = {
  NO: 'Norsk', EN: 'English', SV: 'Svenska', DA: 'Dansk',
  FI: 'Suomi', DE: 'Deutsch', FR: 'Français', PL: 'Polski',
};

interface Props {
  questionnaire: Questionnaire;
  rapContent: string;
  reportFileName?: string;
}

/** Convert AssessmentPreview AnswerMap → SimAnswer map for the RAP interpreter. */
function convertAnswers(
  previewAnswers: AnswerMap,
  questionnaire: Questionnaire,
  lang: LanguageType,
): Map<string, SimAnswer> {
  const result = new Map<string, SimAnswer>();

  // Build option lookup: optionCode → { score, text }
  const optionMap = new Map<string, { score: number; text: string }>();
  function collectOptions(opts: any[]) {
    for (const o of opts) {
      optionMap.set(o.code, {
        score: o.score ?? 0,
        text: o.texts?.[lang] ?? o.texts?.['NO'] ?? o.code,
      });
    }
  }
  function walkSections(secs: typeof questionnaire.sections) {
    for (const s of secs) {
      for (const q of s.questions) {
        collectOptions((q as any).options ?? []);
      }
      if (s.subSections) walkSections(s.subSections);
    }
  }
  walkSections(questionnaire.sections);
  for (const tpl of questionnaire.responseTemplates?.templates ?? []) {
    collectOptions(tpl.options);
  }

  for (const [code, val] of previewAnswers) {
    if (!code) continue;
    if (Array.isArray(val)) {
      // Checkbox: sum scores of all selected options
      const scores = val.map((c) => optionMap.get(c)?.score ?? 0);
      const texts = val.map((c) => optionMap.get(c)?.text ?? c);
      result.set(code, { score: scores.reduce((a, b) => a + b, 0), text: texts.join(', ') });
    } else if (val !== '') {
      const opt = optionMap.get(val);
      if (opt) {
        result.set(code, opt);
      } else {
        const num = parseFloat(val);
        result.set(code, { score: isNaN(num) ? 0 : num, text: val });
      }
    }
  }
  return result;
}

// ─── Main simulator ────────────────────────────────────────────────────────

export function ReportSimulator({ questionnaire, rapContent, reportFileName }: Props) {
  const uiLang = useUILang();
  const [lang, setLang] = useState<LanguageType>(questionnaire.defaultLanguage);
  const availableLangs = questionnaire.supportedLanguages.length > 0
    ? questionnaire.supportedLanguages
    : [questionnaire.defaultLanguage];

  const [simAnswers, setSimAnswers] = useState<Map<string, SimAnswer>>(new Map());
  const [patient, setPatient] = useState<SimPatient>({
    name: 'Test Testesen',
    firstName: 'Test',
    lastName: 'Testesen',
    dob: '01.01.1980',
    gender: 0,
  });
  const [reportName, setReportName] = useState('');

  // Drag-to-resize state
  const [leftWidth, setLeftWidth] = useState(380);
  const dragging = useRef(false);
  const dragStart = useRef(0);
  const widthStart = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    dragStart.current = e.clientX;
    widthStart.current = leftWidth;
    e.preventDefault();
  }, [leftWidth]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return;
    const delta = e.clientX - dragStart.current;
    setLeftWidth(Math.max(260, Math.min(600, widthStart.current + delta)));
  }, []);

  const onMouseUp = useCallback(() => { dragging.current = false; }, []);

  const handleAnswerChange = useCallback((previewMap: AnswerMap) => {
    setSimAnswers(convertAnswers(previewMap, questionnaire, lang));
  }, [questionnaire, lang]);

  const html = useMemo(() => {
    const ctx: SimContext = {
      questionnaire,
      answers: simAnswers,
      patient,
      reportName: reportName || (reportFileName ? reportFileName.replace(/\.rap$/, '') : undefined),
    };
    return interpretRap(rapContent, ctx);
  }, [questionnaire, rapContent, simAnswers, patient, reportName]);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const savedScrollY = useRef(0);

  // Update iframe content imperatively to avoid full reload (which resets scroll)
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const win = iframe.contentWindow;
    const doc = iframe.contentDocument;
    if (!win || !doc) return;

    // Save scroll BEFORE doc.open() clears the document
    const y = win.scrollY ?? 0;
    savedScrollY.current = y;

    doc.open();
    doc.write(html);
    doc.close();

    // Re-attach scroll listener on the new document
    win.addEventListener('scroll', () => {
      savedScrollY.current = win.scrollY;
    }, { passive: true });

    // Restore scroll after layout settles (double-rAF)
    if (y > 0) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          win.scrollTo(0, y);
        });
      });
    }
  }, [html]);

  return (
    <div
      className="flex flex-col xl:flex-row h-full overflow-hidden min-w-0 min-h-0"
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      {/* ── Left panel: patient info + assessment preview. Stacks below xl. ── */}
      <div
        className="cw-preview-pane shrink-0 border-cw-border xl:border-r bg-white flex flex-col overflow-hidden min-w-0 min-h-0"
        style={{ width: leftWidth }}
      >
        {/* Patient info header */}
        <div className="bg-cw-gray border-b border-cw-border px-3 py-2 shrink-0 flex items-center justify-between">
          <p className="text-xs font-semibold text-cw-blue">{t('simulateAnswers', uiLang)}</p>
          {availableLangs.length > 1 && (
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as LanguageType)}
              className="text-xs border border-cw-border rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
              title={t('selectAssessmentLang', uiLang)}
            >
              {availableLangs.map((l) => (
                <option key={l} value={l}>{LANG_LABELS[l] ?? l}</option>
              ))}
            </select>
          )}
        </div>

        {/* Compact patient fields */}
        <div className="px-3 py-2 border-b border-cw-border shrink-0 space-y-2">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[10px] text-gray-500 block mb-0.5">{t('name', uiLang)}</label>
              <input
                type="text"
                value={patient.name}
                onChange={(e) => setPatient((p) => ({ ...p, name: e.target.value }))}
                className="w-full text-xs border border-cw-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
              />
            </div>
            <div className="w-28">
              <label className="text-[10px] text-gray-500 block mb-0.5">{t('dob', uiLang)}</label>
              <input
                type="text"
                value={patient.dob}
                onChange={(e) => setPatient((p) => ({ ...p, dob: e.target.value }))}
                placeholder="DD.MM.YYYY"
                className="w-full text-xs border border-cw-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-gray-500">{t('genderColon', uiLang)}</span>
            {([0, 1, 2] as const).map((g) => (
              <label key={g} className="flex items-center gap-1 text-xs cursor-pointer">
                <input
                  type="radio"
                  name="sim-gender"
                  checked={patient.gender === g}
                  onChange={() => setPatient((p) => ({ ...p, gender: g }))}
                  className="accent-cw-blue"
                />
                {g === 0 ? (t('female', uiLang)) : g === 1 ? (t('male', uiLang)) : (t('unknownGender', uiLang))}
              </label>
            ))}
          </div>
        </div>

        {/* Assessment preview for answering */}
        <div className="flex-1 overflow-hidden">
          <AssessmentPreview
            questionnaire={questionnaire}
            lang={lang}
            onAnswerChange={handleAnswerChange}
          />
        </div>
      </div>

      {/* ── Drag handle ── */}
      <div
        className="hidden xl:block w-1.5 shrink-0 cursor-col-resize bg-cw-border hover:bg-cw-blue transition-colors"
        onMouseDown={onMouseDown}
        title={t('dragResize', uiLang)}
      />

      {/* ── Right panel: rendered report ── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-100 min-w-0 min-h-0">
        <div className="bg-white border-b border-cw-border px-3 py-2 shrink-0 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-cw-blue">{t('livePreview', uiLang)}</span>
            <span className="text-[10px] text-gray-400">{t('livePreviewHint', uiLang)}</span>
          </div>
          <button
            onClick={() => {
              const win = window.open('', '_blank');
              if (!win) return;
              win.document.write(html);
              win.document.close();
              win.focus();
              setTimeout(() => { win.print(); }, 400);
            }}
            className="flex items-center gap-1.5 px-3 py-1 text-xs border border-cw-border rounded hover:bg-gray-50 text-gray-600"
          >
            <Download className="w-3 h-3" /> {t('downloadPdf', uiLang)}
          </button>
        </div>
        <div className="flex-1 overflow-hidden p-4">
          <iframe
            ref={iframeRef}
            sandbox="allow-scripts allow-same-origin"
            className="w-full h-full bg-white rounded shadow-sm border border-cw-border"
            title={t('reportPreview', uiLang)}
          />
        </div>
      </div>
    </div>
  );
}
