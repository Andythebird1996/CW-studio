import { useState, useRef, useEffect } from 'react';
import {
  BarChart2,
  Calculator,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileCode,
  Flag,
  Globe,
  Image,
  Info,
  LayoutGrid,
  List,
  MoreHorizontal,
  Package,
  PlusCircle,
  Trash2,
  X,
} from 'lucide-react';
import { useWorkspaceStore, type EditorTab } from '../../stores/workspace-store';
import { t, type UILang } from '../../i18n';

// ─── Types ─────────────────────────────────────────────────────────────────

export type SubTab =
  | 'questionnaire'
  | 'response-templates'
  | 'calculation'
  | 'dimensions'
  | 'flags'
  | 'norms'
  | 'translation'
  | 'report'
  | 'media'
  | 'metadata'
  | 'debugger'
  | 'dependencies';

interface Props {
  activeSubTab: SubTab;
  lang: UILang;
  onNavigate: (tabId: string, subTab: SubTab) => void;
  onNewQuestionnaire: () => void;
  onNewCalculation: (tabId: string) => void;
  onNewFlag: (tabId: string) => void;
  onNewNorm: (tabId: string) => void;
  onNewReport: (tabId: string) => void;
  onNewTranslation: (tabId: string) => void;
}

// ─── Context menu ───────────────────────────────────────────────────────────

