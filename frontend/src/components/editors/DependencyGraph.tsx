import { useMemo, useState } from 'react';
import type { Questionnaire } from '../../types/questionnaire';
import { t, useUILang } from '../../i18n';

// ─── Props ────────────────────────────────────────────────────────────────────

interface DependencyGraphProps {
  questionnaire: Questionnaire;
}

// ─── Layout constants ─────────────────────────────────────────────────────────

const BOX_W = 130;
const BOX_H = 32;
const BOX_GAP_Y = 10;
const COL_GAP = 90;
const PAD_X = 16;
const PAD_Y = 16;

// ─── Derived types ────────────────────────────────────────────────────────────

interface GraphNode {
  id: string;
  label: string;
  col: number; // 0 = questions, 1 = calculations, 2 = flags
  row: number;
  x: number;
  y: number;
}

interface GraphEdge {
  id: string;
  from: string;
  to: string;
}

// ─── Helper: flatten all question codes from sections ─────────────────────────

function collectQuestions(questionnaire: Questionnaire): { code: string }[] {
  const result: { code: string }[] = [];
  const queue = [...questionnaire.sections];
  while (queue.length > 0) {
    const sec = queue.shift()!;
    for (const q of sec.questions) {
      if (q.type !== 'text' && q.code) result.push({ code: q.code });
    }
    if (sec.subSections) queue.push(...sec.subSections);
  }
  return result;
}

// ─── Build graph data ─────────────────────────────────────────────────────────

function buildGraph(questionnaire: Questionnaire): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const calcs = questionnaire.calculations?.calculations ?? [];
  const flags = questionnaire.flags ?? [];
  const rawQuestions = collectQuestions(questionnaire);

  const referencedQCodes = new Set<string>(
    calcs.flatMap((c) => c.innerCalculations.map((ic) => ic.questionCode).filter((x): x is string => !!x))
  );

  const questions =
    referencedQCodes.size > 0
      ? rawQuestions.filter((q) => referencedQCodes.has(q.code))
      : rawQuestions.slice(0, 20);

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  questions.forEach((q, row) => {
    nodes.push({ id: `q:${q.code}`, label: q.code, col: 0, row, x: PAD_X, y: PAD_Y + row * (BOX_H + BOX_GAP_Y) });
  });

  calcs.forEach((calc, row) => {
    nodes.push({ id: `c:${calc.code}`, label: calc.code, col: 1, row, x: PAD_X + BOX_W + COL_GAP, y: PAD_Y + row * (BOX_H + BOX_GAP_Y) });
    for (const ic of calc.innerCalculations) {
      if (ic.questionCode) {
        const eid = `q:${ic.questionCode}→c:${calc.code}`;
        edges.push({ id: eid, from: `q:${ic.questionCode}`, to: `c:${calc.code}` });
      }
      if (ic.calculationCode) {
        const eid = `c:${ic.calculationCode}→c:${calc.code}`;
        edges.push({ id: eid, from: `c:${ic.calculationCode}`, to: `c:${calc.code}` });
      }
    }
  });

  flags.forEach((flag, row) => {
    nodes.push({ id: `f:${flag.code}`, label: flag.code, col: 2, row, x: PAD_X + (BOX_W + COL_GAP) * 2, y: PAD_Y + row * (BOX_H + BOX_GAP_Y) });
    for (const cond of flag.conditions) {
      if (cond.calculationCode) {
        const eid = `c:${cond.calculationCode}→f:${flag.code}`;
        edges.push({ id: eid, from: `c:${cond.calculationCode}`, to: `f:${flag.code}` });
      }
    }
  });

  return { nodes, edges };
}

// ─── Compute the full connected thread from a selected node (both directions) ──

function computeThread(selectedId: string, edges: GraphEdge[]): Set<string> {
  const connected = new Set<string>([selectedId]);
  // BFS in both directions until stable
  let changed = true;
  while (changed) {
    changed = false;
    for (const e of edges) {
      if (connected.has(e.from) && !connected.has(e.to)) {
        connected.add(e.to); changed = true;
      }
      if (connected.has(e.to) && !connected.has(e.from)) {
        connected.add(e.from); changed = true;
      }
    }
  }
  return connected;
}

