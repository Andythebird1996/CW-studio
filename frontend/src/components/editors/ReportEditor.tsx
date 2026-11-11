import { useState, useRef, useCallback, useEffect } from 'react';
import { Play, Wand2, CodeSquare } from 'lucide-react';
import { ReportSimulator, ReportStyleSwitch, type ReportSheetStyle } from './ReportSimulator';
import type { Questionnaire } from '../../types/questionnaire';
import { t, type UILang, useUILang } from '../../i18n';

// ── RAP syntax highlighter ────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function highlightRap(code: string): string {
  // Process line by line to avoid runaway regexes
  return code
    .split('\n')
    .map((line) => {
      // Block comments /* ... */  (single-line form only in RAP)
      if (/^\s*\/\*/.test(line)) {
        return `<span style="color:var(--color-cw-positive)">${escapeHtml(line)}</span>`;
      }

      let out = escapeHtml(line);

      // [KEYWORD...] constructs — control flow
      out = out.replace(
        /(\[(?:CALL|DIE|function|function_end|group|group_end|if|else|endif|return|loop|loop_end|while|while_end)\b[^\]]*\])/g,
        '<span style="color:var(--color-cw-blue);font-weight:600">$1</span>',
      );

      // $VARIABLE
      out = out.replace(
        /(\$[A-Z_][A-Z0-9_]*)/g,
        '<span style="color:var(--color-cw-blue-light)">$1</span>',
      );

      // Built-in functions A( L( Q( EXIST( NOT( etc.
      out = out.replace(
        /\b(A|L|Q|EXIST|NOT|AND|OR|CALC|NORM|FLAG|PERCENTILE|ZSCORE)\(/g,
        '<span style="color:var(--color-cw-orange)">$1</span>(',
      );

      // String literals in "..."
      out = out.replace(
        /(&quot;[^&]*?&quot;)/g,
        '<span style="color:var(--color-cw-negative)">$1</span>',
      );

      // HTML tags inside the template
      out = out.replace(
        /(&lt;\/?[a-zA-Z][^&gt;]*&gt;)/g,
        '<span style="color:var(--color-cw-negative)">$1</span>',
      );

      // Inline comments /* ... */ on a line
      out = out.replace(
        /(\/\*.*?\*\/)/g,
        '<span style="color:var(--color-cw-positive)">$1</span>',
      );

      return out;
    })
    .join('\n');
}

const LANG_TO_BCP47: Record<string, string> = {
  NO: 'nb', EN: 'en', SV: 'sv', DA: 'da', FI: 'fi', DE: 'de', FR: 'fr', PL: 'pl',
};

function rapHeaders(questionnaire: Questionnaire): string {
  const name = questionnaire.name[questionnaire.defaultLanguage] || questionnaire.code;
  const version = `${questionnaire.version}.${questionnaire.release ?? '0'}`;
  const language = LANG_TO_BCP47[questionnaire.defaultLanguage] ?? questionnaire.defaultLanguage.toLowerCase();
  return `/* $code ${questionnaire.code} */
/* $name ${name} */
/* $version ${version} */
/* $language ${language} */
/* $questionnaire ${questionnaire.code} */
/* $clinicianOnly false */`;
}

