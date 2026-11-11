/**
 * RAP Report Interpreter
 *
 * Implements the Checkware RAP template language:
 *   [function name(p1,p2)] ... [function_end]
 *   [group("label", visible)] ... [group_end]
 *   [if(CONDITION) {BODY}]
 *   [if(CONDITION)] ... [else] ... [endif]
 *   [CALL fn(arg1, arg2)]
 *   [DIE]
 *   [loop(code)] ... [loop_end] / [/loop]
 *   Q(code), L(code), A(code), CALC(code), NORM(code, value), PERCENTILE(code, value), ZSCORE(code, value), FLAG(code)
 *   EXIST(code), !EXIST(code), GENDER()/KJONN(), NOT(cond)
 *   $SURVEY_NAME, $PATIENT_NAME, $PATIENT_FNAME, $PATIENT_LNAME
 *   $PATIENT_THERAPIST, $PATIENT_ADMIN, $REPORT_NAME
 *   $KJONN, $KJONN_SUBST, $KJONN_GEN, $FODT, $AGE
 *   $CURRENT_DATE, $CURRENT_TIME, $DATE_DELIVERED, $COPYRIGHT
 *   [SESSION_VALUE(n,code)], [SESSION_DIFF(n1,n2,code)], [SESSION_STATUS(n,code)], COUNT_SURVEY(...)
 *   <uc>text</uc>  →  uppercase
 */

import type { Questionnaire } from '../types/questionnaire';

// ─── Public API ────────────────────────────────────────────────────────────

export interface SimAnswer {
  score: number;
  text: string;
}

export interface SimPatient {
  name: string;
  firstName?: string;
  lastName?: string;
  dob: string;   // YYYY-MM-DD or DD.MM.YYYY
  gender: 0 | 1 | 2; // 0 = female, 1 = male, 2 = unknown
  therapist?: string;
  admin?: string;
}

export interface SimContext {
  questionnaire: Questionnaire;
  answers: Map<string, SimAnswer>; // questionCode → answer
  patient: SimPatient;
  reportName?: string;
  /**
   * Previous session answers for SESSION_VALUE / SESSION_DIFF / SESSION_STATUS.
   * Index 0 = session 1, index 1 = session 2, etc. (1-based in RAP, 0-based here).
   * Session number 0 in RAP means "current session" → ctx.answers.
   */
  sessionHistory?: Map<string, SimAnswer>[];
}

// ─── Graph state (reset per interpretation) ────────────────────────────────

interface GraphBand { begin: number; end: number; color: string; }
interface GraphLine { pos: number; color: string; }
interface GraphPlot { seriesName: string; plotType: string; barColor: string; fillColor: string; }
interface GraphDef {
  analysisCode?: string;
  graphType: number; // 1=bar/line, 3=radar
  min: number;
  max: number;
  header: string;
  width: number;
  height: number;
  bands: GraphBand[];
  lines: GraphLine[];
  plots: GraphPlot[];
}

let _graphs = new Map<string, GraphDef>();

function defaultGraph(): GraphDef {
  return { graphType: 1, min: 0, max: 27, header: '', width: 580, height: 220, bands: [], lines: [], plots: [] };
}

export function interpretRap(rapContent: string, ctx: SimContext): string {
  _graphs = new Map();
  try {
    const preprocessed = preprocessDefines(rapContent, ctx);
    const functions = parseFunctions(preprocessed);
    const topLevel = stripFunctionDefs(stripCommentMeta(preprocessed));
    const tokens = tokenize(topLevel);
    const pos = { i: 0 };
    const { output } = executeTokens(tokens, pos, functions, ctx, {});
    return wrapHtml(output, ctx);
  } catch (e) {
    return `<pre style="color:red">RAP interpreter error: ${e}</pre>`;
  }
}

// ─── Types ─────────────────────────────────────────────────────────────────

interface RapFunction {
  params: string[];
  body: string;
}

type Token =
  | { type: 'text'; value: string }
  | { type: 'directive'; value: string };

// ─── Parsing ───────────────────────────────────────────────────────────────

function stripCommentMeta(rap: string): string {
  // Strip /* $key value */ metadata lines (but keep other /* */ comments stripped too)
  return rap.replace(/\/\*[\s\S]*?\*\//g, '');
}

function parseFunctions(rap: string): Map<string, RapFunction> {
  const funcs = new Map<string, RapFunction>();
  const re = /\[function\s+(\w+)\(([^)]*)\)\]([\s\S]*?)\[function_end\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rap)) !== null) {
    const name = m[1];
    const params = m[2]
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    const body = m[3];
    funcs.set(name, { params, body });
  }
  return funcs;
}

function stripFunctionDefs(rap: string): string {
  return rap.replace(/\[function\s+\w+\([^)]*\)\][\s\S]*?\[function_end\]/g, '');
}

// ─── Tokenizer ─────────────────────────────────────────────────────────────

function findMatchingBracket(text: string, start: number): number {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '[') depth++;
    else if (text[i] === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function tokenize(code: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < code.length) {
    if (code[i] === '[') {
      const end = findMatchingBracket(code, i);
      if (end === -1) {
        tokens.push({ type: 'text', value: code[i] });
        i++;
      } else {
        tokens.push({ type: 'directive', value: code.slice(i + 1, end) });
        i = end + 1;
      }
    } else {
      let j = i;
      while (j < code.length && code[j] !== '[') j++;
      tokens.push({ type: 'text', value: code.slice(i, j) });
      i = j;
    }
  }
  return tokens;
}

// ─── Executor ──────────────────────────────────────────────────────────────

function isStop(dir: string, stopAt?: string | string[]): boolean {
  if (!stopAt) return false;
  return Array.isArray(stopAt) ? stopAt.includes(dir) : dir === stopAt;
}

