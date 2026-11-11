import { PlusCircle, Trash2 } from 'lucide-react';
import type { Questionnaire, RemoteScoring } from '../../types/questionnaire';
import {t,  useUILang } from '../../i18n';

interface Props {
  questionnaire: Questionnaire;
  onChange: (q: Questionnaire) => void;
}

const INPUT = 'w-full border border-cw-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cw-blue/30';

export function RemoteScoringEditor({ questionnaire, onChange }: Props) {
  const uiLang = useUILang();
  const rs = questionnaire.remoteScoring;
  const params = rs?.parameters ?? [];

  function update(patch: Partial<RemoteScoring>) {
    const base: RemoteScoring = { url: rs?.url ?? '', parameters: params, ...patch };
    onChange({ ...questionnaire, remoteScoring: base });
  }

  function addParam() {
    update({ parameters: [...params, { name: '', value: '' }] });
  }

  function updateParam(i: number, field: 'name' | 'value', val: string) {
    update({
      parameters: params.map((p, idx) => idx === i ? { ...p, [field]: val } : p),
    });
  }

  function removeParam(i: number) {
    update({ parameters: params.filter((_, idx) => idx !== i) });
  }

  function clearAll() {
    onChange({ ...questionnaire, remoteScoring: undefined });
  }

  return (
    <div className="bg-white border border-cw-border rounded-lg p-4 space-y-4">
      <p className="text-xs text-cw-gray-text">
        {t('remoteScoringHelp', uiLang)}
      </p>

      {/* URL field */}
      <div>
        <label className="block text-xs font-medium text-cw-gray-text mb-1">
          {t('remoteScoringUrl', uiLang)}
        </label>
        <input
          type="url"
          value={rs?.url ?? ''}
          onChange={(e) => update({ url: e.target.value })}
          placeholder="https://scoring.example.com/api/score"
          className={INPUT}
        />
      </div>

      {/* Parameters table */}
      <div>
        <label className="block text-xs font-medium text-cw-gray-text mb-2">
          {t('parameters', uiLang)}
        </label>

        {params.length > 0 && (
          <div className="border border-cw-border rounded overflow-hidden mb-2">
            <table className="w-full text-xs">
              <thead className="bg-cw-gray border-b border-cw-border">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-cw-gray-text">
                    {t('name', uiLang)}
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-cw-gray-text">
                    {t('value', uiLang)}
                  </th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {params.map((p, i) => (
                  <tr key={i} className="border-t border-cw-border">
                    <td className="px-2 py-1">
                      <input
                        type="text"
                        value={p.name}
                        onChange={(e) => updateParam(i, 'name', e.target.value)}
                        placeholder="PARAM_NAME"
                        className="w-full border border-cw-border rounded px-1.5 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-cw-blue/30"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="text"
                        value={p.value}
                        onChange={(e) => updateParam(i, 'value', e.target.value)}
                        placeholder="value"
                        className="w-full border border-cw-border rounded px-1.5 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-cw-blue/30"
                      />
                    </td>
                    <td className="px-1 py-1 text-center">
                      <button
                        onClick={() => removeParam(i)}
                        className="text-cw-gray-text hover:text-cw-negative p-0.5"
                        title={t('removeRow', uiLang)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <button
          onClick={addParam}
          className="flex items-center gap-1 text-xs text-cw-blue-light hover:underline"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          {t('addParameter', uiLang)}
        </button>
      </div>

      {/* Clear */}
      {rs && (
        <div className="pt-2 border-t border-cw-border">
          <button
            onClick={clearAll}
            className="text-xs text-cw-negative hover:text-cw-negative hover:underline"
          >
            {t('removeRemoteScoring', uiLang)}
          </button>
        </div>
      )}
    </div>
  );
}
