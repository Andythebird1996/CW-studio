import { useState, useEffect, useMemo } from 'react';
import { ClipboardList, Search, ShieldAlert } from 'lucide-react';
import { Toolbar } from './components/layout/Toolbar';
import { TabBar } from './components/layout/TabBar';
import { PackageExplorer, type SubTab } from './components/layout/PackageExplorer';
import { SettingsDialog } from './components/dialogs/SettingsDialog';
import { ImportDialog } from './components/dialogs/ImportDialog';
import { NewQuestionnaireDialog, type NewQuestionnaireConfig } from './components/dialogs/NewQuestionnaireDialog';
import { PublishDialog } from './components/dialogs/PublishDialog';
import { PrintDialog } from './components/dialogs/PrintDialog';
import { QuestionnaireEditor } from './components/editors/QuestionnaireEditor';
import { CalculationEditor } from './components/editors/CalculationEditor';
import { TranslationEditor } from './components/editors/TranslationEditor';
import { FlagEditor } from './components/editors/FlagEditor';
import { ResponseTemplatesEditor } from './components/editors/ResponseTemplatesEditor';
import { NormEditor } from './components/editors/NormEditor';
import { ReportEditor } from './components/editors/ReportEditor';
import { MediaEditor } from './components/editors/MediaEditor';
import { MetadataEditor } from './components/editors/MetadataEditor';
import { DimensionsEditor } from './components/editors/DimensionsEditor';
import { ScoringDebugger } from './components/editors/ScoringDebugger';
import { ValidationNavigator } from './components/editors/ValidationNavigator';
import { DependencyGraph } from './components/editors/DependencyGraph';
import { SearchPanel } from './components/layout/SearchPanel';
import { FindReplaceDialog } from './components/dialogs/FindReplaceDialog';
import { validateQuestionnaire } from './services/validate-questionnaire';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useWorkspaceStore } from './stores/workspace-store';
import { useSettingsStore } from './stores/settings-store';
import { t, tf, countPhrase, type UILang, UILangContext } from './i18n';
import { storeApi } from './services/store-api';
import { parseQuestionnaire, parseCalculationFile, parseFlagFile, parseNormFile, applyTranslationFile, parseManifestFile } from './services/xml-parser';
import { serializeQuestionnaire } from './services/xml-serializer';
import { buildPackageZip } from './services/package-builder';
import JSZip from 'jszip';
import type { Questionnaire, LanguageType, MediaFile, PackageMetadata } from './types/questionnaire';
import type { EditorTab } from './stores/workspace-store';

function newQuestionnaire(uiLang: UILang): Questionnaire {
  const defaultName = t('newQuestionnaire', uiLang);
  return {
    code: '',
    version: '1.0',
    type: 'QUESTIONNAIRE',
    defaultLanguage: 'NO',
    supportedLanguages: ['NO'],
    name: { NO: defaultName } as Record<LanguageType, string>,
    sections: [],
  };
}

