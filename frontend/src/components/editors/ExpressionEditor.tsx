/**
 * Visual show/hide expression builder.
 * Used inside QuestionnaireEditor for sections and questions.
 */
import { PlusCircle, Trash2 } from 'lucide-react';
import type { ShowExpression, HideExpression, SimpleStatement, Question } from '../../types/questionnaire';
import { t, useUILang } from '../../i18n';

type AnyExpression = ShowExpression | HideExpression;

interface Props {
  label: string;
  expression: AnyExpression | undefined;
  questions: Question[];
  onChange: (expr: AnyExpression | undefined) => void;
}

function newStatement(): SimpleStatement {
  return { questionCode: '', operator: 'EQ', value: '' };
}

function StatementRow({
  stmt,
  questions,
  onChange,
  onDelete,
}: {
  stmt: SimpleStatement;
  questions: Question[];
  onChange: (s: SimpleStatement) => void;
  onDelete: () => void;
}) {
  const uiLang = useUILang();

  const operators: Array<{ value: SimpleStatement['operator']; label: string }> = [
    { value: 'EQ',        label: t('opEq', uiLang) },
    { value: 'NEQ',       label: t('opNeq', uiLang) },
    { value: 'GT',        label: t('opGt', uiLang) },
    { value: 'GTE',       label: t('opGte', uiLang) },
    { value: 'LT',        label: t('opLt', uiLang) },
    { value: 'LTE',       label: t('opLte', uiLang) },
    { value: 'HAS_VALUE', label: t('opHasValue', uiLang) },
    { value: 'NO_VALUE',  label: t('opNoValue', uiLang) },
  ];

  const selectedQ = questions.find((q) => q.code === stmt.questionCode);
  const hasOptions =
    selectedQ &&
    (selectedQ.type === 'radiobutton' || selectedQ.type === 'checkbox' || selectedQ.type === 'rank');
  const options =
    hasOptions && 'options' in selectedQ ? selectedQ.options ?? [] : [];

  const noValueNeeded = stmt.operator === 'HAS_VALUE' || stmt.operator === 'NO_VALUE';

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Question */}
      <select
        value={stmt.questionCode}
        onChange={(e) => onChange({ ...stmt, questionCode: e.target.value, value: '' })}
        className="border border-cw-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
      >
        <option value="">{t('selectQuestion', uiLang)}</option>
        {questions.filter((q) => q.type !== 'text' && q.code).map((q) => (
          <option key={q.code} value={q.code}>{q.code}</option>
        ))}
      </select>

      {/* Operator */}
      <select
        value={stmt.operator}
        onChange={(e) => onChange({ ...stmt, operator: e.target.value as SimpleStatement['operator'] })}
        className="border border-cw-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
      >
        {operators.map((op) => (
          <option key={op.value} value={op.value}>{op.label}</option>
        ))}
      </select>

      {/* Value */}
      {!noValueNeeded && (
        hasOptions && options.length > 0 ? (
          <select
            value={stmt.value ?? ''}
            onChange={(e) => onChange({ ...stmt, value: e.target.value })}
            className="border border-cw-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
          >
            <option value="">{t('selectAnswer', uiLang)}</option>
            {(options as Array<{ code: string; texts: Record<string, string> }>).map((o) => (
              <option key={o.code} value={o.code}>
                {Object.values(o.texts)[0] || o.code}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={stmt.value ?? ''}
            onChange={(e) => onChange({ ...stmt, value: e.target.value })}
            placeholder={t('valuePlaceholder', uiLang)}
            className="w-28 border border-cw-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cw-blue-light"
          />
        )
      )}

      <button onClick={onDelete} className="text-gray-300 hover:text-red-500">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function ExpressionEditor({ label, expression, questions, onChange }: Props) {
  const uiLang = useUILang();

  function addStatement() {
    const expr: AnyExpression = expression ?? { statements: [], logic: 'AND' };
    onChange({ ...expr, statements: [...expr.statements, newStatement()] });
  }

  function updateStatement(i: number, stmt: SimpleStatement) {
    if (!expression) return;
    onChange({ ...expression, statements: expression.statements.map((s, idx) => idx === i ? stmt : s) });
  }

  function deleteStatement(i: number) {
    if (!expression) return;
    const remaining = expression.statements.filter((_, idx) => idx !== i);
    onChange(remaining.length === 0 ? undefined : { ...expression, statements: remaining });
  }

  function toggleLogic() {
    if (!expression) return;
    onChange({ ...expression, logic: expression.logic === 'AND' ? 'OR' : 'AND' });
  }

  const hasExpr = expression && expression.statements.length > 0;

  return (
    <div className="border border-cw-border rounded p-3 bg-cw-gray">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-600">{label}</span>
        {hasExpr && (
          <button
            onClick={toggleLogic}
            className="text-xs border border-cw-border bg-white rounded px-2 py-0.5 hover:bg-gray-50"
          >
            {t('logicPrefix', uiLang)} <strong>{expression.logic === 'AND' ? t('logicAnd', uiLang) : t('logicOr', uiLang)}</strong>
          </button>
        )}
      </div>

      <div className="space-y-2">
        {expression?.statements.map((stmt, i) => (
          <StatementRow
            key={i}
            stmt={stmt}
            questions={questions}
            onChange={(s) => updateStatement(i, s)}
            onDelete={() => deleteStatement(i)}
          />
        ))}
      </div>

      <button
        onClick={addStatement}
        className="mt-2 flex items-center gap-1 text-xs text-cw-blue-light hover:underline"
      >
        <PlusCircle className="w-3.5 h-3.5" />
        {t('addCondition', uiLang)}
      </button>
    </div>
  );
}
