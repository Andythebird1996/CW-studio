/**
 * Vis/skjul/fortsett-uttrykk beholdes som de sto i fila så lenge de ikke er endret i Studio.
 * Studio redigerer bare flate OG/ELLER-lister; sammensatte uttrykk (nestede operatorer, if,
 * sumDimension …) ville ellers blitt forenklet eller borte ved eksport.
 */
import type { SimpleStatement } from '../types/questionnaire';

interface FlatExpression {
  statements: SimpleStatement[];
  logic: 'AND' | 'OR';
}

export function expressionFingerprint(e: FlatExpression): string {
  return JSON.stringify([e.logic, e.statements]);
}

/** Funksjoner Studio forstår i et SimpleStatement */
const KNOWN_FUNCTIONS = new Set(['questionResponseValue', 'answered', 'unanswered']);

/** Uttrykket i fila er mer enn Studio kan vise (nestede operatorer eller andre funksjoner). */
export function isCompoundXml(xml: string): boolean {
  const operators = xml.match(/xsi:type="questionnaire:Operator"/g)?.length ?? 0;
  const fns = [...xml.matchAll(/xsi:type="questionnaire:Function" name="([^"]*)"/g)].map((m) => m[1]);
  return operators > 1 || fns.some((f) => !KNOWN_FUNCTIONS.has(f));
}