function executeTokens(
  tokens: Token[],
  pos: { i: number },
  funcs: Map<string, RapFunction>,
  ctx: SimContext,
  args: Record<string, string>,
  stopAt?: string | string[],
): { output: string; died: boolean; stoppedAt?: string } {
  let output = '';

  while (pos.i < tokens.length) {
    const token = tokens[pos.i];

    if (token.type === 'text') {
      output += substituteText(token.value, ctx, args);
      pos.i++;
      continue;
    }

    const dir = token.value.trim();

    if (isStop(dir, stopAt)) {
      pos.i++;
      return { output, died: false, stoppedAt: dir };
    }

    if (dir === 'DIE') {
      pos.i++;
      return { output, died: true };
    }

    if (dir.startsWith('CALL ') || dir.startsWith('CALL\t')) {
      pos.i++;
      output += handleCall(dir.slice(5).trim(), funcs, ctx, args);
    } else if (dir.startsWith('if(')) {
      pos.i++;
      const info = parseIfInfo(dir);
      if (info.isInline) {
        // [if(COND){body}] — inline form
        if (evalCondition(info.condition, ctx, args)) {
          const trimmed = info.body.trim();
          if (trimmed.startsWith('CALL ') || trimmed.startsWith('CALL\t')) {
            output += handleCall(trimmed.slice(5).trim(), funcs, ctx, args);
          } else {
            const bodyTokens = tokenize(trimmed);
            const bodyPos = { i: 0 };
            const res = executeTokens(bodyTokens, bodyPos, funcs, ctx, args);
            output += res.output;
            if (res.died) return { output, died: true };
          }
        }
      } else {
        // [if(COND)] ... [else] ... [endif] — multiline form
        const condResult = evalCondition(info.condition, ctx, args);
        const thenRes = executeTokens(tokens, pos, funcs, ctx, args, ['else', 'endif']);
        if (thenRes.died) return { output: output + (condResult ? thenRes.output : ''), died: true };
        if (thenRes.stoppedAt === 'else') {
          const elseRes = executeTokens(tokens, pos, funcs, ctx, args, 'endif');
          if (elseRes.died) return { output: output + (condResult ? thenRes.output : elseRes.output), died: true };
          output += condResult ? thenRes.output : elseRes.output;
        } else {
          // stopped at 'endif', no else branch
          output += condResult ? thenRes.output : '';
        }
      }
    } else if (dir.startsWith('group(')) {
      pos.i++;
      const groupLabel = parseGroupLabel(dir);
      const inner = executeTokens(tokens, pos, funcs, ctx, args, 'group_end');
      output += `<div class="rap-group"><div class="rap-group-title">${groupLabel}</div><div class="rap-group-body">${inner.output}</div></div>`;
      if (inner.died) return { output, died: true };
    } else if (dir === 'group_end' || dir === 'function_end') {
      pos.i++;
    } else if (dir === 'else' || dir === 'endif') {
      console.warn(`[RAP] Unexpected [${dir}] outside if-block`);
      pos.i++;
    } else if (/^LOOP(?:2)?_BEGIN/i.test(dir)) {
      pos.i++;
      output += handleLegacyLoop(dir, tokens, pos, funcs, ctx, args);
    } else if (/^LOOP(?:2)?_END$/i.test(dir)) {
      pos.i++; // unexpected end marker — skip
    } else if (dir.startsWith('loop(') || dir === 'loop') {
      pos.i++;
      output += handleLoop(dir, tokens, pos, funcs, ctx, args);
    } else if (dir.startsWith('while(') || dir === 'while') {
      console.warn(`[RAP] [while] is not yet supported — skipping block`);
      pos.i++;
      executeTokens(tokens, pos, funcs, ctx, args, ['while_end', '/while']);
    } else if (dir === 'loop_end' || dir === '/loop' || dir === 'while_end' || dir === '/while') {
      // unexpected end marker outside of loop — skip
      pos.i++;
    } else if (dir === 'return') {
      pos.i++;
    } else if (/^([\w$][\w$-]*)\s*=\s*eval\(/i.test(dir)) {
      // [$var = eval("expression")] — evaluate and store in args
      const mEval = dir.match(/^([\w$][\w$-]*)\s*=\s*eval\(\s*"?([^")\n]*)"?\s*\)/i);
      if (mEval) {
        const varName = mEval[1].trim();
        const expr = mEval[2].trim();
        const resolved = substituteText(expr, ctx, args);
        const numVal = resolveNumericExpr(resolved, ctx, args);
        args = { ...args, [varName]: String(numVal) };
      }
      pos.i++;
    } else if (/^echo\(/i.test(dir)) {
      // [echo($var, decimals)] — print variable
      const mEcho = dir.match(/^echo\(\s*([\w$][\w$-]*)\s*(?:,\s*(\d+))?\s*\)/i);
      if (mEcho) {
        const val = resolve(mEcho[1].trim(), args);
        const dec = mEcho[2] !== undefined ? parseInt(mEcho[2]) : undefined;
        const num = parseFloat(val);
        output += dec !== undefined && !isNaN(num) ? num.toFixed(dec) : val;
      }
      pos.i++;
    } else if (/^([\w$][\w$-]*)\s*=\s*series\(/i.test(dir)) {
      // [$ser = series((v1,v2),("n1","n2"))] — store series key in args, silently
      const mSer = dir.match(/^([\w$][\w$-]*)\s*=\s*series\(/i);
      if (mSer) args = { ...args, [mSer[1].trim()]: mSer[1].trim() };
      pos.i++;
    } else if (
      dir.startsWith('SET_SURVEY(') || dir.startsWith('SET_SCOPE(') ||
      dir.startsWith('SET_ASSESSMENT(') || dir.startsWith('SET_RESPONDENT(') ||
      /^SURVEY_INFO\(/i.test(dir) || /^SURVEY_EXISTS\(/i.test(dir)
    ) {
      // Server-side context switches and session lookups — silently ignore in simulator
      pos.i++;
    } else if (/^\$?\w+\s*=\s*GRAPH_INIT\(/i.test(dir)) {
      // [$varname = GRAPH_INIT(analysis_code)]
      const m = dir.match(/^(\$?\w+)\s*=\s*GRAPH_INIT\(([^)]*)\)/i);
      if (m) { _graphs.set(m[1].trim(), { ...defaultGraph(), analysisCode: m[2].trim() }); }
      pos.i++;
    } else if (/^GRAPH_CUSTOMIZE\(/i.test(dir)) {
      const m = dir.match(/^GRAPH_CUSTOMIZE\(([^)]*)\)/i);
      if (m) {
        const p = m[1].split(',');
        const name = p[0]?.trim();
        const g = _graphs.get(name) ?? defaultGraph();
        if (p[1]?.trim()) g.graphType = parseInt(p[1].trim()) || 1;
        if (p[2]?.trim()) g.min = parseFloat(p[2].trim()) || 0;
        if (p[3]?.trim()) g.max = parseFloat(p[3].trim()) || 27;
        if (p[4]?.trim()) g.header = p[4].trim().replace(/^["']|["']$/g, '');
        if (p[10]?.trim() && parseFloat(p[10].trim()) > 50) g.width = parseFloat(p[10].trim());
        if (p[11]?.trim() && parseFloat(p[11].trim()) > 50) g.height = parseFloat(p[11].trim());
        _graphs.set(name, g);
      }
      pos.i++;
    } else if (/^GRAPH_PLOT\(/i.test(dir)) {
      const m = dir.match(/^GRAPH_PLOT\(([^)]*)\)/i);
      if (m) {
        const p = m[1].split(',');
        const name = p[0]?.trim();
        const g = _graphs.get(name) ?? defaultGraph();
        g.plots.push({
          plotType: p[1]?.trim() || 'bar',
          seriesName: p[2]?.trim() || '',
          barColor: (p[3] ?? p[4] ?? '').trim().replace(/['"]/g, '') || '#25b8ec',
          fillColor: (p[4] ?? '').trim().replace(/['"]/g, '') || '#d4f0fb',
        });
        _graphs.set(name, g);
      }
      pos.i++;
    } else if (/^GRAPH_PLOT2\(/i.test(dir)) {
      pos.i++; // treated same as GRAPH_PLOT but we ignore for now
    } else if (/^GRAPH_BAND\(/i.test(dir)) {
      const m = dir.match(/^GRAPH_BAND\(([^)]*)\)/i);
      if (m) {
        const p = m[1].split(',');
        const name = p[0]?.trim();
        const g = _graphs.get(name) ?? defaultGraph();
        const begin = parseFloat(p[3]?.trim() || '0');
        const end = parseFloat(p[4]?.trim() || '0');
        const color = (p[5] ?? '').trim().replace(/['"]/g, '') || '#ffeaea';
        if (!isNaN(begin) && !isNaN(end)) g.bands.push({ begin, end, color });
        _graphs.set(name, g);
      }
      pos.i++;
    } else if (/^GRAPH_LINE\(/i.test(dir)) {
      const m = dir.match(/^GRAPH_LINE\(([^)]*)\)/i);
      if (m) {
        const p = m[1].split(',');
        const name = p[0]?.trim();
        const g = _graphs.get(name) ?? defaultGraph();
        const pos2 = parseFloat(p[2]?.trim() || '0');
        const color = (p[3] ?? '').trim().replace(/['"]/g, '') || '#888888';
        if (!isNaN(pos2)) g.lines.push({ pos: pos2, color });
        _graphs.set(name, g);
      }
      pos.i++;
    } else if (/^GRAPH_LEGEND\(/i.test(dir) || /^GRAPH_YAXIS/i.test(dir) || /^GRAPH_COLORS\(/i.test(dir) || /^GRAPH_AREA\(/i.test(dir)) {
      pos.i++; // known but unneeded for basic rendering
    } else if (/^GRAPH_RENDER\(/i.test(dir)) {
      const m = dir.match(/^GRAPH_RENDER\(\s*([^,)]*)/i);
      const name = m?.[1]?.trim() || '';
      const g = _graphs.get(name);
      output += g ? renderGraphSvg(g, ctx) : `<div style="border:1px dashed #aaa;background:#f8f8f8;padding:16px;margin:8px 0;color:#888;font-size:9pt;text-align:center;">[Graf: ${name}]</div>`;
      pos.i++;
    } else if (/^PLOT_GRAPH\(/i.test(dir)) {
      // Legacy graph format: [PLOT_GRAPH(name, calc_code, ...)]
      const m = dir.match(/^PLOT_GRAPH\(([^,)]+),\s*([^,)]+)/i);
      if (m) {
        const name = m[1].trim();
        const calcCode = m[2].trim();
        const g = _graphs.get(name) ?? defaultGraph();
        g.analysisCode = calcCode;
        output += renderGraphSvg(g, ctx);
      }
      pos.i++;
    } else if (
      dir.startsWith('diagram(') || dir.startsWith('DIAGRAM(') ||
      dir.startsWith('tabular_diagram(') || dir.startsWith('TABULAR_DIAGRAM(') ||
      dir.startsWith('painchart(') || dir.startsWith('PAINCHART(') ||
      dir.startsWith('bar_chart(') || dir.startsWith('line_chart(') ||
      dir.startsWith('pie_chart(') || dir.startsWith('spider_chart(')
    ) {
      const diagramType = dir.slice(0, dir.indexOf('(')).toLowerCase().replace(/_/g, ' ');
      output += `<div style="border:1px dashed #aaa;background:#f8f8f8;padding:16px;margin:8px 0;color:#888;font-size:9pt;text-align:center;">[${diagramType}]</div>`;
      pos.i++;
    } else {
      // Attempt inline substitution — handles [CALC()], [A()], [L()], [SUM()], etc.
      const substituted = substituteText(dir, ctx, args);
      if (substituted !== dir) {
        output += substituted;
      } else {
        console.warn(`[RAP] Unknown directive: [${dir}]`);
      }
      pos.i++;
    }
  }

  return { output, died: false };
}

// ─── Directive handlers ────────────────────────────────────────────────────

function parseGroupLabel(dir: string): string {
  const m = dir.match(/group\(\s*["']([^"']*)["']/);
  return m ? m[1] : '';
}

function handleCall(
  callExpr: string,
  funcs: Map<string, RapFunction>,
  ctx: SimContext,
  args: Record<string, string>,
): string {
  const m = callExpr.match(/^(\w+)\(([^)]*)\)$/);
  if (!m) return '';

  const name = m[1];
  const callArgStrs = m[2]
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean);

  const func = funcs.get(name);
  if (!func) {
    console.warn(`[RAP] CALL to unknown function: ${name}`);
    return `<!-- RAP: unknown function "${name}" -->`;
  }

  const newArgs: Record<string, string> = { ...args };
  func.params.forEach((param, idx) => {
    const raw = callArgStrs[idx] ?? '';
    // If arg is a known param name in current scope, resolve it; otherwise use as literal
    newArgs[param] = args[raw] ?? raw;
  });

  const tokens = tokenize(stripCommentMeta(func.body));
  const pos = { i: 0 };
  const { output } = executeTokens(tokens, pos, funcs, ctx, newArgs);
  return output;
}

/**
 * Handle [loop(arg)] ... [loop_end] / [/loop]
 * Supports:
 *   [loop(N)]          — repeat body N times (numeric literal)
 *   [loop(sectionCode)] — iterate over questions that have answers in that section
 *   [loop(questionCode)] — iterate over questions with prefix match
 * Inside the body, $LOOP_INDEX (0-based), $LOOP_N (total), $LOOP_CODE are available.
 */
function handleLoop(
  dir: string,
  tokens: Token[],
  pos: { i: number },
  funcs: Map<string, RapFunction>,
  ctx: SimContext,
  args: Record<string, string>,
): string {
  const LOOP_END = ['loop_end', '/loop'];

  // Collect body tokens up to loop end
  const bodyTokens: Token[] = [];
  let depth = 1;
  while (pos.i < tokens.length) {
    const t = tokens[pos.i];
    if (t.type === 'directive') {
      const d = t.value.trim();
      if (d.startsWith('loop(') || d === 'loop') depth++;
      else if (LOOP_END.includes(d)) {
        depth--;
        if (depth === 0) { pos.i++; break; }
      }
    }
    bodyTokens.push(t);
    pos.i++;
  }

  // Parse loop argument
  const argMatch = dir.match(/^loop\(\s*([^)]*)\s*\)$/i);
  const loopArg = argMatch ? argMatch[1].trim() : '';

  // Build iteration codes
  let codes: string[] = [];

  const numericCount = loopArg !== '' && /^\d+$/.test(loopArg) ? Number(loopArg) : -1;
  if (numericCount >= 0) {
    codes = Array.from({ length: numericCount }, (_, i) => String(i));
  } else if (loopArg) {
    const resolvedArg = resolve(loopArg, args);
    // Collect question codes in section with that code, or matching prefix
    const allSections = flattenSections(ctx.questionnaire.sections);
    const targetSection = allSections.find((s) => s.code === resolvedArg);
    if (targetSection) {
      codes = targetSection.questions.map((q) => q.code).filter((c) => ctx.answers.has(c));
    } else {
      // Fall back to matching answer codes with given prefix
      codes = [...ctx.answers.keys()].filter((k) => k.startsWith(resolvedArg));
    }
    if (codes.length === 0) return ''; // nothing to loop over
  } else {
    return ''; // no argument — skip
  }

  let output = '';
  for (let idx = 0; idx < codes.length; idx++) {
    const loopArgs: Record<string, string> = {
      ...args,
      LOOP_INDEX: String(idx),
      LOOP_N: String(codes.length),
      LOOP_CODE: codes[idx],
    };
    const bodyPos = { i: 0 };
    const res = executeTokens([...bodyTokens], bodyPos, funcs, ctx, loopArgs);
    output += res.output;
    if (res.died) break;
  }
  return output;
}

/** Parse an `if(...)` directive into condition + body. Returns isInline=false for multiline form. */
function parseIfInfo(dir: string): { isInline: boolean; condition: string; body: string } {
  // Find closing ) of if(...) — must handle nested ()
  let depth = 1;
  let condEnd = 3;
  for (let i = 3; i < dir.length; i++) {
    if (dir[i] === '(') depth++;
    else if (dir[i] === ')') {
      depth--;
      if (depth === 0) { condEnd = i; break; }
    }
  }

  const condition = dir.slice(3, condEnd);
  const rest = dir.slice(condEnd + 1).trim();

  if (rest === '') {
    // Multiline form: [if(COND)] ... [else] ... [endif]
    return { isInline: false, condition, body: '' };
  }

  const body = rest.startsWith('{') && rest.endsWith('}') ? rest.slice(1, -1) : rest;
  return { isInline: true, condition, body };
}

// ─── Condition evaluator ───────────────────────────────────────────────────

/** Splits a condition by a logical operator, respecting nested parentheses. */
function splitLogical(cond: string, op: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let last = 0;
  for (let i = 0; i <= cond.length - op.length; i++) {
    if (cond[i] === '(') depth++;
    else if (cond[i] === ')') depth--;
    else if (depth === 0 && cond.slice(i, i + op.length) === op) {
      parts.push(cond.slice(last, i));
      last = i + op.length;
      i += op.length - 1;
    }
  }
  parts.push(cond.slice(last));
  return parts.length > 1 ? parts : [];
}

function evalCondition(
  cond: string,
  ctx: SimContext,
  args: Record<string, string>,
): boolean {
  cond = cond.trim();

  // NOT(cond)
  if (cond.startsWith('NOT(') && cond.endsWith(')')) {
    return !evalCondition(cond.slice(4, -1), ctx, args);
  }
  // Paren-aware AND / OR
  const andParts = splitLogical(cond, '&&');
  if (andParts.length) return andParts.every((c) => evalCondition(c.trim(), ctx, args));
  const orParts = splitLogical(cond, '||');
  if (orParts.length) return orParts.some((c) => evalCondition(c.trim(), ctx, args));

  // !EXIST(code)
  if (cond.startsWith('!EXIST(')) {
    const code = resolve(cond.slice(7, -1).trim(), args);
    return !ctx.answers.has(code);
  }
  // EXIST(code)
  if (cond.startsWith('EXIST(')) {
    const code = resolve(cond.slice(6, -1).trim(), args);
    return ctx.answers.has(code);
  }
  // GENDER() / KJONN() comparison
  if (cond.startsWith('GENDER()') || cond.startsWith('KJONN()')) {
    const m = cond.match(/(?:GENDER|KJONN)\(\)\s*([=!<>]+)\s*(\d+)/);
    if (!m) return false;
    return compareNums(ctx.patient.gender, m[1], Number(m[2]));
  }
  // CALC(code) op value
  const calcMatch = cond.match(/^CALC\(([\w-]+)\)\s*([=!<>]+)\s*(-?\d+(?:\.\d+)?)$/);
  if (calcMatch) {
    const val = computeCalc(resolve(calcMatch[1], args), ctx);
    return compareNums(val, calcMatch[2], Number(calcMatch[3]));
  }
  // PERCENTILE(normCode, value) op threshold
  const pctMatch = cond.match(/^PERCENTILE\(([\w-]+)\s*,\s*([^)]+)\)\s*([=!<>]+)\s*(-?\d+(?:\.\d+)?)$/);
  if (pctMatch) {
    const val = lookupNorm(pctMatch[1], parseFloat(pctMatch[2]), ctx);
    return compareNums(val, pctMatch[3], Number(pctMatch[4]));
  }
  // ZSCORE(normCode, value) op threshold
  const zsMatch = cond.match(/^ZSCORE\(([\w-]+)\s*,\s*([^)]+)\)\s*([=!<>]+)\s*(-?\d+(?:\.\d+)?)$/);
  if (zsMatch) {
    const val = computeZscore(zsMatch[1], parseFloat(zsMatch[2]), ctx);
    return compareNums(val, zsMatch[3], Number(zsMatch[4]));
  }
  // A(code) op value
  const aMatch = cond.match(/^A\(([\w-]+)\)\s*([=!<>]+)\s*(-?\d+(?:\.\d+)?)$/);
  if (aMatch) {
    const code = resolve(aMatch[1], args);
    const answer = ctx.answers.get(code);
    if (!answer) return false;
    return compareNums(answer.score, aMatch[2], Number(aMatch[3]));
  }
  // SUM(q1,q2,...) op value
  const sumMatch = cond.match(/^SUM\(([^)]+)\)\s*([=!<>]+)\s*(-?\d+(?:\.\d+)?)$/i);
  if (sumMatch) {
    const codes = sumMatch[1].split(',').map((c) => resolve(c.trim(), args));
    const sum = codes.reduce((acc, code) => acc + (ctx.answers.get(code)?.score ?? 0), 0);
    return compareNums(sum, sumMatch[2], Number(sumMatch[3]));
  }
  // COUNTEXIST(q1,q2,...) op value
  const cexMatch = cond.match(/^COUNTEXIST\(([^)]+)\)\s*([=!<>]+)\s*(-?\d+(?:\.\d+)?)$/i);
  if (cexMatch) {
    const codes = cexMatch[1].split(',').map((c) => resolve(c.trim(), args));
    const count = codes.filter((code) => ctx.answers.has(code)).length;
    return compareNums(count, cexMatch[2], Number(cexMatch[3]));
  }
  // SUBTR(a,b) op value
  const subtrMatch = cond.match(/^SUBTR\(([^,)]+),([^)]+)\)\s*([=!<>]+)\s*(-?\d+(?:\.\d+)?)$/i);
  if (subtrMatch) {
    const a = resolveNumericExpr(subtrMatch[1].trim(), ctx, args);
    const b = resolveNumericExpr(subtrMatch[2].trim(), ctx, args);
    return compareNums(a - b, subtrMatch[3], Number(subtrMatch[4]));
  }
  // DIFF(a,b) op value  (absolute difference)
  const diffMatch = cond.match(/^DIFF\(([^,)]+),([^)]+)\)\s*([=!<>]+)\s*(-?\d+(?:\.\d+)?)$/i);
  if (diffMatch) {
    const a = resolveNumericExpr(diffMatch[1].trim(), ctx, args);
    const b = resolveNumericExpr(diffMatch[2].trim(), ctx, args);
    return compareNums(Math.abs(a - b), diffMatch[3], Number(diffMatch[4]));
  }
  // FLAG(code) — boolean flag evaluation
  if (cond.startsWith('FLAG(') && cond.endsWith(')')) {
    return evaluateFlag(resolve(cond.slice(5, -1).trim(), args), ctx);
  }

  return false;
}

function compareNums(a: number, op: string, b: number): boolean {
  switch (op) {
    case '=':
    case '==':
    case 'EQ':
      return a === b;
    case '!=':
    case 'NEQ':
      return a !== b;
    case '<':
    case 'LT':
      return a < b;
    case '<=':
    case 'LTE':
      return a <= b;
    case '>':
    case 'GT':
      return a > b;
    case '>=':
    case 'GTE':
      return a >= b;
    default:
      return false;
  }
}

function resolve(name: string, args: Record<string, string>): string {
  return args[name] ?? name;
}

/** Evaluate a numeric expression: CALC(code), A(code), arithmetic, or a literal number. */
function resolveNumericExpr(expr: string, ctx: SimContext, args: Record<string, string>): number {
  expr = expr.trim();
  // Replace all CALC(code), A(code), $VAR, bare var references with their numeric values
  let subst = expr;
  subst = subst.replace(/CALC\(([\w-]+)\)/gi, (_, c) => String(computeCalc(resolve(c, args), ctx)));
  subst = subst.replace(/A\(([\w-]+)\)/gi, (_, c) => String(ctx.answers.get(resolve(c, args))?.score ?? 0));
  subst = subst.replace(/\$([\w-]+)/g, (_, v) => args['$' + v] ?? args[v] ?? '0');
  // Try safe arithmetic evaluation (only numbers and operators)
  if (/^[\d\s+\-*/().]+$/.test(subst)) {
    try { return Function('"use strict"; return (' + subst + ')')() as number; } catch { /* fall through */ }
  }
  return parseFloat(resolve(expr, args)) || 0;
}

/** Pre-process [DEFINE $VAR, "val"] and [IF(cond) DEFINE $VAR, "a":"b"] directives. */
function preprocessDefines(rap: string, ctx: SimContext): string {
  const defines = new Map<string, string>();
  const lines = rap.split('\n');
  const out: string[] = [];

  for (const line of lines) {
    const t = line.trim();
    // [DEFINE $VAR, "value"]
    const m1 = t.match(/^\[DEFINE\s+(\$\w+)\s*,\s*"([^"]*)"\]$/i);
    if (m1) { defines.set(m1[1], m1[2]); continue; }
    // [IF(cond) DEFINE $VAR, "trueVal":"falseVal"]
    const m2 = t.match(/^\[IF\s*\((.+?)\)\s+DEFINE\s+(\$\w+)\s*,\s*"([^"]*)"\s*:\s*"([^"]*)"\]$/i);
    if (m2) {
      defines.set(m2[2], evalCondition(m2[1], ctx, {}) ? m2[3] : m2[4]);
      continue;
    }
    // [IF(cond) DEFINE $VAR, "trueVal"]
    const m3 = t.match(/^\[IF\s*\((.+?)\)\s+DEFINE\s+(\$\w+)\s*,\s*"([^"]*)"\]$/i);
    if (m3) {
      if (evalCondition(m3[1], ctx, {})) defines.set(m3[2], m3[3]);
      continue;
    }
    out.push(line);
  }

  if (defines.size === 0) return rap;
  let result = out.join('\n');
  // Apply longest names first to avoid partial replacements
  const sorted = [...defines.entries()].sort((a, b) => b[0].length - a[0].length);
  for (const [varName, value] of sorted) {
    result = result.split(varName).join(value);
  }
  return result;
}

/** Handle PHP-style [LOOP_BEGIN $VAR($VAR;start;stop;step;cond)] ... [LOOP_END] */
function handleLegacyLoop(
  dir: string,
  tokens: Token[],
  pos: { i: number },
  funcs: Map<string, RapFunction>,
  ctx: SimContext,
  args: Record<string, string>,
): string {
  const LOOP_END_RE = /^LOOP(?:2)?_END$/i;
  const LOOP_BEGIN_RE = /^LOOP(?:2)?_BEGIN/i;

  // Collect body tokens up to LOOP_END
  const bodyTokens: Token[] = [];
  let depth = 1;
  while (pos.i < tokens.length) {
    const tok = tokens[pos.i];
    if (tok.type === 'directive') {
      const d = tok.value.trim();
      if (LOOP_BEGIN_RE.test(d)) depth++;
      else if (LOOP_END_RE.test(d)) { depth--; if (depth === 0) { pos.i++; break; } }
    }
    bodyTokens.push(tok);
    pos.i++;
  }

  // Parse header: LOOP_BEGIN $VAR(...) or LOOP_BEGIN(...)
  const headerM = dir.match(/^LOOP(?:2)?_BEGIN\s*(\$\w+)?\s*\(([^)]*)\)/i);
  if (!headerM) return '';
  const rawParams = headerM[2].split(';').map((s) => s.trim());
  const varName = (headerM[1] ?? rawParams[0] ?? '').trim();

  // 5th param may be a condition — if it contains SURVEY_EXISTS/server-only functions, skip loop
  const condParam = rawParams[4]?.trim() ?? '';
  const hasServerCondition = /SURVEY_EXISTS|SURVEY_INFO|SET_SURVEY/i.test(condParam);
  if (hasServerCondition) return ''; // no historical data in simulator

  // Build iteration values
  let iterations: string[] = [];
  if (rawParams.length >= 4) {
    // Sequence: var; start; stop; increment[; condition]
    const start = parseFloat(rawParams[1]);
    const stop  = parseFloat(rawParams[2]);
    const incr  = Math.abs(parseFloat(rawParams[3])) || 1;
    if (!isNaN(start) && !isNaN(stop)) {
      if (start <= stop) { for (let n = start; n <= stop; n += incr) iterations.push(String(n)); }
      else               { for (let n = start; n >= stop; n -= incr) iterations.push(String(n)); }
    }
  } else if (rawParams.length >= 2) {
    // Group: var; {item1,item2,...}[; condition]
    const grp = rawParams[1].replace(/^\{|\}$/g, '');
    if (grp) iterations = grp.split(',').map((s) => s.trim());
  }

  let output = '';
  for (const val of iterations) {
    const subTokens = varName
      ? bodyTokens.map((t) => ({ ...t, value: t.value.split(varName).join(val) }))
      : bodyTokens;
    const bPos = { i: 0 };
    const res = executeTokens([...subTokens], bPos, funcs, ctx, args);
    output += res.output;
    if (res.died) break;
  }
  return output;
}

// ─── Calculation helpers ────────────────────────────────────────────────────

function computeCalc(code: string, ctx: SimContext): number {
  const calc = ctx.questionnaire.calculations?.calculations.find((c) => c.code === code);
  if (!calc) return 0;
  const scores = calc.innerCalculations
    .map((ic) => {
      const ans = ctx.answers.get(ic.questionCode ?? '');
      if (ans == null) return NaN;
      return ans.score * (ic.multiplier ?? 1);
    })
    .filter((s) => !isNaN(s));
  switch (calc.type) {
    case 'SUM':   return scores.reduce((a, b) => a + b, 0);
    case 'MEAN':  return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    case 'COUNT': return scores.length;
    default:      return 0;
  }
}

function lookupNorm(normCode: string, value: number, ctx: SimContext): number {
  const norm = ctx.questionnaire.calculations?.norms.find((n) => n.code === normCode);
  if (!norm || !norm.data.length) return 0;
  const sorted = [...norm.data].sort((a, b) => a.score - b.score);
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].score <= value) return sorted[i].normValue;
  }
  return sorted[0].normValue;
}

function computeZscore(normCode: string, value: number, ctx: SimContext): number {
  const norm = ctx.questionnaire.calculations?.norms.find((n) => n.code === normCode);
  if (!norm || norm.type !== 'ZSCORE' || !norm.data.length) return 0;
  // ZSCORE norms: data[0].score = mean, data[0].normValue = stdDev
  const mean = norm.data[0].score;
  const sd = norm.data[0].normValue;
  if (sd === 0) return 0;
  return Math.round(((value - mean) / sd) * 100) / 100;
}

function evaluateFlag(code: string, ctx: SimContext): boolean {
  const flag = ctx.questionnaire.flags?.find((f) => f.code === code);
  if (!flag) return false;
  if (!flag.conditions.length) return false;
  const results = flag.conditions.map((fc) =>
    compareNums(computeCalc(fc.calculationCode, ctx), fc.operator, fc.threshold),
  );
  return flag.logic === 'AND' ? results.every(Boolean) : results.some(Boolean);
}

// ─── Text substitution ─────────────────────────────────────────────────────

function substituteText(
  text: string,
  ctx: SimContext,
  args: Record<string, string>,
): string {
  const lang = ctx.questionnaire.defaultLanguage;

  // Inline Q(code), L(code), A(code) — not wrapped in [...]
  text = text.replace(/\bQ\(([\w-]+)\)/g, (_, code) => {
    return getQuestionText(resolve(code, args), ctx);
  });
  text = text.replace(/\bL\(([\w-]+)\)/g, (_, code) => {
    return getAnswerLabel(resolve(code, args), ctx);
  });
  text = text.replace(/\bA\(([\w-]+)\)/g, (_, code) => {
    const ans = ctx.answers.get(resolve(code, args));
    return ans != null ? String(ans.score) : '';
  });

  // Inline CALC(code[, decimals]), NORM, FLAG, SUM, COUNTEXIST, SUBTR, DIFF, DIM_T, LOOKUP
  text = text.replace(/\bCALC\(([\w-]+)(?:\s*,\s*(\d+))?\)/g, (_, code, dec) => {
    const val = computeCalc(resolve(code, args), ctx);
    return dec !== undefined ? val.toFixed(parseInt(dec, 10)) : String(val);
  });
  text = text.replace(/\bSUM\(([^)]+)\)/gi, (_, argsStr) => {
    const codes = argsStr.split(',').map((c: string) => resolve(c.trim(), args));
    return String(codes.reduce((acc: number, c: string) => acc + (ctx.answers.get(c)?.score ?? 0), 0));
  });
  text = text.replace(/\bCOUNTEXIST\(([^)]+)\)/gi, (_, argsStr) => {
    const codes = argsStr.split(',').map((c: string) => resolve(c.trim(), args));
    return String(codes.filter((c: string) => ctx.answers.has(c)).length);
  });
  text = text.replace(/\bSUBTR\(([^,)]+),([^)]+)\)/gi, (_, a, b) => {
    return String(resolveNumericExpr(a.trim(), ctx, args) - resolveNumericExpr(b.trim(), ctx, args));
  });
  text = text.replace(/\bDIFF\(([^,)]+),([^)]+)\)/gi, (_, a, b) => {
    return String(Math.abs(resolveNumericExpr(a.trim(), ctx, args) - resolveNumericExpr(b.trim(), ctx, args)));
  });
  // DIM_T(calcCode, normCode[, type]) → T-score = round(50 + 10 * zscore)
  text = text.replace(/\bDIM_T\(([\w-]+)\s*,\s*([\w-]+)(?:\s*,\s*[\w-]+)?\)/gi, (_, calcCode, normCode) => {
    const val = computeCalc(resolve(calcCode, args), ctx);
    return String(Math.round(50 + 10 * computeZscore(normCode, val, ctx)));
  });
  // LOOKUP(value, dimCode, normCode) → percentile lookup (dimCode ignored in web context)
  text = text.replace(/\bLOOKUP\(([^,)]+)\s*,\s*[\w-]+\s*,\s*([\w-]+)\)/gi, (_, valExpr, normCode) => {
    const value = resolveNumericExpr(valExpr.trim(), ctx, args);
    return String(lookupNorm(normCode, value, ctx));
  });
  text = text.replace(/\bNORM\(([\w-]+)\s*,\s*([^)]+)\)/g, (_, normCode, valueExpr) => {
    const value = parseFloat(valueExpr.trim());
    return isNaN(value) ? '' : String(lookupNorm(normCode, value, ctx));
  });
  text = text.replace(/\bPERCENTILE\(([\w-]+)\s*,\s*([^)]+)\)/g, (_, normCode, valueExpr) => {
    const value = parseFloat(valueExpr.trim());
    return isNaN(value) ? '' : String(lookupNorm(normCode, value, ctx));
  });
  text = text.replace(/\bZSCORE\(([\w-]+)\s*,\s*([^)]+)\)/g, (_, normCode, valueExpr) => {
    const value = parseFloat(valueExpr.trim());
    return isNaN(value) ? '' : String(computeZscore(normCode, value, ctx));
  });
  text = text.replace(/\bFLAG\(([\w-]+)\)/g, (_, code) => {
    return evaluateFlag(resolve(code, args), ctx) ? '1' : '0';
  });

  // System variables
  const now = new Date();
  const dateStr = now.toLocaleDateString('nb-NO', { day: '2-digit', month: '2-digit', year: '2-digit' });
  const timeStr = now.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });

  // Norwegian gender pronouns — matching PHP report engine semantics exactly
  // gender 0=female, 1=male, 2=unknown (falls back to female pronouns per PHP reference)
  const g = ctx.patient.gender;
  const kjonnNom   = g === 1 ? 'han'     : g === 2 ? 'ukjent'  : 'hun';
  const kjonnSubst = g === 1 ? 'mann'    : g === 2 ? 'ukjent'  : 'kvinne';
  const kjonnGen   = g === 1 ? 'hans'    : g === 2 ? 'ukjent'  : 'hennes';
  const kjonnAkk   = g === 1 ? 'ham'     : g === 2 ? 'ukjent'  : 'henne';
  const kjonnFler  = g === 1 ? 'menn'    : g === 2 ? 'ukjente' : 'kvinner';
  const kjonnNum   = String(g);                                          // $GENDER (legacy)

  const firstName = ctx.patient.firstName ?? ctx.patient.name.split(' ')[0] ?? '';
  const lastName  = ctx.patient.lastName  ?? ctx.patient.name.split(' ').slice(1).join(' ') ?? '';

  text = text
    .replace(/\$SURVEY_NAME/g,           ctx.questionnaire.name[lang] ?? ctx.questionnaire.code)
    .replace(/\$REPORT_NAME/g,           ctx.reportName ?? ctx.questionnaire.name[lang] ?? ctx.questionnaire.code)
    .replace(/\$PATIENT_NAME/g,          ctx.patient.name || '(pasient)')
    .replace(/\$PATIENT_FIRSTNAME/g,     firstName || ctx.patient.name || '(fornavn)')  // PHP alias
    .replace(/\$PATIENT_FNAME/g,         firstName || ctx.patient.name || '(fornavn)')
    .replace(/\$PATIENT_SURNAME/g,       lastName || '(etternavn)')                     // PHP alias
    .replace(/\$PATIENT_LNAME/g,         lastName || '(etternavn)')
    .replace(/\$PATIENT_THERAPIST/g,     ctx.patient.therapist || '(terapeut)')
    .replace(/\$PATIENT_ADMIN/g,         ctx.patient.admin || '(administrator)')
    .replace(/\$PATIENT_USERNAME_LABEL/g,'Brukernavn')
    .replace(/\$PATIENT_USERNAME/g,      ctx.patient.name || '(pasient)')
    .replace(/\$CURRENT_USER/g,          '(kliniker)')
    .replace(/\$FODT/g,                  formatDobDisplay(ctx.patient.dob) || ctx.patient.dob || '(ukjent)')
    // Gender — longer variants before $KJONN to prevent partial matches
    .replace(/\$KJONN_SUBST/g,           kjonnSubst)
    .replace(/\$KJONN_GEN/g,             kjonnGen)
    .replace(/\$KJONN_AKK/g,             kjonnAkk)
    .replace(/\$KJONN_FLER/g,            kjonnFler)
    .replace(/\$KJONN/g,                 kjonnNom)   // must come after all $KJONN_* variants
    .replace(/\$GENDER_TEXT/g,           g === 1 ? 'Mann' : g === 2 ? 'Ukjent' : 'Kvinne') // legacy
    .replace(/\$GENDER/g,                kjonnNum)                                      // legacy
    .replace(/\$ALDER/g,                 calculateAge(ctx.patient.dob))  // Norwegian alias
    .replace(/\$AGE/g,                   calculateAge(ctx.patient.dob))
    .replace(/\$DATE_DELIVERED/g,        dateStr)
    .replace(/\$CURRENT_DATE/g,          dateStr)
    .replace(/\$CURRENT_TIME/g,          timeStr)
    .replace(/\$COPYRIGHT/g,             `\u00a9 ${now.getFullYear()} Checkware`);

  // SESSION_VALUE(sessionNr, calcCode) — with or without surrounding brackets
  // (brackets present in text-tokens; stripped by tokenizer in directive-tokens)
  text = text.replace(/\[?SESSION_VALUE\(\s*([^,)]+)\s*,\s*([^)]+)\)\]?/gi, (_, sNrRaw, codeRaw) => {
    const sNr = parseInt(sNrRaw.trim(), 10);
    const sessionAnswers = sNr === 0 ? ctx.answers : ctx.sessionHistory?.[sNr - 1];
    if (!sessionAnswers) return '(Ukjent)';
    return String(computeCalc(resolve(codeRaw.trim(), args), { ...ctx, answers: sessionAnswers }));
  });

  // SESSION_DIFF(sessionNr1, sessionNr2, calcCode) — with or without surrounding brackets
  text = text.replace(/\[?SESSION_DIFF\(\s*([^,)]+)\s*,\s*([^,)]+)\s*,\s*([^)]+)\)\]?/gi, (_, sNr1Raw, sNr2Raw, codeRaw) => {
    const sNr1 = parseInt(sNr1Raw.trim(), 10);
    const sNr2 = parseInt(sNr2Raw.trim(), 10);
    const answers1 = sNr1 === 0 ? ctx.answers : ctx.sessionHistory?.[sNr1 - 1];
    const answers2 = sNr2 === 0 ? ctx.answers : ctx.sessionHistory?.[sNr2 - 1];
    if (!answers1 || !answers2) return '(Ukjent)';
    const code = resolve(codeRaw.trim(), args);
    const v1 = computeCalc(code, { ...ctx, answers: answers1 });
    const v2 = computeCalc(code, { ...ctx, answers: answers2 });
    return String(v2 - v1);
  });

  // SESSION_STATUS(sessionNr, calcCode) — status metadata for a session calc; stub: (Ukjent)
  text = text.replace(/\[?SESSION_STATUS\([^)]*\)\]?/gi, '(Ukjent)');

  // COUNT_SURVEY(...) — count of previous surveys; 0 in simulator (no DB access)
  text = text.replace(/\bCOUNT_SURVEY\([^)]*\)/gi, '0');

  // <uc>...</uc> → uppercase
  text = text.replace(/<uc>([\s\S]*?)<\/uc>/g, (_, inner) => inner.toUpperCase());

  // SURVEY_INFO(skjema, survey, category) — inline (not in brackets), category 0=date, 1=session#, 2=answered
  text = text.replace(/SURVEY_INFO\([^)]*\)/gi, () => {
    return new Date().toLocaleDateString('nb-NO', { day: '2-digit', month: '2-digit', year: '2-digit' });
  });

  // SURVEY_EXISTS(...) inline — always false in simulator
  text = text.replace(/SURVEY_EXISTS\([^)]*\)/gi, '');

  return text;
}