function generateStarterTemplate(questionnaire: Questionnaire): string {
  const lang = questionnaire.defaultLanguage;
  const ui: UILang = lang === 'EN' ? 'EN' : 'NO';

  function flattenSects(secs: typeof questionnaire.sections): typeof questionnaire.sections {
    return secs.flatMap((s) => [s, ...flattenSects(s.subSections ?? [])]);
  }

  let sections = '';
  for (const section of flattenSects(questionnaire.sections)) {
    const questions = section.questions.filter((q) => q.type !== 'text');
    if (questions.length === 0) continue;
    const sectionTitle =
      section.titles[lang as keyof typeof section.titles] ??
      section.titles['NO' as keyof typeof section.titles] ??
      section.code ??
      '';

    sections += `\n<div class="reportwidget">\n`;
    if (sectionTitle) {
      sections += `<h2>${sectionTitle}</h2>\n`;
    }
    sections += `<table class="reportlist">\n<thead><tr><th>${t('question', ui)}</th><th>${t('answer', ui)}</th><th class="score">${t('value', ui)}</th></tr></thead>\n<tbody>\n`;
    for (const q of questions) {
      sections += `[if(EXIST(${q.code})){"<tr><td class=\\"label\\">Q(${q.code})</td><td>L(${q.code})</td><td class=\\"score\\">A(${q.code})</td></tr>"}]\n`;
      sections += `[if(!EXIST(${q.code})){"<tr><td class=\\"label\\">Q(${q.code})</td><td class=\\"missing\\"><i>${t('rapUnanswered', ui)}</i></td><td class=\\"score missing\\">-</td></tr>"}]\n`;
    }
    sections += `</tbody>\n</table>\n</div>\n`;
  }

  return `${rapHeaders(questionnaire)}

[CALL main()]
[DIE]

[function main()]
[group("${t('reportGroup', ui)}", true)]

<table class="canvas">
<tr>
<td class="maincolumn">

<h1 class="reporttitle checkware-maincolor">$SURVEY_NAME</h1>
${sections}
<div class="footnote">
<hr class="footnote">
<p class="copyright">$COPYRIGHT</p>
</div>

</td>
<td class="spacecolumn"></td>
<td class="sidebar">

<h2>${t('rapPatientInfo', ui)}</h2>
<table class="reportsimple">
<tr><td class="label">${t('name', ui)}</td><td><strong>$PATIENT_NAME</strong></td></tr>
<tr><td class="label">${t('genderLabel', ui)}</td><td>$KJONN_SUBST</td></tr>
<tr><td class="label">${t('dob', ui)}</td><td>$FODT</td></tr>
</table>

<h2>${t('rapAssessmentInfo', ui)}</h2>
<table class="reportsimple">
<tr><td class="label">${t('rapSubmitted', ui)}</td><td>$CURRENT_DATE</td></tr>
<tr><td class="label">${t('rapGenerated', ui)}</td><td>$CURRENT_DATE $CURRENT_TIME</td></tr>
</table>

</td>
</tr>
</table>

[group_end]
[function_end]
`;
}

// ── RAP snippet library ───────────────────────────────────────────────────────

interface RapSnippet {
  label: string;
  code: string;
}

interface RapSnippetGroup {
  group: string;
  snippets: RapSnippet[];
}

function rapSnippets(lang: UILang): RapSnippetGroup[] {
  const word = t('rapFnName', lang);
  const sample = t('snippetSample', lang);
  return [
    {
      group: t('snippetConditions', lang),
      snippets: [
        { label: t('snippetIfAnswered', lang), code: `[if(EXIST(KOD)){"${sample}"}]` },
        { label: t('snippetIfScore', lang), code: `[if(A(KOD)=1){"${sample}"}]` },
        { label: t('snippetIfFlag', lang), code: `[if(FLAG(KOD)){"${sample}"}]` },
        {
          label: t('snippetIfElse', lang),
          code: t('snippetIfElseCode', lang),
        },
      ],
    },
    {
      group: t('snippetDisplay', lang),
      snippets: [
        { label: t('snippetShowAnswer', lang), code: 'L(KOD)' },
        { label: t('snippetShowScore', lang), code: 'A(KOD)' },
        { label: t('snippetShowCalc', lang), code: 'CALC(KOD)' },
        { label: t('snippetShowName', lang), code: '$PATIENT_NAME' },
      ],
    },
    {
      group: t('snippetFunctions', lang),
      snippets: [
        {
          label: t('snippetFnDef', lang),
          code: `[function ${word}()]\n/* ${t('snippetContent', lang)} */\n[function_end]`,
        },
        { label: t('snippetFnCall', lang), code: `[CALL ${word}()]` },
      ],
    },
    {
      group: t('snippetSession', lang),
      snippets: [
        { label: t('snippetPrevSession', lang), code: '[SESSION_VALUE(1, KOD)]' },
        { label: t('snippetDiff', lang), code: '[SESSION_DIFF(1, 2, KOD)]' },
      ],
    },
  ];
}

interface SnippetDropdownProps {
  onInsert: (snippet: string) => void;
}

