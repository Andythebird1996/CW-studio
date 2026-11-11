import { useState } from 'react';
import { ChevronDown, ChevronRight, AlertCircle, AlertTriangle } from 'lucide-react';
import type { ValidationIssue } from '../../services/validate-questionnaire';

// ─── Props ────────────────────────────────────────────────────────────────────

interface ValidationNavigatorProps {
  issues: ValidationIssue[];
  onNavigate: (issue: ValidationIssue) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type FilterMode = 'all' | 'errors' | 'warnings';

// ─── Component ────────────────────────────────────────────────────────────────

export function ValidationNavigator({ issues, onNavigate }: ValidationNavigatorProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [filter, setFilter] = useState<FilterMode>('all');

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');

  const visibleIssues: ValidationIssue[] = (() => {
    if (filter === 'errors') return errors;
    if (filter === 'warnings') return warnings;
    // errors first, then warnings
    return [...errors, ...warnings];
  })();

  const errorCount = errors.length;
  const warningCount = warnings.length;

  const badge =
    errorCount > 0 && warningCount > 0
      ? `${errorCount} feil, ${warningCount} advarsler`
      : errorCount > 0
      ? `${errorCount} feil`
      : warningCount > 0
      ? `${warningCount} advarsler`
      : 'Ingen problemer';

  const badgeColor =
    errorCount > 0
      ? 'bg-red-100 text-red-700 border-red-200'
      : warningCount > 0
      ? 'bg-yellow-100 text-yellow-700 border-yellow-200'
      : 'bg-green-100 text-green-700 border-green-200';

  return (
    <div className="border-t border-cw-border bg-white flex flex-col shrink-0">
      {/* Panel header */}
      <div
        className="flex items-center gap-2 px-4 py-2 cursor-pointer hover:bg-cw-gray select-none"
        onClick={() => setCollapsed((c) => !c)}
      >
        {collapsed
          ? <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          : <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        }
        <span className="text-xs font-semibold text-gray-600">Valideringsresultater</span>
        <span className={`text-[10px] font-medium border rounded px-2 py-0.5 ${badgeColor}`}>
          {badge}
        </span>
        <div className="flex-1" />
        {/* Filter buttons — only visible when expanded */}
        {!collapsed && (
          <div
            className="flex rounded border border-cw-border overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {(['all', 'errors', 'warnings'] as FilterMode[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1 text-[10px] transition-colors ${
                  filter === f
                    ? 'bg-cw-blue text-white'
                    : 'bg-white text-gray-500 hover:bg-gray-50'
                }`}
              >
                {f === 'all' ? 'Alle' : f === 'errors' ? 'Feil' : 'Advarsler'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Issue list */}
      {!collapsed && (
        <div className="overflow-auto max-h-48 border-t border-cw-border">
          {visibleIssues.length === 0 ? (
            <p className="px-4 py-3 text-xs text-gray-400 italic">
              {filter === 'all'
                ? 'Ingen valideringsproblemer funnet.'
                : filter === 'errors'
                ? 'Ingen feil.'
                : 'Ingen advarsler.'}
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-cw-border">
                  <th className="text-left px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide w-6"></th>
                  <th className="text-left px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Element</th>
                  <th className="text-left px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Problem</th>
                  <th className="text-left px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide hidden sm:table-cell">Sti</th>
                  <th className="px-3 py-1.5 w-14"></th>
                </tr>
              </thead>
              <tbody>
                {visibleIssues.map((issue, i) => (
                  <tr
                    key={i}
                    onClick={() => onNavigate(issue)}
                    className={`cursor-pointer border-b border-cw-border last:border-0 ${
                      issue.severity === 'error'
                        ? 'hover:bg-red-50'
                        : 'hover:bg-yellow-50'
                    }`}
                  >
                    {/* Severity icon */}
                    <td className="px-3 py-2 align-top">
                      {issue.severity === 'error' ? (
                        <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
                      )}
                    </td>
                    {/* Element label */}
                    <td className="px-3 py-2 align-top font-mono font-semibold text-gray-700 whitespace-nowrap">
                      {issue.elementLabel || issue.elementCode || '—'}
                    </td>
                    {/* Message */}
                    <td className="px-3 py-2 align-top text-gray-600">
                      {issue.message}
                    </td>
                    {/* Path */}
                    <td className="px-3 py-2 align-top text-gray-400 font-mono text-[10px] hidden sm:table-cell max-w-[180px] truncate">
                      {issue.path}
                    </td>
                    {/* Navigate button */}
                    <td className="px-3 py-2 align-top">
                      <button
                        onClick={() => onNavigate(issue)}
                        className="px-2 py-1 text-[10px] border border-cw-border rounded hover:bg-cw-blue hover:text-white hover:border-cw-blue transition-colors text-gray-500 whitespace-nowrap"
                      >
                        Gå til
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