function EmptyState({
  onNew,
  onImport,
  onOpenFile,
  onOpenRecent,
  recentFiles,
  lang,
}: {
  onNew: () => void;
  onImport: () => void;
  onOpenFile: () => void;
  onOpenRecent: (uid: string) => void;
  recentFiles: { uid: string; title: string; openedAt: number }[];
  lang: UILang;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full select-none px-4 overflow-auto">
      <div className="bg-white border border-cw-border shadow-sm rounded-lg px-6 py-10 sm:px-10 w-full max-w-md text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-cw-gray text-cw-blue">
          <ClipboardList className="w-7 h-7" strokeWidth={1.5} />
        </div>
        <p className="text-lg font-medium text-cw-ink text-center">{t('noQuestionnaire', lang)}</p>
        <p className="text-sm mt-1 mb-5 text-cw-gray-text text-center">{t('noQuestionnaireHint', lang)}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <button onClick={onNew} className="px-4 py-2.5 xl:py-2 text-sm bg-cw-blue text-white rounded hover:bg-cw-blue-light">
            {t('newQuestionnaire', lang)}
          </button>
          <button onClick={onOpenFile} className="px-4 py-2.5 xl:py-2 text-sm border border-cw-border rounded hover:bg-cw-gray text-cw-ink bg-white">
            {t('openFile', lang)}
          </button>
          <button onClick={onImport} className="px-4 py-2.5 xl:py-2 text-sm border border-cw-border rounded hover:bg-cw-gray text-cw-ink bg-white">
            {t('import', lang)}
          </button>
        </div>
        {recentFiles.length > 0 && (
          <div className="mt-8 w-full">
            <p className="text-xs font-semibold text-cw-gray-text uppercase tracking-wide mb-2 text-center">
              {t('recentlyOpened', lang)}
            </p>
            <ul className="space-y-1">
              {recentFiles.map((f) => (
                <li key={f.uid}>
                  <button
                    onClick={() => onOpenRecent(f.uid)}
                    className="w-full text-left px-3 py-1.5 text-sm text-cw-gray-text rounded hover:bg-cw-gray hover:text-cw-blue transition-colors truncate"
                    title={f.title}
                  >
                    {f.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// Tab order mirrors Studio ResourceType folder names (alphabetical):
// calculations - flags - media - metadata - norms - quiz - reports - translations
function getSubTabs(lang: UILang) {
  return [
    { id: 'questionnaire', labelKey: 'tabQuiz'         as const },
    { id: 'calculation',   labelKey: 'tabCalculations' as const },
    { id: 'dimensions',    labelKey: 'tabDimensions'   as const },
    { id: 'flags',         labelKey: 'tabFlags'        as const },
    { id: 'norms',         labelKey: 'tabNorms'        as const },
    { id: 'translation',   labelKey: 'tabTranslations' as const },
    { id: 'report',        labelKey: 'tabReports'      as const },
    { id: 'media',         labelKey: 'tabMedia'        as const },
    { id: 'metadata',      labelKey: 'tabMetadata'     as const },
    { id: 'debugger',      labelKey: 'tabDebugger'     as const },
    { id: 'dependencies',  labelKey: 'tabDependencies' as const },
  ].map((tab) => ({ ...tab, label: t(tab.labelKey, lang) }));
}

function SubTabBar({
  activeSubTab,
  onChangeSubTab,
  hasReport,
  lang,
}: {
  activeSubTab: string;
  onChangeSubTab: (id: string) => void;
  hasReport: boolean;
  lang: UILang;
}) {
  const subTabs = getSubTabs(lang);
  return (
    <div data-testid="subtab-bar" className="flex border-b border-cw-border bg-white shrink-0 min-w-0 flex-1 overflow-x-auto px-2 xl:px-4 pt-2 gap-1">
      {subTabs.map((tab) => {
        const isReport = tab.id === 'report';
        return (
          <button
            key={tab.id}
            type="button"
            data-testid={`subtab-${tab.id}`}
            onClick={() => onChangeSubTab(tab.id)}
            className={`px-3 py-2.5 xl:py-1.5 text-xs rounded-t border-b-2 transition-colors shrink-0 whitespace-nowrap ${
              activeSubTab === tab.id
                ? 'border-cw-blue text-cw-blue font-medium'
                : 'border-transparent text-cw-gray-text hover:text-cw-ink'
            } ${isReport && !hasReport ? 'opacity-50' : ''}`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export default function App() {
  const { settings, setSettings } = useSettingsStore();
  const lang: UILang = (settings.uiLanguage as UILang) ?? 'NO';
  const { tabs, activeTabId, openTab, updateTab, markDirty, undo, redo, canUndo, canRedo, loadAutoSave, clearAutoSave, addRecentFile, recentFiles } = useWorkspaceStore();

  const [showSettings, setShowSettings] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [subTab, setSubTab] = useState<SubTab>('questionnaire');
  const [searchOpen, setSearchOpen] = useState(false);
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);
  const [validationOpen, setValidationOpen] = useState(false);
  const [navigateToId, setNavigateToId] = useState<{ id: string; seq: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [fileInputTrigger, setFileInputTrigger] = useState(0);
  const [sessionRestorePrompt, setSessionRestorePrompt] = useState<EditorTab[] | null>(null);
  const [sessionRestoreActiveId, setSessionRestoreActiveId] = useState<string | null>(null);
  const [explorerOpen, setExplorerOpen] = useState(false);

  function closeExplorerIfNarrow() {
    if (window.matchMedia('(max-width: 1279px)').matches) setExplorerOpen(false);
  }

  const activeTab = tabs.find((t) => t.id === activeTabId);

  const validationIssues = useMemo(
    () => (activeTab?.data ? validateQuestionnaire(activeTab.data, lang) : []),
    [activeTab?.data, lang],
  );

  // Parse a dot-path like "sections[11].subSections[7].questions[2]" to find the element id
  function resolvePathToId(path: string): string | null {
    if (!activeTab?.data) return null;
    const parts = path.match(/\w+\[\d+\]/g);
    if (!parts) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let node: any = activeTab.data;
    for (const part of parts) {
      const m = part.match(/^(\w+)\[(\d+)\]$/);
      if (!m) return null;
      node = node[m[1]]?.[parseInt(m[2])];
      if (!node) return null;
    }
    return typeof node?.id === 'string' ? node.id : null;
  }

  // On mount: check for auto-saved session
  useEffect(() => {
    const saved = loadAutoSave();
    if (saved && saved.tabs.length > 0 && tabs.length === 0) {
      setSessionRestorePrompt(saved.tabs);
      setSessionRestoreActiveId(saved.activeTabId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSessionRestore() {
    if (!sessionRestorePrompt) return;
    for (const tab of sessionRestorePrompt) {
      openTab({ ...tab, _past: [], _future: [] });
    }
    if (sessionRestoreActiveId) {
      useWorkspaceStore.getState().setActiveTab(sessionRestoreActiveId);
    }
    setSessionRestorePrompt(null);
    setSessionRestoreActiveId(null);
  }

  function handleSessionDismiss() {
    clearAutoSave();
    setSessionRestorePrompt(null);
    setSessionRestoreActiveId(null);
  }

  // Ctrl+Z / Cmd+Z = Angre, Ctrl+Y / Cmd+Shift+Z = Gjør om
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      // Ctrl+F / Cmd+F — open search panel
      if (e.key === 'f') {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      // Ctrl+H / Cmd+H — open find & replace
      if (e.key === 'h') {
        e.preventDefault();
        setFindReplaceOpen(true);
        return;
      }
      if (!activeTabId) return;
      // Don't intercept inside text inputs / textareas
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'z' && !e.shiftKey && canUndo(activeTabId)) {
        e.preventDefault();
        undo(activeTabId);
      } else if ((e.key === 'y' || (e.key === 'z' && e.shiftKey)) && canRedo(activeTabId)) {
        e.preventDefault();
        redo(activeTabId);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [activeTabId, undo, redo, canUndo, canRedo]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  function handleNewQuestionnaire() {
    setShowNewDialog(true);
  }

  function handleCreateQuestionnaire(config: NewQuestionnaireConfig) {
    const q = newQuestionnaire(lang);
    q.code = config.code;
    q.version = config.version;
    q.defaultLanguage = config.defaultLanguage;
    q.supportedLanguages = [config.defaultLanguage];
    q.name = { [config.defaultLanguage]: config.name } as Record<LanguageType, string>;
    if (config.clinicianOnly) q.clinicianOnly = true;
    if (config.exportAllowed !== undefined) q.exportAllowed = config.exportAllowed;

    const title = config.name || config.code || t('newQuestionnaire', lang);
    const id = crypto.randomUUID();
    openTab({ id, title, type: 'questionnaire', isDirty: true, data: q });
    setSubTab('questionnaire');
    setShowNewDialog(false);
  }

  async function handleOpenFile(file: File) {
    try {
      const ext = file.name.split('.').pop()?.toLowerCase();

      if (ext === 'zip') {
        await handleOpenZip(file);
        return;
      }

      const text = await file.text();

      if (ext === 'questionnaire') {
        const questionnaire = parseQuestionnaire(text);
        const id = `file-${file.name}`;
        openTab({
          id,
          title: questionnaire.name[questionnaire.defaultLanguage] || file.name,
          type: 'questionnaire',
          isDirty: false,
          data: questionnaire,
        });
        setSubTab('questionnaire');
        showToast(tf('openedFile', lang, { name: file.name }));
      } else if (ext === 'rap') {
        if (activeTabId) {
          const tab = tabs.find((t) => t.id === activeTabId);
          const existing = tab?.rapFiles ?? {};
          updateTab(activeTabId, {
            rapFiles: { ...existing, [file.name]: text },
            activeRapFileName: file.name,
          });
          markDirty(activeTabId);
          setSubTab('report');
          showToast(tf('loadedReport', lang, { name: file.name }));
        } else {
          showToast(t('openAssessmentFirst', lang));
        }
      } else {
        showToast(tf('unknownFileType', lang, { ext: ext ?? '' }));
      }
    } catch (err: any) {
      showToast(tf('openError', lang, { message: err instanceof Error ? err.message : String(err) }));
    }
  }

  async function handleOpenZip(file: File) {
    const BINARY_EXTS = new Set(['png','jpg','jpeg','gif','bmp','webp','svg','pdf','mp3','wav','ogg','mp4']);
    const MIME: Record<string, string> = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
      gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp',
      svg: 'image/svg+xml', pdf: 'application/pdf',
      mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', mp4: 'video/mp4',
    };

    const buf = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buf);

    interface ZipEntry { path: string; fileName: string; extension: string; content: string; encoding: 'text'|'base64' }
    const entries: ZipEntry[] = [];

    for (const [rawPath, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;
      const path = rawPath.replace(/\\/g, '/');
      const fileName = path.split('/').pop() ?? rawPath;
      const dotIdx = fileName.lastIndexOf('.');
      const extension = (dotIdx >= 0 ? fileName.slice(dotIdx + 1) : '').toLowerCase();
      const isBinary = BINARY_EXTS.has(extension);
      const content = isBinary ? await entry.async('base64') : await entry.async('string');
      entries.push({ path, fileName, extension, content, encoding: isBinary ? 'base64' : 'text' });
    }

    const qFile = entries.find((e) => e.extension === 'questionnaire');
    if (!qFile) { showToast(t('noQuestionnaireInZip', lang)); return; }

    let questionnaire = parseQuestionnaire(qFile.content);

    const calcFiles = entries.filter((e) => e.extension === 'calculation');
    if (calcFiles.length > 0) {
      const calculations = calcFiles.map((f) => parseCalculationFile(f.content, questionnaire)).filter(Boolean) as import('./types/questionnaire').Calculation[];
      if (calculations.length > 0)
        questionnaire = { ...questionnaire, calculations: { calculations, norms: questionnaire.calculations?.norms ?? [] } };
    }

    const normFiles = entries.filter((e) => e.extension === 'norm');
    if (normFiles.length > 0) {
      const norms = normFiles.map((f) => parseNormFile(f.content)).filter(Boolean) as import('./types/questionnaire').Norm[];
      if (norms.length > 0)
        questionnaire = { ...questionnaire, calculations: { calculations: questionnaire.calculations?.calculations ?? [], norms: [...(questionnaire.calculations?.norms ?? []), ...norms] } };
    }

    const flagFiles = entries.filter((e) => e.extension === 'flag');
    if (flagFiles.length > 0) {
      const flags = flagFiles.map((f) => parseFlagFile(f.content, questionnaire)).filter(Boolean) as import('./types/questionnaire').Flag[];
      if (flags.length > 0) questionnaire = { ...questionnaire, flags };
    }

    for (const tf of entries.filter((e) => e.extension === 'translation')) {
      questionnaire = applyTranslationFile(questionnaire, tf.content);
    }

    const manifestFile = entries.find((e) => e.extension === 'manifest');
    const packageMetadata: PackageMetadata | undefined = manifestFile
      ? (parseManifestFile(manifestFile.content) ?? undefined)
      : undefined;

    const rapEntries = entries.filter((e) => e.extension === 'rap');
    const rapFiles: Record<string, string> = {};
    for (const re of rapEntries) rapFiles[re.fileName] = re.content;

    const mediaFiles: MediaFile[] = entries
      .filter((e) => BINARY_EXTS.has(e.extension) && e.encoding === 'base64')
      .map((e) => {
        const mime = MIME[e.extension] ?? 'application/octet-stream';
        return {
          fileName: e.fileName,
          extension: e.extension,
          mimeType: mime,
          dataUrl: `data:${mime};base64,${e.content}`,
          sizeKb: Math.round(e.content.length * 0.75 / 1024),
        };
      });

    const id = `zip-${file.name}`;
    const zipTitle = questionnaire.name[questionnaire.defaultLanguage] || questionnaire.code || file.name;
    openTab({
      id,
      title: zipTitle,
      type: 'questionnaire',
      isDirty: false,
      data: questionnaire,
      packageCode: questionnaire.code,
      rapFiles: Object.keys(rapFiles).length > 0 ? rapFiles : undefined,
      activeRapFileName: Object.keys(rapFiles)[0],
      mediaFiles: mediaFiles.length > 0 ? mediaFiles : undefined,
      packageMetadata,
    });
    addRecentFile(id, zipTitle);
    setSubTab('questionnaire');

    const parts = [
      calcFiles.length > 0 ? countPhrase(calcFiles.length, lang, 'nCalculationOne', 'nCalculationMany') : '',
      normFiles.length > 0 ? countPhrase(normFiles.length, lang, 'nNormOne', 'nNormMany') : '',
      flagFiles.length > 0 ? countPhrase(flagFiles.length, lang, 'nFlagOne', 'nFlagMany') : '',
      rapEntries.length > 0 ? countPhrase(rapEntries.length, lang, 'nReportOne', 'nReportMany') : '',
      mediaFiles.length > 0 ? countPhrase(mediaFiles.length, lang, 'nMediaOne', 'nMediaMany') : '',
    ].filter(Boolean).join(', ');
    showToast(parts ? tf('openedWithParts', lang, { name: file.name, parts }) : tf('openedFile', lang, { name: file.name }));
  }

  async function handleImport(uid: number, replaceTabId?: string) {
    setShowImport(false);
    try {
      const pkg = await storeApi.getPackage(settings, uid);
      const qFile = pkg.files.find((f) => f.extension === 'questionnaire');
      if (!qFile) throw new Error(t('noQuestionnaireInPackage', lang));

      let questionnaire = parseQuestionnaire(qFile.content);

      // Collect all .rap report files
      const rapEntries2 = pkg.files.filter((f) => f.extension === 'rap');
      const rapFiles2: Record<string, string> = {};
      for (const re of rapEntries2) rapFiles2[re.fileName] = re.content;

      // Parse .calculation files
      const calcFiles = pkg.files.filter((f) => f.extension === 'calculation');
      if (calcFiles.length > 0) {
        const calculations = calcFiles
          .map((f) => parseCalculationFile(f.content, questionnaire))
          .filter(Boolean) as import('./types/questionnaire').Calculation[];
        if (calculations.length > 0) {
          questionnaire = {
            ...questionnaire,
            calculations: {
              calculations,
              norms: questionnaire.calculations?.norms ?? [],
            },
          };
        }
      }

      // Parse .flag files
      const flagFiles = pkg.files.filter((f) => f.extension === 'flag');
      if (flagFiles.length > 0) {
        const flags = flagFiles
          .map((f) => parseFlagFile(f.content, questionnaire))
          .filter(Boolean) as import('./types/questionnaire').Flag[];
        if (flags.length > 0) {
          questionnaire = { ...questionnaire, flags };
        }
      }

      // Parse .norm files
      const normFiles = pkg.files.filter((f) => f.extension === 'norm');
      if (normFiles.length > 0) {
        const norms = normFiles
          .map((f) => parseNormFile(f.content))
          .filter(Boolean) as import('./types/questionnaire').Norm[];
        if (norms.length > 0) {
          questionnaire = {
            ...questionnaire,
            calculations: {
              calculations: questionnaire.calculations?.calculations ?? [],
              norms: [...(questionnaire.calculations?.norms ?? []), ...norms],
            },
          };
        }
      }

      // Apply .translation files — each enriches the questionnaire with a new language
      const translationFiles = pkg.files.filter((f) => f.extension === 'translation');
      for (const tf of translationFiles) {
        questionnaire = applyTranslationFile(questionnaire, tf.content);
      }

      // Parse .manifest file (metadata)
      const manifestFile = pkg.files.find((f) => f.extension === 'manifest');
      const packageMetadata: PackageMetadata | undefined = manifestFile
        ? (parseManifestFile(manifestFile.content) ?? undefined)
        : undefined;

      // Collect media files (binary, stored as base64 data URLs)
      const MIME: Record<string, string> = {
        png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
        gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp',
        svg: 'image/svg+xml', pdf: 'application/pdf',
        mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
        mp4: 'video/mp4',
      };
      const mediaFiles: MediaFile[] = pkg.files
        .filter((f) => f.extension.toLowerCase() in MIME)
        .map((f) => {
          const mime = MIME[f.extension.toLowerCase()] ?? 'application/octet-stream';
          const dataUrl = f.encoding === 'base64'
            ? `data:${mime};base64,${f.content}`
            : '';
          return {
            fileName: f.fileName,
            extension: f.extension,
            mimeType: mime,
            dataUrl,
            sizeKb: Math.round(f.content.length * 0.75 / 1024),
          };
        });

      const id = `pkg-${uid}`;
      const pkgTitle = questionnaire.name[questionnaire.defaultLanguage] || pkg.name || pkg.code;
      if (replaceTabId) {
        // Overwrite an existing open tab in-place (preserves tab position and id)
        updateTab(replaceTabId, {
          title: pkgTitle,
          isDirty: false,
          data: questionnaire,
          packageCode: pkg.code,
          rapFiles: Object.keys(rapFiles2).length > 0 ? rapFiles2 : undefined,
          activeRapFileName: Object.keys(rapFiles2)[0],
          mediaFiles: mediaFiles.length > 0 ? mediaFiles : undefined,
          packageMetadata,
        });
        useWorkspaceStore.getState().setActiveTab(replaceTabId);
      } else {
        openTab({
          id,
          title: pkgTitle,
          type: 'questionnaire',
          isDirty: false,
          data: questionnaire,
          packageCode: pkg.code,
          rapFiles: Object.keys(rapFiles2).length > 0 ? rapFiles2 : undefined,
          activeRapFileName: Object.keys(rapFiles2)[0],
          mediaFiles: mediaFiles.length > 0 ? mediaFiles : undefined,
          packageMetadata,
        });
      }
      addRecentFile(String(uid), pkgTitle);
      setSubTab('questionnaire');

      const calcCount = questionnaire.calculations?.calculations.length ?? 0;
      const dimCount = questionnaire.dimensions?.length ?? 0;
      const flagCount = questionnaire.flags?.length ?? 0;
      const normCount = questionnaire.calculations?.norms.length ?? 0;
      const langCount = questionnaire.supportedLanguages.length;
      const parts = [
        rapEntries2.length > 0 ? countPhrase(rapEntries2.length, lang, 'nReportOne', 'nReportMany') : '',
        calcCount > 0 ? countPhrase(calcCount, lang, 'nCalculationOne', 'nCalculationMany') : '',
        dimCount > 0 ? countPhrase(dimCount, lang, 'nDimensionOne', 'nDimensionMany') : '',
        flagCount > 0 ? countPhrase(flagCount, lang, 'nFlagOne', 'nFlagMany') : '',
        normCount > 0 ? countPhrase(normCount, lang, 'nNormOne', 'nNormMany') : '',
        mediaFiles.length > 0 ? countPhrase(mediaFiles.length, lang, 'nMediaOne', 'nMediaMany') : '',
        langCount > 1 ? countPhrase(langCount, lang, 'nLanguageOne', 'nLanguageMany') : '',
      ].filter(Boolean).join(', ');
      showToast(parts ? tf('importedWithParts', lang, { name: pkg.name, parts }) : tf('importedPackage', lang, { name: pkg.name }));
    } catch (err: unknown) {
      showToast(tf('importError', lang, { message: err instanceof Error ? err.message : String(err) }));
    }
  }

  function handleQuestionnaireChange(q: Questionnaire) {
    if (!activeTabId) return;
    updateTab(activeTabId, {
      data: q,
      title: q.name[q.defaultLanguage] || q.code || t('unnamed', lang),
    });
    markDirty(activeTabId);
  }

  function handleRapFileChange(fileName: string, content: string) {
    if (!activeTabId) return;
    const existing = activeTab?.rapFiles ?? {};
    updateTab(activeTabId, { rapFiles: { ...existing, [fileName]: content } });
    markDirty(activeTabId);
  }

  function handleRapSelectFile(fileName: string) {
    if (!activeTabId) return;
    updateTab(activeTabId, { activeRapFileName: fileName, _pushHistory: false });
  }

  function handleRapAddFile() {
    if (!activeTabId || !activeTab?.data) return;
    const base = activeTab.data.code || t('reportFileStem', lang);
    const existing = activeTab.rapFiles ?? {};
    let newName = `${base}.rap`;
    let n = 2;
    while (existing[newName]) { newName = `${base}_${n++}.rap`; }
    updateTab(activeTabId, {
      rapFiles: { ...existing, [newName]: '' },
      activeRapFileName: newName,
    });
    markDirty(activeTabId);
    setSubTab('report');
  }

  function handleRapDeleteFile(fileName: string) {
    if (!activeTabId) return;
    const existing = { ...(activeTab?.rapFiles ?? {}) };
    delete existing[fileName];
    const remaining = Object.keys(existing);
    updateTab(activeTabId, {
      rapFiles: remaining.length > 0 ? existing : undefined,
      activeRapFileName: remaining[0],
    });
    markDirty(activeTabId);
  }

  // ── New resource handlers (from Package Explorer) ─────────────────────────

  function handleNewCalculation(tabId: string) {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab?.data) return;
    const blank: import('./types/questionnaire').Calculation = { code: '', name: t('newCalculationName', lang), type: 'SUM', innerCalculations: [] };
    const calcs = tab.data.calculations?.calculations ?? [];
    const norms = tab.data.calculations?.norms ?? [];
    updateTab(tabId, { data: { ...tab.data, calculations: { calculations: [...calcs, blank], norms } } });
    markDirty(tabId);
    setSubTab('calculation');
  }

  function handleNewFlag(tabId: string) {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab?.data) return;
    const blank: import('./types/questionnaire').Flag = { code: '', name: t('newFlagName', lang), type: 'INFO', conditions: [], logic: 'AND' };
    updateTab(tabId, { data: { ...tab.data, flags: [...(tab.data.flags ?? []), blank] } });
    markDirty(tabId);
    setSubTab('flags');
  }

  function handleNewNorm(tabId: string) {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab?.data) return;
    const blank: import('./types/questionnaire').Norm = { code: '', name: t('newNormName', lang), type: 'NORM', data: [] };
    const calcs = tab.data.calculations?.calculations ?? [];
    const norms = tab.data.calculations?.norms ?? [];
    updateTab(tabId, { data: { ...tab.data, calculations: { calculations: calcs, norms: [...norms, blank] } } });
    markDirty(tabId);
    setSubTab('norms');
  }

  function handleNewReport(tabId: string) {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;
    if (!tab.rapFiles || Object.keys(tab.rapFiles).length === 0) {
      const fileName = `${tab.data?.code || t('reportFileStem', lang)}.rap`;
      updateTab(tabId, { rapFiles: { [fileName]: '' }, activeRapFileName: fileName });
      markDirty(tabId);
    }
    setSubTab('report');
  }

  function handleNewTranslation(tabId: string) {
    // Navigate to translation editor — user creates langs there
    setSubTab('translation');
  }

  function handleExplorerNavigate(tabId: string, sub: SubTab) {
    setSubTab(sub);
    closeExplorerIfNarrow();
  }

  async function handleSave() {
    if (!activeTab?.data) return;
    const hasExtras = !!(
      (activeTab.data.calculations?.calculations.length ?? 0) > 0 ||
      (activeTab.data.calculations?.norms.length ?? 0) > 0 ||
      (activeTab.data.flags?.length ?? 0) > 0 ||
      Object.keys(activeTab.rapFiles ?? {}).length > 0
    );

    try {
      if (hasExtras) {
        // Save as full ZIP package
        const pkg = await buildPackageZip(activeTab.data, activeTab.rapFiles, activeTab.mediaFiles, activeTab.packageMetadata);
        const binary = atob(pkg.base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'application/zip' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = pkg.fileName;
        a.click();
        URL.revokeObjectURL(url);
        showToast(tf('downloadedFile', lang, { name: pkg.fileName }));
      } else {
        // Simple .questionnaire file
        const xml = serializeQuestionnaire(activeTab.data);
        const blob = new Blob([xml], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${activeTab.data.code || 'questionnaire'}.questionnaire`;
        a.click();
        URL.revokeObjectURL(url);
        showToast(t('downloadedQuestionnaire', lang));
      }
    } catch (err: unknown) {
      showToast(tf('genericError', lang, { message: err instanceof Error ? err.message : String(err) }));
    }
  }

  const hasData = !!activeTab?.data;
  const hasReport = Object.keys(activeTab?.rapFiles ?? {}).length > 0;

  // Hidden file input is managed by Toolbar, but we need a trigger for EmptyState
  function triggerFileOpen() {
    setFileInputTrigger((n) => n + 1);
  }

  async function handleImportRecent(uid: string) {
    // uid from server imports are numeric strings; zip ones start with 'zip-'
    const numeric = Number(uid);
    if (!isNaN(numeric) && String(numeric) === uid) {
      setShowImport(false);
      await handleImport(numeric);
    } else {
      // File-based uid — can't re-open automatically, show import dialog
      setShowImport(true);
    }
  }

  return (
    <UILangContext.Provider value={lang}>
    <div data-testid="app-shell" className="flex flex-col h-dvh max-h-dvh w-full max-w-full min-w-0 bg-cw-gray overflow-hidden">
      {/* ── Session restore banner ── */}
      {sessionRestorePrompt && (
        <div className="bg-cw-orange-soft border-b border-cw-orange/40 px-4 py-2 flex flex-wrap items-center gap-3 text-sm text-cw-orange shrink-0 z-40">
          <span className="flex-1">
            {sessionRestorePrompt.length === 1
              ? t('sessionRestoreOne', lang)
              : tf('sessionRestoreMany', lang, { n: sessionRestorePrompt.length })}
          </span>
          <button
            onClick={handleSessionRestore}
            className="px-3 py-1 bg-cw-orange text-white rounded hover:bg-cw-orange text-xs font-medium"
          >
            {t('sessionRestore', lang)}
          </button>
          <button
            onClick={handleSessionDismiss}
            className="px-3 py-1 border border-cw-orange/40 rounded hover:bg-cw-orange-soft text-xs"
          >
            {t('sessionDismiss', lang)}
          </button>
        </div>
      )}

      {/* ── Toolbar (full width) ── */}
      <Toolbar
        onNewQuestionnaire={handleNewQuestionnaire}
        onImport={() => setShowImport(true)}
        onOpenFile={handleOpenFile}
        onSave={handleSave}
        onPublish={() => setShowPublish(true)}
        onOpenSettings={() => setShowSettings(true)}
        onPrint={() => setShowPrint(true)}
        lang={lang}
        onToggleLang={() => setSettings({ uiLanguage: lang === 'NO' ? 'EN' : 'NO' })}
        onToggleExplorer={() => setExplorerOpen((open) => !open)}
      />

      {/* ── Main area: sidebar + content ── */}
      <div className="flex flex-1 overflow-hidden min-w-0 min-h-0 relative">

        {/* Backdrop for the overlay sidebar below the desktop breakpoint */}
        {explorerOpen && (
          <button
            type="button"
            className="xl:hidden absolute inset-0 z-30 bg-black/40"
            aria-label={t('explorerTitle', lang)}
            onClick={() => setExplorerOpen(false)}
          />
        )}

        {/* Left: Package Explorer. Persistent from xl, overlay below. */}
        <div className={`${explorerOpen ? 'absolute inset-y-0 left-0 z-40 flex h-full' : 'hidden'} xl:static xl:z-auto xl:flex xl:h-full`}>
          <PackageExplorer
            activeSubTab={subTab}
            lang={lang}
            onNavigate={handleExplorerNavigate}
            onNewQuestionnaire={handleNewQuestionnaire}
            onNewCalculation={handleNewCalculation}
            onNewFlag={handleNewFlag}
            onNewNorm={handleNewNorm}
            onNewReport={handleNewReport}
            onNewTranslation={handleNewTranslation}
          />
        </div>

        {/* Right: editor area */}
        <div className="flex flex-col flex-1 overflow-hidden min-w-0 min-h-0">

          <TabBar />

          {hasData && (
            <div className="flex items-center shrink-0 min-w-0">
              <SubTabBar
                activeSubTab={subTab}
                onChangeSubTab={(s) => setSubTab(s as SubTab)}
                hasReport={hasReport}
                lang={lang}
              />
              <button
                onClick={() => setSearchOpen(true)}
                title={t('searchShortcut', lang)}
                aria-label={t('searchShortcut', lang)}
                className="ml-auto mr-1 shrink-0 p-2 xl:p-1 text-cw-gray-text hover:text-cw-ink rounded"
              >
                <Search size={15} />
              </button>
            </div>
          )}

          <main className="flex-1 overflow-hidden flex flex-col min-w-0 min-h-0">
            {searchOpen && activeTab?.data && (
              <SearchPanel
                questionnaire={activeTab.data}
                onNavigate={(path) => {
                  setSearchOpen(false);
                  if (path.startsWith('flags')) {
                    setSubTab('flags');
                  } else if (path.startsWith('calculations')) {
                    setSubTab('calculation');
                  } else if (path.startsWith('responseTemplates')) {
                    setSubTab('response-templates');
                  } else {
                    setSubTab('questionnaire');
                    const id = resolvePathToId(path);
                    if (id) setNavigateToId((prev) => ({ id, seq: (prev?.seq ?? 0) + 1 }));
                  }
                }}
                onClose={() => setSearchOpen(false)}
              />
            )}
            <ErrorBoundary>
            {!hasData ? (
              <EmptyState
                onNew={handleNewQuestionnaire}
                onImport={() => setShowImport(true)}
                onOpenFile={triggerFileOpen}
                onOpenRecent={handleImportRecent}
                recentFiles={recentFiles}
                lang={lang}
              />
            ) : subTab === 'questionnaire' ? (
              <QuestionnaireEditor
                questionnaire={activeTab.data!}
                onChange={handleQuestionnaireChange}
                navigateToElementId={navigateToId}
                mediaFiles={activeTab.mediaFiles}
                onToggleValidation={() => setValidationOpen((v) => !v)}
              />
            ) : subTab === 'calculation' ? (
              <CalculationEditor
                questionnaire={activeTab.data!}
                onChange={handleQuestionnaireChange}
              />
            ) : subTab === 'response-templates' ? (
              <ResponseTemplatesEditor
                questionnaire={activeTab.data!}
                onChange={handleQuestionnaireChange}
              />
            ) : subTab === 'flags' ? (
              <FlagEditor
                questionnaire={activeTab.data!}
                onChange={handleQuestionnaireChange}
              />
            ) : subTab === 'norms' ? (
              <NormEditor
                questionnaire={activeTab.data!}
                onChange={handleQuestionnaireChange}
              />
            ) : subTab === 'dimensions' ? (
              <DimensionsEditor
                questionnaire={activeTab.data!}
                onChange={handleQuestionnaireChange}
              />
            ) : subTab === 'translation' ? (
              <TranslationEditor
                questionnaire={activeTab.data!}
                onChange={handleQuestionnaireChange}
              />
            ) : subTab === 'media' ? (
              <MediaEditor
                mediaFiles={activeTab.mediaFiles ?? []}
                onChange={(files) => {
                  if (!activeTabId) return;
                  updateTab(activeTabId, { mediaFiles: files.length > 0 ? files : undefined, _pushHistory: false });
                  markDirty(activeTabId);
                }}
              />
            ) : subTab === 'metadata' ? (
              <MetadataEditor
                questionnaire={activeTab.data!}
                packageMetadata={activeTab.packageMetadata}
                onChange={(q, pm) => {
                  handleQuestionnaireChange(q);
                  if (pm && activeTabId) updateTab(activeTabId, { packageMetadata: pm, _pushHistory: false });
                }}
              />
            ) : subTab === 'debugger' ? (
              <ScoringDebugger questionnaire={activeTab.data!} />
            ) : subTab === 'dependencies' ? (
              <DependencyGraph questionnaire={activeTab.data!} />
            ) : subTab === 'report' ? (
              <ReportEditor
                code={activeTab.data?.code ?? ''}
                rapFiles={activeTab.rapFiles ?? {}}
                activeFileName={activeTab.activeRapFileName ?? Object.keys(activeTab.rapFiles ?? {})[0] ?? ''}
                questionnaire={activeTab.data!}
                onChangeFile={handleRapFileChange}
                onSelectFile={handleRapSelectFile}
                onAddFile={handleRapAddFile}
                onDeleteFile={handleRapDeleteFile}
              />
            ) : null}
            </ErrorBoundary>
            {/* ── Validation panel — always visible at the bottom when data is loaded ── */}
            {hasData && (
              <>
                {validationOpen && (
                  <ValidationNavigator
                    issues={validationIssues}
                    onNavigate={(issue) => {
                      const path = issue.path;
                      // Helper: extract first array index from path like "calculations.calculations[2]..."
                      function firstIndex(p: string): number {
                        const m = p.match(/\[(\d+)\]/);
                        return m ? parseInt(m[1], 10) : 0;
                      }
                      if (path.startsWith('flags')) {
                        const idx = firstIndex(path);
                        setSubTab('flags');
                        setTimeout(() => window.dispatchEvent(new CustomEvent('select-flag', { detail: { index: idx } })), 80);
                      } else if (path.startsWith('calculations')) {
                        // path: "calculations.calculations[N]..." → second index
                        const m = path.match(/calculations\[(\d+)\]/);
                        const idx = m ? parseInt(m[1], 10) : 0;
                        setSubTab('calculation');
                        setTimeout(() => window.dispatchEvent(new CustomEvent('select-calculation', { detail: { index: idx } })), 80);
                      } else if (path.startsWith('norms')) {
                        const idx = firstIndex(path);
                        setSubTab('norms');
                        setTimeout(() => window.dispatchEvent(new CustomEvent('select-norm', { detail: { index: idx } })), 80);
                      } else if (path.startsWith('responseTemplates')) {
                        setSubTab('response-templates');
                      } else {
                        setSubTab('questionnaire');
                        const id = resolvePathToId(path);
                        if (id) setNavigateToId((prev) => ({ id, seq: (prev?.seq ?? 0) + 1 }));
                      }
                    }}
                  />
                )}
                <div className="shrink-0 flex items-center gap-2 px-3 py-1 border-t border-cw-border bg-white">
                  <button
                    onClick={() => setValidationOpen((v) => !v)}
                    className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded border transition-colors ${
                      validationOpen
                        ? 'bg-cw-blue text-white border-cw-blue'
                        : 'border-cw-border text-cw-gray-text hover:text-cw-ink'
                    }`}
                    title={t('validationResults', lang)}
                  >
                    <ShieldAlert size={12} />
                    {t('validationPanel', lang)}
                    {validationIssues.length > 0 && (
                      <span className={`ml-1 px-1 rounded text-xs font-medium ${validationOpen ? 'bg-white text-cw-blue' : 'bg-cw-negative-soft text-cw-negative'}`}>
                        {validationIssues.length}
                      </span>
                    )}
                  </button>
                </div>
              </>
            )}
          </main>

        </div>
      </div>

      {toast && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:max-w-sm bg-cw-ink text-white text-sm px-4 py-2 rounded shadow-lg z-50 break-words">
          {toast}
        </div>
      )}

      {findReplaceOpen && activeTab?.data && (
        <FindReplaceDialog
          questionnaire={activeTab.data}
          onChange={(q) => updateTab(activeTab.id, { data: q })}
          onClose={() => setFindReplaceOpen(false)}
        />
      )}
      <NewQuestionnaireDialog
        open={showNewDialog}
        onClose={() => setShowNewDialog(false)}
        onCreate={handleCreateQuestionnaire}
      />
      <SettingsDialog open={showSettings} onClose={() => setShowSettings(false)} />
      <ImportDialog open={showImport} onClose={() => setShowImport(false)} onImport={handleImport} />
      {showPublish && activeTab?.data && (
        <PublishDialog
          open={showPublish}
          onClose={() => setShowPublish(false)}
          questionnaire={activeTab.data}
          rapFiles={activeTab.rapFiles}
          mediaFiles={activeTab.mediaFiles}
          packageMetadata={activeTab.packageMetadata}
        />
      )}
      {showPrint && activeTab?.data && (
        <PrintDialog
          open={showPrint}
          onClose={() => setShowPrint(false)}
          questionnaire={activeTab.data}
        />
      )}
    </div>
    </UILangContext.Provider>
  );
}