// ─── Column colour palette ─────────────────────────────────────────────────────

const COL_STYLE = [
  { bg: 'var(--color-cw-blue-soft)', border: 'var(--color-cw-blue)', text: 'var(--color-cw-blue)', highlight: 'var(--color-cw-blue)' },
  { bg: 'var(--color-cw-gray)', border: 'var(--color-cw-blue-light)', text: 'var(--color-cw-blue)', highlight: 'var(--color-cw-blue-light)' },
  { bg: 'var(--color-cw-orange-soft)', border: 'var(--color-cw-orange)', text: 'var(--color-cw-orange)', highlight: 'var(--color-cw-orange)' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function DependencyGraph({ questionnaire }: DependencyGraphProps) {
  const uiLang = useUILang();
  const { nodes, edges } = useMemo(() => buildGraph(questionnaire), [questionnaire]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // SVG dimensions
  const colHeights = [0, 1, 2].map((col) => {
    const colNodes = nodes.filter((n) => n.col === col);
    if (colNodes.length === 0) return PAD_Y * 2;
    const last = colNodes[colNodes.length - 1];
    return last.y + BOX_H + PAD_Y;
  });
  const svgH = Math.max(...colHeights, 60);
  const svgW = PAD_X * 2 + BOX_W * 3 + COL_GAP * 2;

  const nodeById = useMemo(() => {
    const m = new Map<string, GraphNode>();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);

  // Thread = all nodes reachable from selection in either direction
  const thread = useMemo(
    () => (selectedId ? computeThread(selectedId, edges) : null),
    [selectedId, edges],
  );

  const hasSelection = thread !== null;

  const calcs = questionnaire.calculations?.calculations ?? [];
  const flags = questionnaire.flags ?? [];
  const isEmpty = nodes.length === 0;

  function handleNodeClick(id: string) {
    setSelectedId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white min-w-0 min-h-0">
      {/* Header */}
      <div className="bg-white border-b border-cw-border px-4 py-3 shrink-0 flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-cw-blue">{t('depGraphTitle', uiLang)}</h2>
          <p className="text-xs text-cw-gray-text mt-0.5">
            {t('depGraphHint', uiLang)}
          </p>
        </div>
        {selectedId && (
          <button
            onClick={() => setSelectedId(null)}
            className="ml-auto text-[10px] border border-cw-border rounded px-2 py-1 text-cw-gray-text hover:bg-cw-gray"
          >
            {t('clearSelection', uiLang)}
          </button>
        )}
      </div>

      {isEmpty ? (
        <div className="flex-1 flex items-center justify-center text-cw-gray-text text-sm">
          {calcs.length === 0 && flags.length === 0
            ? t('noDepsDefined', uiLang)
            : t('noDepsToShow', uiLang)}
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-6 min-w-0" onClick={() => setSelectedId(null)}>
          {/* Column labels */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `${BOX_W}px ${COL_GAP}px ${BOX_W}px ${COL_GAP}px ${BOX_W}px`,
              marginLeft: PAD_X,
              marginBottom: 8,
            }}
            className="text-[10px] font-semibold uppercase tracking-wide"
          >
            <span style={{ color: COL_STYLE[0].highlight }}>{t('questions', uiLang)}</span>
            <span />
            <span style={{ color: COL_STYLE[1].highlight }}>{t('tabCalculations', uiLang)}</span>
            <span />
            <span style={{ color: COL_STYLE[2].highlight }}>{t('flagsHeader', uiLang)}</span>
          </div>

          <svg
            width={svgW}
            height={svgH}
            style={{ display: 'block', overflow: 'visible' }}
            onClick={(e) => e.stopPropagation()}
          >
            <defs>
              <marker id="arrow-dim" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L0,6 L6,3 z" fill="var(--color-cw-border)" />
              </marker>
              <marker id="arrow-active" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L0,6 L6,3 z" fill="var(--color-cw-blue)" />
              </marker>
              <filter id="glow">
                <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="var(--color-cw-blue)" floodOpacity="0.5" />
              </filter>
            </defs>

            {/* Edges — draw dim ones first, then active on top */}
            {edges.map((edge) => {
              const from = nodeById.get(edge.from);
              const to = nodeById.get(edge.to);
              if (!from || !to) return null;
              const isActive = thread ? (thread.has(edge.from) && thread.has(edge.to)) : false;
              const dim = hasSelection && !isActive;
              const x1 = from.x + BOX_W;
              const y1 = from.y + BOX_H / 2;
              const x2 = to.x;
              const y2 = to.y + BOX_H / 2;
              const mx = (x1 + x2) / 2;
              return (
                <path
                  key={edge.id}
                  d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke={dim ? 'var(--color-cw-border)' : isActive ? 'var(--color-cw-blue)' : 'var(--color-cw-border)'}
                  strokeWidth={isActive ? 2.5 : 1.5}
                  strokeDasharray={isActive ? undefined : undefined}
                  opacity={dim ? 0.3 : 1}
                  markerEnd={dim ? 'url(#arrow-dim)' : isActive ? 'url(#arrow-active)' : 'url(#arrow-dim)'}
                  style={{ transition: 'opacity 0.15s, stroke 0.15s' }}
                />
              );
            })}

            {/* Nodes */}
            {nodes.map((node) => {
              const cs = COL_STYLE[node.col];
              const isSelected = node.id === selectedId;
              const inThread = thread ? thread.has(node.id) : false;
              const dim = hasSelection && !inThread;

              return (
                <g
                  key={node.id}
                  style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
                  opacity={dim ? 0.2 : 1}
                  onClick={(e) => { e.stopPropagation(); handleNodeClick(node.id); }}
                >
                  {/* Glow ring for selected node */}
                  {isSelected && (
                    <rect
                      x={node.x - 3}
                      y={node.y - 3}
                      width={BOX_W + 6}
                      height={BOX_H + 6}
                      rx={7}
                      ry={7}
                      fill="none"
                      stroke="var(--color-cw-blue)"
                      strokeWidth={2}
                      opacity={0.5}
                      filter="url(#glow)"
                    />
                  )}
                  <rect
                    x={node.x}
                    y={node.y}
                    width={BOX_W}
                    height={BOX_H}
                    rx={4}
                    ry={4}
                    fill={inThread && !isSelected ? cs.bg : isSelected ? cs.bg : cs.bg}
                    stroke={isSelected ? 'var(--color-cw-blue)' : inThread ? cs.highlight : cs.border}
                    strokeWidth={isSelected ? 2.5 : inThread && hasSelection ? 2 : 1}
                  />
                  <text
                    x={node.x + BOX_W / 2}
                    y={node.y + BOX_H / 2 + 1}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={10}
                    fontFamily="Consolas, 'Courier New', monospace"
                    fontWeight={inThread ? '700' : '600'}
                    fill={isSelected ? 'var(--color-cw-blue)' : cs.text}
                    style={{ userSelect: 'none', pointerEvents: 'none' }}
                  >
                    {node.label.length > 15 ? node.label.slice(0, 14) + '…' : node.label}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Legend */}
          <div className="mt-4 flex items-center gap-4 text-[10px] text-cw-gray-text flex-wrap">
            {COL_STYLE.map((cs, i) => (
              <span key={i} className="flex items-center gap-1.5">
                <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 2, background: cs.bg, border: `1.5px solid ${cs.border}` }} />
                {[t('question', uiLang), t('calculation', uiLang), t('flag', uiLang)][i]}
              </span>
            ))}
            <span className="flex items-center gap-1.5 text-cw-gray-text italic">
              {t('clickNodeChain', uiLang)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