function flattenSections(sections: import('../types/questionnaire').Section[]): import('../types/questionnaire').Section[] {
  const result: import('../types/questionnaire').Section[] = [];
  const queue = [...sections];
  while (queue.length > 0) {
    const s = queue.shift()!;
    result.push(s);
    if (s.subSections) queue.push(...s.subSections);
  }
  return result;
}

function getQuestionText(code: string, ctx: SimContext): string {
  const lang = ctx.questionnaire.defaultLanguage;
  for (const section of flattenSections(ctx.questionnaire.sections)) {
    for (const q of section.questions) {
      if (q.code === code) {
        return q.texts[lang] ?? q.texts['NO' as keyof typeof q.texts] ?? code;
      }
    }
  }
  return code;
}

function getAnswerLabel(code: string, ctx: SimContext): string {
  const lang = ctx.questionnaire.defaultLanguage;
  const answer = ctx.answers.get(code);
  if (!answer) return '';

  for (const section of flattenSections(ctx.questionnaire.sections)) {
    for (const q of section.questions) {
      if (q.code === code) {
        if (q.type === 'radiobutton' || q.type === 'checkbox') {
          let options = q.options ?? [];
          if (options.length === 0 && q.responseTemplateCode && ctx.questionnaire.responseTemplates) {
            const tpl = ctx.questionnaire.responseTemplates.templates.find(
              (t) => t.code === q.responseTemplateCode,
            );
            options = tpl?.options ?? [];
          }
          const opt = options.find((o) => o.score === answer.score);
          if (opt) {
            return opt.texts[lang] ?? opt.texts['NO' as keyof typeof opt.texts] ?? '';
          }
        }
      }
    }
  }
  return answer.text || '';
}

