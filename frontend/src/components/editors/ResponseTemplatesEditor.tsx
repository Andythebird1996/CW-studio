import { useState } from 'react';
import { Copy, List, PlusCircle, Trash2 } from 'lucide-react';
import type { Questionnaire, ResponseTemplate, TextOption } from '../../types/questionnaire';
import {t,  useUILang } from '../../i18n';
import { ItemContextMenu } from './ItemContextMenu';
import { SpreadsheetOptionsEditor } from './SpreadsheetOptionsEditor';

interface Props {
  questionnaire: Questionnaire;
  onChange: (q: Questionnaire) => void;
}

function newTemplate(): ResponseTemplate {
  return { code: '', name: '', options: [] };
}

export function ResponseTemplatesEditor({ questionnaire, onChange }: Props) {
  const uiLang = useUILang();
  const templates = questionnaire.responseTemplates?.templates ?? [];
  const [selectedIdx, setSelectedIdx] = useState<number | null>(templates.length > 0 ? 0 : null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; idx: number } | null>(null);

  const languages = questionnaire.supportedLanguages.length > 0
    ? questionnaire.supportedLanguages
    : [questionnaire.defaultLanguage];

  function setTemplates(updated: ResponseTemplate[]) {
    onChange({
      ...questionnaire,
      responseTemplates: { templates: updated },
    });
  }

  function addTemplate() {
    const updated = [...templates, newTemplate()];
    setTemplates(updated);
    setSelectedIdx(updated.length - 1);
  }

  function updateTemplate(i: number, tpl: ResponseTemplate) {
    setTemplates(templates.map((x, idx) => (idx === i ? tpl : x)));
  }

  function deleteTemplate(i: number) {
    const updated = templates.filter((_, idx) => idx !== i);
    setTemplates(updated);
    setSelectedIdx(updated.length > 0 ? Math.min(i, updated.length - 1) : null);
  }

  function dupTemplate(i: number) {
    const src = templates[i];
    const dup: ResponseTemplate = {
      ...src,
      code: src.code ? `${src.code}-kopi` : '',
      options: src.options.map((o) => ({ ...o })),
    };
    const next = [...templates];
    next.splice(i + 1, 0, dup);
    setTemplates(next);
    setSelectedIdx(i + 1);
  }

  const selected = selectedIdx !== null ? templates[selectedIdx] : null;

  const listLabel = t('responseTpls', uiLang);
  const listSubtitle = t('responseTplSubtitle', uiLang);
  const newLabel = t('newTplBtn', uiLang);
  const noTemplatesLabel = t('noTemplatesCreate', uiLang);
  const selectOrCreateLabel = t('selectOrCreateTpl', uiLang);
  const codeLabel = t('code', uiLang);
  const nameLabel = t('name', uiLang);
  const optionsLabel = t('optionsLabel', uiLang);
  const deleteLabel = t('deleteBtn', uiLang);
  const noCodeLabel = t('noCode', uiLang);
  const altCountSuffix = t('optionsWord', uiLang);

  return (
    <div className="flex flex-col md:flex-row h-full overflow-hidden min-w-0 min-h-0">
      {/* Left: template list. Stacks above the form on phones. */}
      <div className="w-full max-h-[40vh] md:max-h-none md:w-60 border-b md:border-b-0 md:border-r border-cw-border flex flex-col bg-cw-gray shrink-0 min-h-0">
        <div className="px-3 py-3 border-b border-cw-border bg-white">
          <h2 className="text-sm font-semibold text-cw-blue">{listLabel}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{listSubtitle}</p>
        </div>
        <div className="flex-1 overflow-auto py-1">
          {templates.map((tpl, i) => (
            <button
              key={i}
              onClick={() => setSelectedIdx(i)}
              onContextMenu={(e) => {
                e.preventDefault();
                setSelectedIdx(i);
                setCtxMenu({ x: e.clientX, y: e.clientY, idx: i });
              }}
              className={`w-full text-left px-3 py-2.5 flex items-center gap-2 border-b border-cw-border/50 hover:bg-white/60 ${
                selectedIdx === i ? 'bg-white border-l-2 border-l-cw-blue' : ''
              }`}
            >
              <List className="w-3.5 h-3.5 shrink-0 text-gray-400" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-mono truncate text-gray-700">
                  {tpl.code || noCodeLabel}
                </div>
                <div className="text-xs text-gray-400 truncate">
                  {tpl.options.length > 0
                    ? `${tpl.options.length} ${altCountSuffix}`
                    : tpl.name || '—'}
                </div>
              </div>
            </button>
          ))}
          {templates.length === 0 && (
            <p className="text-xs text-gray-400 text-center mt-6 px-3">{noTemplatesLabel}</p>
          )}
        </div>
        <div className="p-2 border-t border-cw-border">
          <button
            onClick={addTemplate}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-cw-blue-light hover:bg-white rounded border border-dashed border-cw-blue-light/50"
          >
            <PlusCircle className="w-3.5 h-3.5" /> {newLabel}
          </button>
        </div>
      </div>

      {/* Right: editor for selected template */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0 min-h-0">
        {selected !== null && selectedIdx !== null ? (
          <>
            <div className="bg-white border-b border-cw-border px-5 py-3 flex items-center justify-between shrink-0">
              <h3 className="text-sm font-semibold text-gray-700">
                {selected.code || newLabel}
              </h3>
              <button
                onClick={() => deleteTemplate(selectedIdx)}
                className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" /> {deleteLabel}
              </button>
            </div>
            <div className="flex-1 overflow-auto p-5">
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{codeLabel}</label>
                  <input
                    type="text"
                    value={selected.code}
                    onChange={(e) => updateTemplate(selectedIdx, { ...selected, code: e.target.value })}
                    className="w-full border border-cw-border rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
                    placeholder="LIKERT_5"
                    spellCheck={false}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{nameLabel}</label>
                  <input
                    type="text"
                    value={selected.name}
                    onChange={(e) => updateTemplate(selectedIdx, { ...selected, name: e.target.value })}
                    className="w-full border border-cw-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
                    placeholder={t('likert5', uiLang)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2">{optionsLabel}</label>
                <SpreadsheetOptionsEditor
                  options={selected.options}
                  languages={languages}
                  onChange={(options: TextOption[]) =>
                    updateTemplate(selectedIdx, { ...selected, options })
                  }
                />
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            {selectOrCreateLabel}
          </div>
        )}
      </div>

      {ctxMenu && (
        <ItemContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          items={[
            {
              label: t('duplicate', uiLang),
              icon: <Copy className="w-3.5 h-3.5 text-gray-400" />,
              onClick: () => dupTemplate(ctxMenu.idx),
            },
            { separator: true },
            {
              label: t('deleteBtn', uiLang),
              icon: <Trash2 className="w-3.5 h-3.5" />,
              onClick: () => deleteTemplate(ctxMenu.idx),
              danger: true,
            },
          ]}
        />
      )}
    </div>
  );
}
