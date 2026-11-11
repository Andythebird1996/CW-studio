import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X, BookOpen, HelpCircle, FileText, Calculator, Flag, Layers } from 'lucide-react';
import type {
  Questionnaire,
  Section,
  Question,
  LanguageType,
} from '../../types/questionnaire';
import { useUILang } from '../../i18n';

// ─── Props ────────────────────────────────────────────────────────────────────

interface SearchPanelProps {
  questionnaire: Questionnaire;
  onNavigate: (path: string) => void;
  onClose: () => void;
}

// ─── Result types ─────────────────────────────────────────────────────────────

type ResultKind = 'section' | 'question' | 'responseTemplate' | 'calculation' | 'flag';

interface SearchResult {
  kind: ResultKind;
  code: string;
  matchText: string;
  path: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function textsMatch(texts: Record<string, string> | undefined, query: string): string | null {
  if (!texts) return null;
  for (const lang of Object.keys(texts)) {
    const val = texts[lang as LanguageType];
    if (val && val.toLowerCase().includes(query)) return val;
  }
  return null;
}

function collectSectionResults(
  sections: Section[],
  query: string,
  makePath: (i: number) => string,
  out: SearchResult[],
): void {
  for (let si = 0; si < sections.length; si++) {
    if (out.length >= 50) return;
    const section = sections[si];
    const sectionPath = makePath(si);

    // Match on section code or titles
    const codeMatch = section.code && section.code.toLowerCase().includes(query);
    const titleMatch = textsMatch(section.titles, query);
    if (codeMatch || titleMatch) {
      out.push({
        kind: 'section',
        code: section.code ?? '(no code)',
        matchText: titleMatch ?? section.code ?? '',
        path: sectionPath,
      });
    }

    // Questions
    for (let qi = 0; qi < section.questions.length; qi++) {
      if (out.length >= 50) return;
      const q = section.questions[qi];
      const qPath = `${sectionPath}.questions[${qi}]`;
      const qCodeMatch = q.code && q.code.toLowerCase().includes(query);
      const qTextMatch = textsMatch(q.texts, query);
      if (qCodeMatch || qTextMatch) {
        out.push({
          kind: 'question',
          code: q.code || '(no code)',
          matchText: qTextMatch ?? q.code ?? '',
          path: qPath,
        });
      }
    }

    // Recurse into subSections with correct path
    if (section.subSections && section.subSections.length > 0) {
      collectSectionResults(
        section.subSections,
        query,
        (i) => `${sectionPath}.subSections[${i}]`,
        out,
      );
    }
  }
}

function runSearch(questionnaire: Questionnaire, rawQuery: string): SearchResult[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return [];

  const results: SearchResult[] = [];

  // Sections + questions
  collectSectionResults(questionnaire.sections, query, (i) => `sections[${i}]`, results);

  // Response templates
  const templates = questionnaire.responseTemplates?.templates ?? [];
  for (let ti = 0; ti < templates.length && results.length < 50; ti++) {
    const tpl = templates[ti];
    const codeMatch = tpl.code.toLowerCase().includes(query);
    const nameMatch = tpl.name.toLowerCase().includes(query);
    if (codeMatch || nameMatch) {
      results.push({
        kind: 'responseTemplate',
        code: tpl.code,
        matchText: nameMatch ? tpl.name : tpl.code,
        path: `responseTemplates.templates[${ti}]`,
      });
    }
  }

  // Calculations
  const calcs = questionnaire.calculations?.calculations ?? [];
  for (let ci = 0; ci < calcs.length && results.length < 50; ci++) {
    const calc = calcs[ci];
    const codeMatch = calc.code.toLowerCase().includes(query);
    const nameMatch = calc.name.toLowerCase().includes(query);
    if (codeMatch || nameMatch) {
      results.push({
        kind: 'calculation',
        code: calc.code,
        matchText: nameMatch ? calc.name : calc.code,
        path: `calculations.calculations[${ci}]`,
      });
    }
  }

  // Flags
  const flags = questionnaire.flags ?? [];
  for (let fi = 0; fi < flags.length && results.length < 50; fi++) {
    const flag = flags[fi];
    const codeMatch = flag.code.toLowerCase().includes(query);
    const nameMatch = flag.name.toLowerCase().includes(query);
    if (codeMatch || nameMatch) {
      results.push({
        kind: 'flag',
        code: flag.code,
        matchText: nameMatch ? flag.name : flag.code,
        path: `flags[${fi}]`,
      });
    }
  }

  return results;
}

// ─── Icon per kind ────────────────────────────────────────────────────────────

function KindIcon({ kind }: { kind: ResultKind }) {
  const cls = 'w-4 h-4 shrink-0';
  switch (kind) {
    case 'section':          return <Layers     className={`${cls} text-cw-blue`} />;
    case 'question':         return <HelpCircle className={`${cls} text-cw-link`} />;
    case 'responseTemplate': return <BookOpen   className={`${cls} text-cw-orange`} />;
    case 'calculation':      return <Calculator className={`${cls} text-cw-positive`} />;
    case 'flag':             return <Flag       className={`${cls} text-cw-negative`} />;
    default:                 return <FileText   className={cls} />;
  }
}

function kindLabel(kind: ResultKind, lang: 'NO' | 'EN'): string {
  if (lang === 'NO') {
    switch (kind) {
      case 'section':          return 'Seksjon';
      case 'question':         return 'Spørsmål';
      case 'responseTemplate': return 'Svarmal';
      case 'calculation':      return 'Beregning';
      case 'flag':             return 'Flagg';
    }
  }
  switch (kind) {
    case 'section':          return 'Section';
    case 'question':         return 'Question';
    case 'responseTemplate': return 'Response template';
    case 'calculation':      return 'Calculation';
    case 'flag':             return 'Flag';
  }
}

// ─── Highlight matched substring ──────────────────────────────────────────────

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query) return <span>{text}</span>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 text-yellow-900 rounded-[2px]">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SearchPanel({ questionnaire, onNavigate, onClose }: SearchPanelProps) {
  const uiLang = useUILang();
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const results = useMemo(() => runSearch(questionnaire, query), [questionnaire, query]);

  // Reset active index when results change
  useEffect(() => setActiveIdx(0), [results]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Keyboard handler
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (results[activeIdx]) {
          onNavigate(results[activeIdx].path);
          onClose();
        }
      }
    },
    [results, activeIdx, onNavigate, onClose],
  );

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const item = listRef.current.children[activeIdx] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  const placeholderNO = 'Søk i seksjoner, spørsmål, beregninger...';
  const placeholderEN = 'Search sections, questions, calculations...';
  const placeholder = uiLang === 'NO' ? placeholderNO : placeholderEN;

  const countLabel =
    results.length === 0
      ? uiLang === 'NO'
        ? 'Ingen treff'
        : 'No results'
      : results.length >= 50
        ? uiLang === 'NO'
          ? '50+ treff'
          : '50+ results'
        : uiLang === 'NO'
          ? `${results.length} treff`
          : `${results.length} result${results.length === 1 ? '' : 's'}`;

  return (
    // Backdrop — click closes
    <div
      className="fixed inset-0 z-50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Panel */}
      <div
        className="absolute top-14 right-4 w-[480px] bg-white border border-cw-border rounded-lg shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: 'calc(100vh - 80px)' }}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-label={uiLang === 'NO' ? 'Søkepanel' : 'Search panel'}
      >
        {/* Input row */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-cw-border">
          <svg
            className="w-4 h-4 text-cw-gray-text shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <circle cx="11" cy="11" r="8" strokeWidth="2" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="flex-1 text-sm bg-transparent outline-none text-gray-800 placeholder-cw-gray-text"
          />
          {query && (
            <span className="text-xs text-cw-gray-text whitespace-nowrap">{countLabel}</span>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-cw-gray text-cw-gray-text hover:text-gray-700 transition-colors"
            aria-label={uiLang === 'NO' ? 'Lukk søk' : 'Close search'}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results list */}
        {query.trim() && (
          <ul
            ref={listRef}
            className="overflow-y-auto flex-1 py-1"
            role="listbox"
          >
            {results.length === 0 ? (
              <li className="px-4 py-3 text-sm text-cw-gray-text text-center">
                {uiLang === 'NO' ? 'Ingen treff funnet.' : 'No results found.'}
              </li>
            ) : (
              results.map((result, idx) => (
                <li
                  key={`${result.kind}-${result.path}`}
                  role="option"
                  aria-selected={idx === activeIdx}
                  className={`
                    flex items-start gap-3 px-4 py-2 cursor-pointer select-none transition-colors
                    ${idx === activeIdx ? 'bg-cw-gray' : 'hover:bg-cw-gray'}
                  `}
                  onMouseEnter={() => setActiveIdx(idx)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onNavigate(result.path);
                    onClose();
                  }}
                >
                  <span className="mt-0.5">
                    <KindIcon kind={result.kind} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-cw-gray-text uppercase tracking-wide">
                        {kindLabel(result.kind, uiLang)}
                      </span>
                      <span className="text-xs font-mono text-cw-blue truncate">
                        {result.code}
                      </span>
                    </div>
                    <div className="text-sm text-gray-700 truncate mt-0.5">
                      <HighlightedText text={result.matchText} query={query.trim()} />
                    </div>
                    <div className="text-xs text-cw-gray-text font-mono truncate mt-0.5 opacity-60">
                      {result.path}
                    </div>
                  </div>
                </li>
              ))
            )}
          </ul>
        )}

        {/* Keyboard hint footer */}
        {results.length > 0 && (
          <div className="px-4 py-2 border-t border-cw-border bg-cw-gray flex gap-4 text-xs text-cw-gray-text">
            <span><kbd className="font-mono">↑↓</kbd> {uiLang === 'NO' ? 'naviger' : 'navigate'}</span>
            <span><kbd className="font-mono">Enter</kbd> {uiLang === 'NO' ? 'velg' : 'select'}</span>
            <span><kbd className="font-mono">Esc</kbd> {uiLang === 'NO' ? 'lukk' : 'close'}</span>
          </div>
        )}
      </div>
    </div>
  );
}