function SnippetDropdown({ onInsert }: SnippetDropdownProps) {
  const uiLang = useUILang();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-cw-border rounded hover:bg-cw-gray text-cw-gray-text"
        title={t('insertSnippet', uiLang)}
      >
        <CodeSquare className="w-3.5 h-3.5" /> {t('snippet', uiLang)}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-64 bg-white border border-cw-border rounded-lg shadow-lg overflow-hidden">
          {rapSnippets(uiLang).map((grp) => (
            <div key={grp.group}>
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-cw-gray-text bg-cw-gray border-b border-cw-border">
                {grp.group}
              </div>
              {grp.snippets.map((s) => (
                <button
                  key={s.label}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-cw-gray text-cw-ink border-b border-cw-border last:border-0"
                  onClick={() => {
                    onInsert(s.code);
                    setOpen(false);
                  }}
                >
                  <span className="font-medium">{s.label}</span>
                  <span className="block font-mono text-[10px] text-cw-gray-text truncate mt-0.5">{s.code.split('\n')[0]}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  code: string;
  rapFiles: Record<string, string>;
  activeFileName: string;
  questionnaire: Questionnaire;
  onChangeFile: (fileName: string, content: string) => void;
  onSelectFile: (fileName: string) => void;
  onAddFile: () => void;
  onDeleteFile: (fileName: string) => void;
}

function makePlaceholder(questionnaire: Questionnaire): string {
  const ui: UILang = questionnaire.defaultLanguage === 'EN' ? 'EN' : 'NO';
  return `${rapHeaders(questionnaire)}

[CALL main()]
[DIE]

[function main()]
[group("${t('reportGroup', ui)}", true)]

<h1>$SURVEY_NAME</h1>

/* ${t('rapPlaceholderNote', ui)} */
/* ${t('rapPlaceholderIf', ui)} */
/* ${t('rapPlaceholderCall', ui)} */

[group_end]
[function_end]
`;
}

export function ReportEditor({ code, rapFiles, activeFileName, questionnaire, onChangeFile, onSelectFile, onAddFile, onDeleteFile }: Props) {
  const uiLang = useUILang();
  const [mode, setMode] = useState<'editor' | 'simulator'>('editor');
  const [reportStyle, setReportStyle] = useState<ReportSheetStyle>('engine');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  const fileNames = Object.keys(rapFiles);
  const currentFileName = activeFileName || fileNames[0] || '';
  const content = (currentFileName ? rapFiles[currentFileName] : '') || makePlaceholder(questionnaire);

  const insertSnippet = useCallback((snippet: string) => {
    const ta = textareaRef.current;
    if (!ta || !currentFileName) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const next = content.slice(0, start) + snippet + content.slice(end);
    onChangeFile(currentFileName, next);
    // After update, select the first KOD placeholder
    requestAnimationFrame(() => {
      ta.focus();
      const kodIdx = next.indexOf('KOD', start);
      if (kodIdx >= 0) {
        ta.selectionStart = kodIdx;
        ta.selectionEnd = kodIdx + 3;
      } else {
        ta.selectionStart = ta.selectionEnd = start + snippet.length;
      }
    });
  }, [content, currentFileName, onChangeFile]);

  useEffect(() => {
    function handler(e: Event) {
      const { fileName } = (e as CustomEvent<{ fileName: string }>).detail;
      if (fileName && rapFiles[fileName] !== undefined) onSelectFile(fileName);
    }
    window.addEventListener('select-rap-file', handler);
    return () => window.removeEventListener('select-rap-file', handler);
  }, [rapFiles, onSelectFile]);

  // Sync scroll between textarea and highlight overlay
  const syncScroll = useCallback(() => {
    if (textareaRef.current && highlightRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop;
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden min-w-0 min-h-0">
      {/* Header */}
      <div className="bg-white border-b border-cw-border px-4 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-cw-blue">{t('reportTemplate', uiLang)}</h2>
          <p className="text-xs text-cw-gray-text mt-0.5">{t('rapTemplatePrefix', uiLang)} {t('reportLanguage', uiLang)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ReportStyleSwitch value={reportStyle} onChange={setReportStyle} />

          {/* Mode toggle */}
          <div className="flex rounded border border-cw-border overflow-hidden">
            <button
              onClick={() => setMode('editor')}
              className={`px-3 py-1.5 text-xs transition-colors ${
                mode === 'editor'
                  ? 'bg-cw-blue text-white'
                  : 'bg-white text-cw-gray-text hover:bg-cw-gray'
              }`}
            >
              {t('editorMode', uiLang)}
            </button>
            <button
              onClick={() => setMode('simulator')}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs transition-colors ${
                mode === 'simulator'
                  ? 'bg-cw-blue text-white'
                  : 'bg-white text-cw-gray-text hover:bg-cw-gray'
              }`}
            >
              <Play className="w-3 h-3" />
              {t('simulatorMode', uiLang)}
            </button>
          </div>

          <button
            onClick={() => {
              const template = generateStarterTemplate(questionnaire);
              if (currentFileName) {
                onChangeFile(currentFileName, template);
              } else {
                // No file exists yet — create one automatically
                const newName = `${questionnaire.code || 'rapport'}.rap`;
                onChangeFile(newName, template);
                onSelectFile(newName);
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-cw-border rounded hover:bg-cw-gray text-cw-gray-text"
            title={t('generateTemplateTitle', uiLang)}
          >
            <Wand2 className="w-3.5 h-3.5" /> {t('generateTemplate', uiLang)}
          </button>

          <SnippetDropdown onInsert={insertSnippet} />

        </div>
      </div>

      {/* ── File tabs (shown when multiple rap files exist) ── */}
      {fileNames.length > 0 && (
        <div className="flex items-center gap-1 px-3 py-1.5 bg-cw-gray border-b border-cw-border shrink-0 flex-wrap">
          {fileNames.map((fn) => (
            <div key={fn} className="flex items-center">
              <button
                onClick={() => onSelectFile(fn)}
                className={`px-2.5 py-1 text-xs rounded-l border transition-colors ${
                  fn === currentFileName
                    ? 'bg-white border-cw-blue text-cw-blue font-medium'
                    : 'bg-cw-gray border-cw-border text-cw-gray-text hover:text-cw-ink hover:bg-white'
                }`}
              >
                {fn}
              </button>
              {fileNames.length > 1 && (
                <button
                  onClick={() => onDeleteFile(fn)}
                  className="px-1.5 py-1 text-xs rounded-r border border-l-0 border-cw-border text-cw-gray-text hover:text-cw-negative hover:bg-white transition-colors"
                  title={t('deleteFile', uiLang)}
                >✕</button>
              )}
            </div>
          ))}
          <button
            onClick={onAddFile}
            className="px-2 py-1 text-xs border border-dashed border-cw-border rounded text-cw-gray-text hover:text-cw-blue hover:border-cw-blue transition-colors"
            title={t('newReportFile', uiLang)}
          >+</button>
        </div>
      )}

      {mode === 'editor' ? (
        <>
          {/* Syntax-highlighted editor: overlay div + transparent textarea */}
          <div className="flex-1 overflow-hidden p-3 bg-white border-t border-cw-border">
            <div className="relative w-full h-full">
              {/* Highlight layer (non-interactive) */}
              <div
                ref={highlightRef}
                aria-hidden="true"
                className="absolute inset-0 overflow-auto pointer-events-none"
                style={{
                  fontFamily: 'Consolas, "Courier New", monospace',
                  fontSize: 12,
                  lineHeight: '1.6',
                  padding: '12px',
                  whiteSpace: 'pre',
                  color: 'var(--color-cw-ink)',
                  background: 'transparent',
                }}
                dangerouslySetInnerHTML={{ __html: highlightRap(content) + '\n' }}
              />
              {/* Editable textarea (transparent) */}
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => onChangeFile(currentFileName, e.target.value)}
                onScroll={syncScroll}
                spellCheck={false}
                className="absolute inset-0 w-full h-full resize-none focus:outline-none"
                style={{
                  fontFamily: 'Consolas, "Courier New", monospace',
                  fontSize: 12,
                  lineHeight: '1.6',
                  padding: '12px',
                  background: 'transparent',
                  color: 'transparent',
                  caretColor: 'var(--color-cw-ink)',
                  tabSize: 2,
                  border: 'none',
                }}
                onKeyDown={(e) => {
                  // Tab inserts 2 spaces
                  if (e.key === 'Tab') {
                    e.preventDefault();
                    const ta = e.currentTarget;
                    const start = ta.selectionStart;
                    const end = ta.selectionEnd;
                    const next = content.slice(0, start) + '  ' + content.slice(end);
                    onChangeFile(currentFileName, next);
                    requestAnimationFrame(() => {
                      ta.selectionStart = ta.selectionEnd = start + 2;
                    });
                  }
                }}
              />
            </div>
          </div>
          <div className="bg-white border-t border-cw-border px-4 py-2 shrink-0 overflow-x-auto">
            <p className="text-xs text-cw-gray-text">
              {t('keywords', uiLang)}:{' '}
              <code className="bg-cw-gray px-1 rounded">$VAR</code>{' '}
              <code className="bg-cw-gray px-1 rounded">[if(A(Q1)=1){'{...}'}]</code>{' '}
              <code className="bg-cw-gray px-1 rounded">[CALL fn()]</code>{' '}
              <code className="bg-cw-gray px-1 rounded">[function {t('rapFnName', uiLang)}()]</code>{' '}
              <code className="bg-cw-gray px-1 rounded">[group(&quot;{t('name', uiLang)}&quot;, true)]</code>{' '}
              <code className="bg-cw-gray px-1 rounded">Q({t('code', uiLang).toLowerCase()})</code>{' '}
              <code className="bg-cw-gray px-1 rounded">L({t('code', uiLang).toLowerCase()})</code>
            </p>
          </div>
        </>
      ) : (
        <div className="flex-1 overflow-hidden">
          <ReportSimulator
            questionnaire={questionnaire}
            rapContent={content}
            reportFileName={currentFileName}
            reportStyle={reportStyle}
            onReportStyleChange={setReportStyle}
          />
        </div>
      )}
    </div>
  );
}