function ContextMenu({
  tabId,
  uiLang,
  onClose,
  onNewCalculation,
  onNewFlag,
  onNewNorm,
  onNewReport,
  onNewTranslation,
  onCloseTab,
}: {
  tabId: string;
  uiLang: UILang;
  onClose: () => void;
  onNewCalculation: (id: string) => void;
  onNewFlag: (id: string) => void;
  onNewNorm: (id: string) => void;
  onNewReport: (id: string) => void;
  onNewTranslation: (id: string) => void;
  onCloseTab: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [onClose]);

  function item(label: string, icon: React.ReactNode, action: () => void, danger = false) {
    return (
      <button
        className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-cw-gray ${danger ? 'text-cw-negative' : 'text-cw-ink'}`}
        onClick={() => { action(); onClose(); }}
      >
        <span className="w-3.5 h-3.5 shrink-0">{icon}</span>
        {label}
      </button>
    );
  }

  return (
    <div
      ref={ref}
      className="absolute right-0 top-6 z-50 bg-white border border-cw-border rounded shadow-lg py-1 min-w-[180px]"
    >
      <p className="px-3 py-1 text-[10px] font-semibold text-cw-gray-text uppercase tracking-wide">{t('newResource', uiLang)}</p>
      {item(t('addCalcBtn', uiLang), <Calculator className="w-3.5 h-3.5" />, () => onNewCalculation(tabId))}
      {item(t('newFlag', uiLang), <Flag className="w-3.5 h-3.5" />, () => onNewFlag(tabId))}
      {item(t('newNormBtn', uiLang), <BarChart2 className="w-3.5 h-3.5" />, () => onNewNorm(tabId))}
      {item(t('newTranslation', uiLang), <Globe className="w-3.5 h-3.5" />, () => onNewTranslation(tabId))}
      {item(t('newReport', uiLang), <FileCode className="w-3.5 h-3.5" />, () => onNewReport(tabId))}
      <div className="border-t border-cw-border my-1" />
      {item(t('closePackage', uiLang), <Trash2 className="w-3.5 h-3.5" />, () => onCloseTab(tabId), true)}
    </div>
  );
}

// ─── Resource row ────────────────────────────────────────────────────────────

function ResourceRow({
  icon,
  label,
  count,
  active,
  onClick,
  expandable,
  expanded,
  onToggleExpand,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  expandable?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
}) {
  return (
    <div className={`flex items-center rounded transition-colors ${active ? 'bg-cw-yellow text-cw-ink' : 'text-cw-ink hover:bg-white'}`}>
      {expandable && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleExpand?.(); }}
          className={`pl-1 pr-0.5 py-1 shrink-0 ${active ? 'text-cw-ink' : 'text-cw-gray-text hover:text-cw-gray-text'}`}
        >
          {expanded
            ? <ChevronDown className="w-3 h-3" />
            : <ChevronRight className="w-3 h-3" />
          }
        </button>
      )}
      <button
        onClick={onClick}
        className={`flex items-center gap-1.5 flex-1 min-w-0 px-2 py-2 xl:py-1 text-xs text-left ${expandable ? 'pl-0.5' : ''}`}
      >
        <span className="w-3.5 h-3.5 shrink-0">{icon}</span>
        <span className="flex-1 truncate">{label}</span>
        {count !== undefined && count > 0 && (
          <span className={`text-[10px] font-medium px-1 rounded ${active ? 'bg-white/80 text-cw-ink' : 'bg-white text-cw-gray-text'}`}>
            {count}
          </span>
        )}
      </button>
    </div>
  );
}

// ─── Package node ────────────────────────────────────────────────────────────

function PackageNode({
  tab,
  isActive,
  activeSubTab,
  uiLang,
  onNavigate,
  onNewCalculation,
  onNewFlag,
  onNewNorm,
  onNewReport,
  onNewTranslation,
  onCloseTab,
}: {
  tab: EditorTab;
  isActive: boolean;
  activeSubTab: SubTab;
  uiLang: UILang;
  onNavigate: (tabId: string, subTab: SubTab) => void;
  onNewCalculation: (id: string) => void;
  onNewFlag: (id: string) => void;
  onNewNorm: (id: string) => void;
  onNewReport: (id: string) => void;
  onNewTranslation: (id: string) => void;
  onCloseTab: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(isActive);
  const [showMenu, setShowMenu] = useState(false);
  const [templatesExpanded, setTemplatesExpanded] = useState(false);
  const [calcsExpanded, setCalcsExpanded] = useState(false);
  const [flagsExpanded, setFlagsExpanded] = useState(false);
  const [normsExpanded, setNormsExpanded] = useState(false);
  const [dimsExpanded, setDimsExpanded] = useState(false);
  const [langsExpanded, setLangsExpanded] = useState(false);
  const [rapExpanded, setRapExpanded] = useState(false);
  const [mediaExpanded, setMediaExpanded] = useState(false);

  // Auto-expand when tab becomes active
  useEffect(() => {
    if (isActive) setExpanded(true);
  }, [isActive]);

  const q = tab.data;
  const calcCount = q?.calculations?.calculations.length ?? 0;
  const flagCount = q?.flags?.length ?? 0;
  const normCount = q?.calculations?.norms.length ?? 0;
  const dimCount = q?.dimensions?.length ?? 0;
  const extraLangs = (q?.supportedLanguages.length ?? 1) - 1;
  const mediaCount = tab.mediaFiles?.length ?? 0;
  const rapFileCount = Object.keys(tab.rapFiles ?? {}).length;
  const hasReport = rapFileCount > 0;
  const responseTemplates = q?.responseTemplates?.templates ?? [];

  const lang = q?.defaultLanguage ?? 'NO';
  const title = q ? (q.name[lang] || q.code || tab.title) : tab.title;

  function nav(sub: SubTab) {
    setExpanded(true);
    onNavigate(tab.id, sub);
  }

  return (
    <div className="mb-1">
      {/* Package header */}
      <div className="flex items-center gap-1 px-1 py-1 group">
        <button
          onClick={() => setExpanded((e) => !e)}
          className="text-cw-gray-text hover:text-cw-gray-text shrink-0"
          title={expanded ? (t('collapse', uiLang)) : (t('expand', uiLang))}
        >
          {expanded
            ? <ChevronDown className="w-3.5 h-3.5" />
            : <ChevronRight className="w-3.5 h-3.5" />
          }
        </button>

        <button
          onClick={() => nav('questionnaire')}
          className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
        >
          <Package className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-cw-blue' : 'text-cw-gray-text'}`} />
          <span className={`text-xs font-medium truncate ${isActive ? 'text-cw-blue' : 'text-cw-ink'}`}>
            {title}
          </span>
          {tab.isDirty && (
            <span className="text-cw-orange text-xs shrink-0" title={t('unsaved', uiLang)}>●</span>
          )}
        </button>

        {/* Context menu trigger */}
        <div className="relative shrink-0">
          <button
            onClick={() => setShowMenu((m) => !m)}
            className="opacity-0 group-hover:opacity-100 p-0.5 text-cw-gray-text hover:text-cw-gray-text rounded"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
          {showMenu && (
            <ContextMenu
              tabId={tab.id}
              uiLang={uiLang}
              onClose={() => setShowMenu(false)}
              onNewCalculation={onNewCalculation}
              onNewFlag={onNewFlag}
              onNewNorm={onNewNorm}
              onNewReport={onNewReport}
              onNewTranslation={onNewTranslation}
              onCloseTab={onCloseTab}
            />
          )}
        </div>

        <button
          onClick={() => onCloseTab(tab.id)}
          className="opacity-0 group-hover:opacity-100 p-0.5 text-cw-gray-text hover:text-cw-negative rounded shrink-0"
          title={t('close', uiLang)}
          aria-label={t('close', uiLang)}
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Resources */}
      {expanded && (
        <div className="ml-5 pr-1 pb-1 space-y-0.5">
          <ResourceRow
            icon={<ClipboardList className="w-3.5 h-3.5" />}
            label={t('tabQuiz', uiLang)}
            active={isActive && activeSubTab === 'questionnaire'}
            onClick={() => nav('questionnaire')}
          />

          {/* Response Templates */}
          <ResourceRow
            icon={<List className="w-3.5 h-3.5" />}
            label={t('responseTpls', uiLang)}
            count={responseTemplates.length > 0 ? responseTemplates.length : undefined}
            active={isActive && activeSubTab === 'response-templates'}
            onClick={() => { nav('response-templates'); if (responseTemplates.length > 0) setTemplatesExpanded(true); }}
            expandable={responseTemplates.length > 0}
            expanded={templatesExpanded}
            onToggleExpand={() => setTemplatesExpanded((v) => !v)}
          />
          {templatesExpanded && responseTemplates.length > 0 && (
            <div className="ml-4 mt-0.5 space-y-0.5">
              {responseTemplates.map((tpl, tplIdx) => (
                <button
                  key={tpl.code || tplIdx}
                  onClick={() => {
                    nav('response-templates');
                    setTimeout(() => window.dispatchEvent(new CustomEvent('select-response-template', { detail: { index: tplIdx } })), 80);
                  }}
                  className="flex items-center gap-1.5 w-full px-2 py-0.5 text-[11px] rounded text-left text-cw-gray-text hover:bg-cw-gray hover:text-cw-ink transition-colors"
                  title={tpl.name || tpl.code}
                >
                  <List className="w-3 h-3 shrink-0 text-cw-gray-text" />
                  <span className="truncate font-mono">{tpl.code || `tpl-${tplIdx + 1}`}</span>
                  {tpl.options.length > 0 && (
                    <span className="ml-auto text-[10px] text-cw-gray-text tabular-nums">{tpl.options.length}</span>
                  )}
                </button>
              ))}
            </div>
          )}
          {/* Calculations */}
          <ResourceRow
            icon={<Calculator className="w-3.5 h-3.5" />}
            label={t('tabCalculations', uiLang)}
            count={calcCount}
            active={isActive && activeSubTab === 'calculation'}
            onClick={() => { nav('calculation'); if (calcCount > 0) setCalcsExpanded(true); }}
            expandable={calcCount > 0}
            expanded={calcsExpanded}
            onToggleExpand={() => setCalcsExpanded((v) => !v)}
          />
          {calcsExpanded && calcCount > 0 && (
            <div className="ml-4 mt-0.5 space-y-0.5">
              {(q?.calculations?.calculations ?? []).map((calc, i) => (
                <button
                  key={calc.code || i}
                  onClick={() => {
                    nav('calculation');
                    setTimeout(() => window.dispatchEvent(new CustomEvent('select-calculation', { detail: { index: i } })), 80);
                  }}
                  className="flex items-center gap-1.5 w-full px-2 py-0.5 text-[11px] rounded text-left text-cw-gray-text hover:bg-cw-gray hover:text-cw-ink transition-colors"
                  title={calc.name || calc.code}
                >
                  <Calculator className="w-3 h-3 shrink-0 text-cw-gray-text" />
                  <span className="truncate font-mono">{calc.code || `calc-${i + 1}`}</span>
                  {calc.name && calc.name !== calc.code && (
                    <span className="ml-1 truncate text-cw-gray-text italic">{calc.name}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Flags */}
          <ResourceRow
            icon={<Flag className="w-3.5 h-3.5" />}
            label={t('tabFlags', uiLang)}
            count={flagCount}
            active={isActive && activeSubTab === 'flags'}
            onClick={() => { nav('flags'); if (flagCount > 0) setFlagsExpanded(true); }}
            expandable={flagCount > 0}
            expanded={flagsExpanded}
            onToggleExpand={() => setFlagsExpanded((v) => !v)}
          />
          {flagsExpanded && flagCount > 0 && (
            <div className="ml-4 mt-0.5 space-y-0.5">
              {(q?.flags ?? []).map((flag, i) => (
                <button
                  key={flag.code || i}
                  onClick={() => {
                    nav('flags');
                    setTimeout(() => window.dispatchEvent(new CustomEvent('select-flag', { detail: { index: i } })), 80);
                  }}
                  className="flex items-center gap-1.5 w-full px-2 py-0.5 text-[11px] rounded text-left text-cw-gray-text hover:bg-cw-gray hover:text-cw-ink transition-colors"
                  title={flag.name || flag.code}
                >
                  <Flag className="w-3 h-3 shrink-0 text-cw-gray-text" />
                  <span className="truncate font-mono">{flag.code || `flag-${i + 1}`}</span>
                  {flag.name && flag.name !== flag.code && (
                    <span className="ml-1 truncate text-cw-gray-text italic">{flag.name}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Norms */}
          <ResourceRow
            icon={<BarChart2 className="w-3.5 h-3.5" />}
            label={t('tabNorms', uiLang)}
            count={normCount}
            active={isActive && activeSubTab === 'norms'}
            onClick={() => { nav('norms'); if (normCount > 0) setNormsExpanded(true); }}
            expandable={normCount > 0}
            expanded={normsExpanded}
            onToggleExpand={() => setNormsExpanded((v) => !v)}
          />
          {normsExpanded && normCount > 0 && (
            <div className="ml-4 mt-0.5 space-y-0.5">
              {(q?.calculations?.norms ?? []).map((norm, i) => (
                <button
                  key={norm.code || i}
                  onClick={() => {
                    nav('norms');
                    setTimeout(() => window.dispatchEvent(new CustomEvent('select-norm', { detail: { index: i } })), 80);
                  }}
                  className="flex items-center gap-1.5 w-full px-2 py-0.5 text-[11px] rounded text-left text-cw-gray-text hover:bg-cw-gray hover:text-cw-ink transition-colors"
                  title={norm.name || norm.code}
                >
                  <BarChart2 className="w-3 h-3 shrink-0 text-cw-gray-text" />
                  <span className="truncate font-mono">{norm.code || `norm-${i + 1}`}</span>
                  {norm.name && norm.name !== norm.code && (
                    <span className="ml-1 truncate text-cw-gray-text italic">{norm.name}</span>
                  )}
                </button>
              ))}
            </div>
          )}
          {/* Dimensions */}
          <ResourceRow
            icon={<LayoutGrid className="w-3.5 h-3.5" />}
            label={t('tabDimensions', uiLang)}
            count={dimCount > 0 ? dimCount : undefined}
            active={isActive && activeSubTab === 'dimensions'}
            onClick={() => nav('dimensions')}
            expandable={dimCount > 0}
            expanded={dimsExpanded}
            onToggleExpand={() => setDimsExpanded((v) => !v)}
          />
          {dimsExpanded && dimCount > 0 && (
            <div className="ml-4 mt-0.5 space-y-0.5">
              {(q?.dimensions ?? []).map((dim, i) => (
                <button
                  key={dim.code || i}
                  onClick={() => {
                    nav('dimensions');
                    setTimeout(() => window.dispatchEvent(new CustomEvent('select-dimension', { detail: { index: i } })), 80);
                  }}
                  className="flex items-center gap-1.5 w-full px-2 py-0.5 text-[11px] rounded text-left text-cw-gray-text hover:bg-cw-gray hover:text-cw-ink transition-colors"
                  title={dim.name || dim.code}
                >
                  <LayoutGrid className="w-3 h-3 shrink-0 text-cw-gray-text" />
                  <span className="truncate font-mono">{dim.code || `dim-${i + 1}`}</span>
                  {dim.name && dim.name !== dim.code && (
                    <span className="ml-1 truncate text-cw-gray-text italic">{dim.name}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Translations */}
          <ResourceRow
            icon={<Globe className="w-3.5 h-3.5" />}
            label={t('tabTranslations', uiLang)}
            count={extraLangs > 0 ? extraLangs : undefined}
            active={isActive && activeSubTab === 'translation'}
            onClick={() => { nav('translation'); if (extraLangs > 0) setLangsExpanded(true); }}
            expandable={extraLangs > 0}
            expanded={langsExpanded}
            onToggleExpand={() => setLangsExpanded((v) => !v)}
          />
          {langsExpanded && extraLangs > 0 && (
            <div className="ml-4 mt-0.5 space-y-0.5">
              {(q?.supportedLanguages ?? []).filter((l) => l !== q?.defaultLanguage).map((lang) => (
                <button
                  key={lang}
                  onClick={() => {
                    nav('translation');
                    setTimeout(() => window.dispatchEvent(new CustomEvent('select-language', { detail: { lang } })), 80);
                  }}
                  className="flex items-center gap-1.5 w-full px-2 py-0.5 text-[11px] rounded text-left text-cw-gray-text hover:bg-cw-gray hover:text-cw-ink transition-colors"
                >
                  <Globe className="w-3 h-3 shrink-0 text-cw-gray-text" />
                  <span className="font-mono">{lang}</span>
                </button>
              ))}
            </div>
          )}

          {/* Report */}
          <ResourceRow
            icon={<FileCode className="w-3.5 h-3.5" />}
            label={t('tabReports', uiLang)}
            active={isActive && activeSubTab === 'report'}
            onClick={() => { nav('report'); if (rapFileCount > 1) setRapExpanded(true); }}
            expandable={rapFileCount > 1}
            expanded={rapExpanded}
            onToggleExpand={() => setRapExpanded((v) => !v)}
          />
          {rapExpanded && rapFileCount > 1 && (
            <div className="ml-4 mt-0.5 space-y-0.5">
              {Object.keys(tab.rapFiles ?? {}).map((fileName) => (
                <button
                  key={fileName}
                  onClick={() => {
                    nav('report');
                    setTimeout(() => window.dispatchEvent(new CustomEvent('select-rap-file', { detail: { fileName } })), 80);
                  }}
                  className="flex items-center gap-1.5 w-full px-2 py-0.5 text-[11px] rounded text-left text-cw-gray-text hover:bg-cw-gray hover:text-cw-ink transition-colors"
                  title={fileName}
                >
                  <FileCode className="w-3 h-3 shrink-0 text-cw-gray-text" />
                  <span className="truncate font-mono">{fileName}</span>
                </button>
              ))}
            </div>
          )}

          {/* Media */}
          <ResourceRow
            icon={<Image className="w-3.5 h-3.5" />}
            label={t('tabMedia', uiLang)}
            count={mediaCount > 0 ? mediaCount : undefined}
            active={isActive && activeSubTab === 'media'}
            onClick={() => { nav('media'); if (mediaCount > 0) setMediaExpanded(true); }}
            expandable={mediaCount > 0}
            expanded={mediaExpanded}
            onToggleExpand={() => setMediaExpanded((v) => !v)}
          />
          {mediaExpanded && mediaCount > 0 && (
            <div className="ml-4 mt-0.5 space-y-0.5">
              {(tab.mediaFiles ?? []).map((f) => (
                <button
                  key={f.fileName}
                  onClick={() => {
                    nav('media');
                    setTimeout(() => window.dispatchEvent(new CustomEvent('select-media-file', { detail: { fileName: f.fileName } })), 80);
                  }}
                  className="flex items-center gap-1.5 w-full px-2 py-0.5 text-[11px] rounded text-left text-cw-gray-text hover:bg-cw-gray hover:text-cw-ink transition-colors"
                  title={f.fileName}
                >
                  <Image className="w-3 h-3 shrink-0 text-cw-gray-text" />
                  <span className="truncate">{f.fileName}</span>
                </button>
              ))}
            </div>
          )}
          <ResourceRow
            icon={<Info className="w-3.5 h-3.5" />}
            label={t('tabMetadata', uiLang)}
            active={isActive && activeSubTab === 'metadata'}
            onClick={() => nav('metadata')}
          />
        </div>
      )}
    </div>
  );
}

// ─── PackageExplorer ─────────────────────────────────────────────────────────

export function PackageExplorer({
  activeSubTab,
  lang,
  onNavigate,
  onNewQuestionnaire,
  onNewCalculation,
  onNewFlag,
  onNewNorm,
  onNewReport,
  onNewTranslation,
}: Props) {
  const { tabs, activeTabId, closeTab, setActiveTab } = useWorkspaceStore();

  function handleCloseTab(id: string) {
    closeTab(id);
  }

  return (
    <div data-testid="package-explorer" className="flex flex-col h-full bg-cw-gray border-r border-cw-border w-64 max-w-[85vw] xl:w-52 xl:max-w-none shrink-0 select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-2 border-b border-cw-border shrink-0">
        <span className="text-[10px] font-semibold text-cw-gray-text uppercase tracking-wider">
          {t('explorerTitle', lang)}
        </span>
        <button
          onClick={onNewQuestionnaire}
          className="text-cw-gray-text hover:text-cw-blue p-0.5 rounded"
          title={t('newQuestionnaire', lang)}
        >
          <PlusCircle className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-auto p-1.5">
        {tabs.length === 0 ? (
          <div className="text-center text-cw-gray-text text-xs mt-8 px-3 leading-relaxed">
            {t('noPackagesOpen', lang)}{' '}
            <button
              onClick={onNewQuestionnaire}
              className="text-cw-blue-light hover:underline"
            >
              {t('createNew', lang)}
            </button>
            .
          </div>
        ) : (
          tabs.map((tab) => (
            <PackageNode
              key={tab.id}
              tab={tab}
              isActive={tab.id === activeTabId}
              activeSubTab={activeSubTab}
              uiLang={lang}
              onNavigate={(id, sub) => {
                setActiveTab(id);
                onNavigate(id, sub);
              }}
              onNewCalculation={onNewCalculation}
              onNewFlag={onNewFlag}
              onNewNorm={onNewNorm}
              onNewReport={onNewReport}
              onNewTranslation={onNewTranslation}
              onCloseTab={handleCloseTab}
            />
          ))
        )}
      </div>
    </div>
  );
}
