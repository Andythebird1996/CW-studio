import { X } from 'lucide-react';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { t, useUILang } from '../../i18n';

export function TabBar() {
  const uiLang = useUILang();
  const { tabs, activeTabId, setActiveTab, closeTab } = useWorkspaceStore();

  if (tabs.length === 0) return null;

  return (
    <div className="flex border-b border-cw-border bg-cw-gray overflow-x-auto shrink-0 min-w-0">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={`flex items-center gap-2 px-4 py-2 text-sm cursor-pointer select-none border-r border-cw-border shrink-0 ${
            tab.id === activeTabId
              ? 'bg-white border-b-2 border-b-cw-blue text-cw-blue font-medium'
              : 'text-cw-gray-text hover:bg-white/60'
          }`}
        >
          <span className="max-w-[180px] truncate">
            {tab.isDirty && <span className="mr-1 text-cw-orange">●</span>}
            {tab.title}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              closeTab(tab.id);
            }}
            className="text-cw-gray-text hover:text-cw-ink rounded p-1 xl:p-0.5 hover:bg-cw-gray"
            aria-label={t('closeTab', uiLang)}
            title={t('closeTab', uiLang)}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
