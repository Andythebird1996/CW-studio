import { useRef, useState } from 'react';
import { Download, FilePlus, FolderOpen, LogOut, PanelLeft, Printer, Redo2, RefreshCw, Save, Settings, Undo2, Upload } from 'lucide-react';
import { useSettingsStore } from '../../stores/settings-store';
import * as Tooltip from '@radix-ui/react-tooltip';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { t, type UILang } from '../../i18n';
import { storeApi } from '../../services/store-api';

interface Props {
  onNewQuestionnaire: () => void;
  onImport: () => void;
  onOpenFile: (file: File) => void;
  onSave: () => void;
  onPublish: () => void;
  onOpenSettings: () => void;
  onPrint: () => void;
  lang: UILang;
  onToggleLang: () => void;
  onToggleExplorer: () => void;
}

function Btn({
  icon,
  label,
  onClick,
  disabled,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <Tooltip.Provider delayDuration={300}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            data-testid={testId}
            onClick={onClick}
            disabled={disabled}
            className="flex items-center justify-center w-10 h-10 xl:w-8 xl:h-8 rounded hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors shrink-0"
            aria-label={label}
          >
            {icon}
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="bottom"
            className="bg-gray-800 text-white text-xs px-2 py-1 rounded z-50"
          >
            {label}
            <Tooltip.Arrow className="fill-gray-800" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

export function Toolbar({ onNewQuestionnaire, onImport, onOpenFile, onSave, onPublish, onOpenSettings, onPrint, lang, onToggleLang, onToggleExplorer }: Props) {
  const { tabs, activeTabId, undo, redo, canUndo, canRedo } = useWorkspaceStore();
  const { settings, setSettings } = useSettingsStore();
  const [clearingCache, setClearingCache] = useState(false);
  const [cacheStatus, setCacheStatus] = useState<string | null>(null);

  function disconnect() {
    setSettings({ user: '', password: '' });
  }
  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const undoable = activeTabId ? canUndo(activeTabId) : false;
  const redoable = activeTabId ? canRedo(activeTabId) : false;
  const isConnected = !!(settings.storeUrl && settings.user);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onOpenFile(file);
    e.target.value = '';
  }

  async function handleClearCache() {
    setClearingCache(true);
    try {
      await storeApi.clearCache(settings);
      setCacheStatus(t('cacheClearedOk', lang));
    } catch {
      setCacheStatus(t('cacheClearedErr', lang));
    } finally {
      setClearingCache(false);
      setTimeout(() => setCacheStatus(null), 2000);
    }
  }

  return (
    <header data-testid="toolbar" className="bg-cw-blue flex items-stretch h-12 xl:h-10 shrink-0 min-w-0">
      {/* Left cluster scrolls when the window is narrower than the buttons */}
      <div className="flex flex-1 min-w-0 items-center overflow-x-auto px-1 gap-0.5">
        <button
          type="button"
          data-testid="explorer-toggle"
          onClick={onToggleExplorer}
          className="xl:hidden flex items-center justify-center w-10 h-10 rounded hover:bg-white/20 text-white shrink-0"
          aria-label={t('explorerTitle', lang)}
        >
          <PanelLeft className="w-4 h-4" />
        </button>

        {/* Logo — shrinks to just "CW" at narrow widths */}
        <span className="text-white font-bold text-sm select-none px-2 shrink-0">
          <span className="hidden lg:inline">Checkware Studio</span>
          <span className="lg:hidden">CW</span>
        </span>

        <div className="w-px h-5 bg-white/30 mx-1 shrink-0" />

        {/* File group */}
        <Btn testId="toolbar-new" icon={<FilePlus className="w-4 h-4" />} label={t('newQuestionnaire', lang)} onClick={onNewQuestionnaire} />
        <Btn icon={<FolderOpen className="w-4 h-4" />} label={t('openFile', lang)} onClick={() => fileInputRef.current?.click()} />
        <Btn icon={<Download className="w-4 h-4" />} label={t('import', lang)} onClick={onImport} />
        <Btn icon={<Save className="w-4 h-4" />} label={t('save', lang)} onClick={onSave} disabled={!activeTab} />
        <Btn icon={<Printer className="w-4 h-4" />} label={lang === 'NO' ? 'Skriv ut / PDF' : 'Print / PDF'} onClick={onPrint} disabled={!activeTab} />
        <Btn icon={<Upload className="w-4 h-4" />} label={t('publish', lang)} onClick={onPublish} disabled={!activeTab} />

        <div className="w-px h-5 bg-white/30 mx-1 shrink-0" />

        {/* Undo/Redo */}
        <Btn icon={<Undo2 className="w-4 h-4" />} label={t('undo', lang)} onClick={() => activeTabId && undo(activeTabId)} disabled={!undoable} />
        <Btn icon={<Redo2 className="w-4 h-4" />} label={t('redo', lang)} onClick={() => activeTabId && redo(activeTabId)} disabled={!redoable} />

        <input ref={fileInputRef} type="file" accept=".questionnaire,.rap,.zip" className="hidden" onChange={handleFileChange} />

        <div className="flex-1 min-w-2" />
      </div>

      {/* Right cluster stays on screen */}
      <div className="flex items-center shrink-0 px-1 gap-0.5">
        {isConnected && (
          <>
            {cacheStatus ? (
              <span className="text-xs text-white/80 px-2 shrink-0 max-w-[8rem] truncate">{cacheStatus}</span>
            ) : (
              <Btn
                icon={<RefreshCw className={`w-4 h-4 ${clearingCache ? 'animate-spin' : ''}`} />}
                label={t('clearCache', lang)}
                onClick={handleClearCache}
                disabled={clearingCache}
              />
            )}
            <div className="w-px h-5 bg-white/30 mx-1 shrink-0" />
          </>
        )}

        <button
          type="button"
          onClick={onToggleLang}
          className="px-2 h-10 xl:h-auto xl:py-1 text-xs font-semibold rounded border border-white/30 text-white hover:bg-white/20 transition-colors select-none shrink-0"
          title={lang === 'NO' ? 'Switch to English' : 'Bytt til norsk'}
        >
          {lang === 'NO' ? 'EN' : 'NO'}
        </button>

        <Btn testId="toolbar-settings" icon={<Settings className="w-4 h-4" />} label={t('settings', lang)} onClick={onOpenSettings} />
        <Btn icon={<LogOut className="w-4 h-4" />} label={t('disconnect', lang)} onClick={disconnect} />
      </div>
    </header>
  );
}
