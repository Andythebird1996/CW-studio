import { useState } from 'react';
import { ChevronDown, ChevronRight, AlertCircle, AlertTriangle } from 'lucide-react';
import type { ValidationIssue } from '../../services/validate-questionnaire';
import { t, tf, countPhrase, useUILang } from '../../i18n';

// ─── Props ────────────────────────────────────────────────────────────────────

interface ValidationNavigatorProps {
  issues: ValidationIssue[];
  onNavigate: (issue: ValidationIssue) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type FilterMode = 'all' | 'errors' | 'warnings';

// ─── Component ────────────────────────────────────────────────────────────────

export function ValidationNavigator({ issues, onNavigate }: ValidationNavigatorProps) {
  const uiLang = useUILang();
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
      ? tf('issuesBoth', uiLang, { errors: errorCount, warnings: warningCount })
      : errorCount > 0
      ? countPhrase(errorCount, uiLang, 'nErrorOne', 'nErrorMany')
      : warningCount > 0
      ? countPhrase(warningCount, uiLang, 'nWarningOne', 'nWarningMany')
      : t('noProblems', uiLang);

  const badgeColor =
    errorCount > 0
      ? 'bg-cw-negative-soft text-cw-negative border-cw-negative/30'
      : warningCount > 0
      ? 'bg-cw-orange-soft text-cw-orange border-cw-orange/40'
      : 'bg-cw-positive-soft text-cw-positive border-cw-positive/30';

  return (
    <div className="border-t border-cw-border bg-white flex flex-col shrink-0">
      {/* Panel header */}
      <div
        className="flex items-center gap-2 px-4 py-2 cursor-pointer hover:bg-cw-gray select-none"
        onClick={() => setCollapsed((c) => !c)}
      >
        {collapsed
          ? <ChevronRight className="w-3.5 h-3.5 text-cw-gray-text shrink-0" />
          : <ChevronDown className="w-3.5 h-3.5 text-cw-gray-text shrink-0" />
        }
        <span className="text-xs font-semibold text-cw-gray-text">{t('validationResults', uiLang)}</span>
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
                    : 'bg-white text-cw-gray-text hover:bg-cw-gray'
                }`}
              >
                {f === 'all' ? t('filterAll', uiLang) : f === 'errors' ? t('filterErrors', uiLang) : t('filterWarnings', uiLang)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Issue list */}
      {!collapsed && (
        <div className="overflow-auto max-h-48 border-t border-cw-border">
          {visibleIssues.length === 0 ? (
            <p className="px-4 py-3 text-xs text-cw-gray-text italic">
              {filter === 'all'
                ? t('noValidationIssues', uiLang)
                : filter === 'errors'
                ? t('noErrors', uiLang)
                : t('noWarnings', uiLang)}
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-cw-gray border-b border-cw-border">
                  <th className="text-left px-3 py-1.5 text-[10px] font-semibold text-cw-gray-text uppercase tracking-wide w-6"></th>
                  <th className="text-left px-3 py-1.5 text-[10px] font-semibold text-cw-gray-text uppercase tracking-wide">{t('colElement', uiLang)}</th>
                  <th className="text-left px-3 py-1.5 text-[10px] font-semibold text-cw-gray-text uppercase tracking-wide">{t('colProblem', uiLang)}</th>
                  <th className="text-left px-3 py-1.5 text-[10px] font-semibold text-cw-gray-text uppercase tracking-wide hidden sm:table-cell">{t('colPath', uiLang)}</th>
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
                        ? 'hover:bg-cw-negative-soft'
                        : 'hover:bg-cw-orange-soft'
                    }`}
                  >
                    {/* Severity icon */}
                    <td className="px-3 py-2 align-top">
                      {issue.severity === 'error' ? (
                        <AlertCircle className="w-3.5 h-3.5 text-cw-negative shrink-0" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-cw-orange shrink-0" />
                      )}
                    </td>
                    {/* Element label */}
                    <td className="px-3 py-2 align-top font-mono font-semibold text-cw-ink whitespace-nowrap">
                      {issue.elementLabel || issue.elementCode || '—'}
                    </td>
                    {/* Message */}
                    <td className="px-3 py-2 align-top text-cw-gray-text">
                      {issue.message}
                    </td>
                    {/* Path */}
                    <td className="px-3 py-2 align-top text-cw-gray-text font-mono text-[10px] hidden sm:table-cell max-w-[180px] truncate">
                      {issue.path}
                    </td>
                    {/* Navigate button */}
                    <td className="px-3 py-2 align-top">
                      <button
                        onClick={() => onNavigate(issue)}
                        className="px-2 py-1 text-[10px] border border-cw-border rounded hover:bg-cw-blue hover:text-white hover:border-cw-blue transition-colors text-cw-gray-text whitespace-nowrap"
                      >
                        {t('goTo', uiLang)}
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