// ─── DOB / age helpers ─────────────────────────────────────────────────────

function parseDob(dob: string): Date | null {
  const ddmmyyyy = dob.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (ddmmyyyy) {
    return new Date(Number(ddmmyyyy[3]), Number(ddmmyyyy[2]) - 1, Number(ddmmyyyy[1]));
  }
  const yyyymmdd = dob.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (yyyymmdd) {
    return new Date(Number(yyyymmdd[1]), Number(yyyymmdd[2]) - 1, Number(yyyymmdd[3]));
  }
  return null;
}

function calculateAge(dob: string): string {
  const birth = parseDob(dob);
  if (!birth) return '';
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return String(age);
}

function formatDobDisplay(dob: string): string {
  const d = parseDob(dob);
  if (!d) return dob;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

// ─── HTML wrapper ──────────────────────────────────────────────────────────

// ─── Graph SVG renderer ────────────────────────────────────────────────────

function renderGraphSvg(g: GraphDef, ctx: SimContext): string {
  const W = Math.min(g.width || 580, 580);
  const H = g.height || 220;
  const ML = 42, MR = 16, MT = g.header ? 28 : 12, MB = 36;
  const PW = W - ML - MR;
  const PH = H - MT - MB;
  const range = (g.max - g.min) || 1;

  // Collect values: one per session (current only in simulator)
  let value = 0;
  const calcCode = g.analysisCode || g.plots[0]?.seriesName || '';
  if (calcCode) value = computeCalc(calcCode, ctx);
  value = Math.max(g.min, Math.min(g.max, value));

  const now = new Date();
  const dateLabel = now.toLocaleDateString('nb-NO', { day: '2-digit', month: '2-digit', year: '2-digit' });

  const yScale = (v: number) => MT + PH - Math.round(((v - g.min) / range) * PH);
  const xC = ML + Math.round(PW * 0.15); // single bar at left side
  const barW = Math.max(8, Math.min(24, Math.round(PW * 0.06)));
  const barColor = g.plots[0]?.barColor || '#25b8ec';

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" class="reportgraph" style="display:block;margin:4px 0;">`);

  // Background
  parts.push(`<rect x="${ML}" y="${MT}" width="${PW}" height="${PH}" fill="white" stroke="#e0e0e0" stroke-width="1"/>`);

  // Bands (horizontal, background)
  for (const band of g.bands) {
    const by1 = yScale(Math.min(band.end, g.max));
    const by2 = yScale(Math.max(band.begin, g.min));
    if (by2 > by1) parts.push(`<rect x="${ML}" y="${by1}" width="${PW}" height="${by2 - by1}" fill="${band.color}" opacity="0.6"/>`);
  }

  // Y-axis grid lines + labels
  const steps = 5;
  for (let i = 0; i <= steps; i++) {
    const v = g.min + (range / steps) * i;
    const y = yScale(v);
    parts.push(`<line x1="${ML}" y1="${y}" x2="${ML + PW}" y2="${y}" stroke="#ebebeb" stroke-width="1"/>`);
    parts.push(`<text x="${ML - 4}" y="${y + 3}" text-anchor="end" font-size="7" fill="#808080" font-family="Calibri,Arial,sans-serif">${Math.round(v)}</text>`);
  }

  // Reference lines
  for (const line of g.lines) {
    const ly = yScale(Math.max(g.min, Math.min(g.max, line.pos)));
    parts.push(`<line x1="${ML}" y1="${ly}" x2="${ML + PW}" y2="${ly}" stroke="${line.color}" stroke-width="1" stroke-dasharray="4,2"/>`);
  }

  // Bar
  const barY = yScale(value);
  const baseY = yScale(g.min);
  const barH = Math.max(1, baseY - barY);
  parts.push(`<rect x="${xC - barW / 2}" y="${barY}" width="${barW}" height="${barH}" fill="${barColor}"/>`);

  // Value label above bar
  const valLabel = Number.isInteger(value) ? String(value) : value.toFixed(1);
  parts.push(`<text x="${xC}" y="${barY - 4}" text-anchor="middle" font-size="8" font-weight="bold" fill="#333" font-family="Calibri,Arial,sans-serif">${valLabel}</text>`);

  // X-axis date label
  parts.push(`<text x="${xC}" y="${MT + PH + 16}" text-anchor="middle" font-size="8" fill="#808080" font-family="Calibri,Arial,sans-serif">${dateLabel}</text>`);

  // Axes
  parts.push(`<line x1="${ML}" y1="${MT}" x2="${ML}" y2="${MT + PH}" stroke="#aaa" stroke-width="1"/>`);
  parts.push(`<line x1="${ML}" y1="${MT + PH}" x2="${ML + PW}" y2="${MT + PH}" stroke="#aaa" stroke-width="1"/>`);

  // Graph title
  if (g.header) {
    parts.push(`<text x="${ML + PW / 2}" y="16" text-anchor="middle" font-size="9" font-weight="bold" fill="#333" font-family="Calibri,Arial,sans-serif">${g.header}</text>`);
  }

  parts.push('</svg>');
  return parts.join('');
}

// ─── HTML wrapper ─────────────────────────────────────────────────────────

function wrapHtml(body: string, ctx: SimContext): string {
  const lang = ctx.questionnaire.defaultLanguage;
  const surveyName = ctx.questionnaire.name[lang] ?? ctx.questionnaire.code ?? '';

  return `<!DOCTYPE html>
<html lang="nb">
<head>
<meta charset="UTF-8">
<title>${surveyName}</title>
<style>
/* 960grid.css */
body { margin:0; padding:0; }
div.reportcanvas { padding:0; margin:0; width:960px; margin-left:auto; margin-right:auto; }
div.maincolumn { width:600px; padding:0; margin:0; float:left; border:0; clear:both; }
div.sidebarcolumn { width:300px; padding:0; margin:0; float:right; border:0; }
table.canvas { padding:0; width:960px; margin-left:auto; margin-right:auto; border:0; border-collapse:collapse; }
table.canvas td.maincolumn { width:600px; margin:0; padding:0; font-size:1em; vertical-align:top; }
table.canvas td.sidebar { width:300px; margin:0; padding:0; font-size:1em; vertical-align:top; }
table.canvas td.spacecolumn { width:60px; margin:0; padding:0; font-size:1em; vertical-align:top; }
div.footnote { width:100%; padding:10px; margin:0; float:left; border:0; clear:both; }
div.reportwidget { display:block; width:100%; padding:0; margin:0; clear:both; }
.tablewidth1{width:40px} .tablewidth2{width:100px} .tablewidth3{width:160px} .tablewidth4{width:220px} .tablewidth5{width:280px} .tablewidth6{width:340px} .tablewidth7{width:400px} .tablewidth8{width:460px} .tablewidth9{width:520px} .tablewidth10{width:580px}
.width1{width:60px} .width2{width:120px} .width3{width:180px} .width4{width:240px} .width5{width:300px} .width6{width:360px} .width7{width:420px} .width8{width:480px} .width9{width:540px}
.space1{margin-left:60px!important} .space2{margin-left:120px!important} .space3{margin-left:180px!important}
div.reportcanvas p, div.reportcanvas table, div.reportcanvas h1, div.reportcanvas h2, div.reportcanvas h3, div.reportcanvas ul, div.reportcanvas ol, img.reportgraph { margin-left:10px; margin-right:10px; }
td.maincolumn p, td.maincolumn table.reportlist, td.maincolumn table.reportsimple, td.maincolumn h1, td.maincolumn h2, td.maincolumn h3, td.maincolumn ul, td.maincolumn ol { margin-left:10px; margin-right:10px; }
td.sidebar p, td.sidebar table, td.sidebar h1, td.sidebar h2, td.sidebar h3, td.sidebar ul, td.sidebar ol { margin-left:10px; margin-right:10px; }
div.reportcolumns, table.reportcolumns { margin:0; padding:0; float:left; display:block; clear:none; }
table.reportcolumns { margin-left:-10px; margin-right:-10px; }
div.reportbreak { clear:both; }
div.reportwidget h1 { margin-bottom:10px; }
div.reportwidget h2 { margin-bottom:10px; }
div.reportwidget table, td.maincolumn table, td.sidebar table { border-collapse:collapse; border-spacing:0; margin-right:0; }
div.reportwidget td, div.reportwidget th, td.maincolumn td, td.maincolumn th, td.sidebar td, td.sidebar th { padding-left:10px; padding-right:10px; margin-left:0; margin-right:0; }
div.reportwidget td, td.maincolumn td, td.sidebar td { vertical-align:top; }
div.reportwidget th, td.maincolumn th, td.sidebar th { vertical-align:bottom; }
div.reportwidget { display:block; float:left; }
.nopaddingleft { padding-left:0; }
.left { text-align:left; } .right { text-align:right; } .center { text-align:center; } .justify { text-align:justify; }
.strong { font-weight:bold; } .underline { text-decoration:underline; }
.small { font-size:0.9em; } .xl { font-size:1.5em; } .xxl { font-size:2em; }
.reportindicator { margin-left:-10px; width:10px; }

/* theme.css */
body, table.canvas { font-family:Calibri,Arial,sans-serif; font-size:9pt!important; line-height:1.3em; }
div.checkware-brand { width:150px; float:right; height:31px; margin-top:30px; margin-right:10px; }
div.reportcanvas, div.maincolumn, div.sidebarcolumn, div.reportwidget { font-size:1em; }
h1.reporttitle { font-size:2em; font-weight:bold; margin-bottom:40px; margin-top:40px; }
OL, UL { color:#808080; }
OL SPAN, UL SPAN { color:#000000; }
div.reportwidget { margin-top:20px; page-break-inside:avoid!important; }
div.attention { border:1px dotted #c0c0c0; }
div.reportwidget h1 { font-size:1.5em; color:#000; font-weight:normal; }
div.reportwidget h2 { font-size:1.3em; color:#000; font-weight:normal; }
div.reportwidget p { margin-top:4px; margin-bottom:10px; }
div.reportwidget a { color:#3c73b7; float:inherit; display:inline; }
img.reportgraph { margin-top:5px!important; margin-bottom:5px!important; }
p.reportgraphcaption { margin-top:0!important; margin-bottom:10px!important; text-align:center; font-style:italic; color:#808080; }
p.reportgraphtitle { margin-top:10px!important; margin-bottom:0!important; text-align:center; font-style:italic; font-size:1.2em; }
table.reportlist { border-top:2px solid #f0f0f0; border-bottom:2px solid #f0f0f0; margin-top:10px; margin-bottom:10px; }
table.reportlist thead { border-bottom:2px solid #f0f0f0; }
table.reportlist td { border-bottom:1px dotted #f0f0f0; }
table.reportlist tfoot td { border-top:2px solid #f0f0f0; }
td { padding-top:2px; padding-bottom:2px; }
th { text-align:left; vertical-align:bottom; color:#808080; font-weight:normal; padding-top:4px; padding-bottom:4px; font-size:1em; }
th.total { text-align:right; font-weight:bold; }
th.score { text-align:center; font-weight:bold; }
td.label { color:#808080; }
td.value { color:#000; }
td.hilite { background-color:#f4f4f4; }
td.total { text-align:right; font-weight:bold; color:#000; }
td.score { text-align:center; font-weight:bold; color:#000; }
td.missing { color:#808080; font-style:italic; }
.remark { font-style:italic; font-weight:bold; }
.addendum { font-style:italic; }
.positive { color:#008800!important; }
.negative { color:#880000!important; }
sup { padding-left:2px; padding-right:2px; color:#f78d28; }
.checkware-maincolor { color:#25b8ec!important; font-weight:bolder; }
.copyright { font-size:0.9em; color:#808080; }
div.footnote { margin-top:20px!important; padding-bottom:50px!important; }
hr.footnote { border:0; border-top:1px solid #f0f0f0; width:350px; float:left; }
td.footer { padding-top:10px; }

@media print {
  @page { size: A4 portrait; margin: 15mm 20mm 20mm 20mm; }
  body { background:#fff; }
}
</style>
</head>
<body>
${body}
</body>
</html>`;
}
