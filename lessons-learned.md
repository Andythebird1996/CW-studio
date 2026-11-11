# Lessons Learned — Checkware Studio Web

Erfaringer fra utviklingen av Checkware Studio Web (2026-05).

---

## 1. RAP-tolker: tomme koder krasjer live-preview

**Problem**: Når et spørsmål mangler `code` og bruker skriver tekst i feltet, kaller `handleAnswer` `onAnswerChange` med `code = ''`. `convertAnswers` produserer da `score: NaN`, som krasjer `interpretRap` → live-preview forsvinner.

**Fix**: Guard i `handleAnswer`:
```ts
if (code) next.set(code, value);
if (code) onAnswerChange?.(next);
```
Og i `convertAnswers`:
```ts
for (const [code, val] of previewAnswers) {
  if (!code) continue;
  ...
}
```

---

## 2. RAP: navngitte operatorer ikke støttet i compareNums

**Problem**: Checkware RAP bruker både symbolske (`>=`, `<`) og navngitte (`GTE`, `LT`) operatorer i betingelser. `compareNums` håndterte kun symboler — navngitte ga alltid `false`.

**Fix**: Legg til switch-grener for `GTE`, `LTE`, `GT`, `LT`, `EQ`, `NEQ` i `compareNums`.

---

## 3. RAP: FLAG(code) i [if(...)]-betingelser aldri evaluert

**Problem**: `evalCondition` hadde ingen `FLAG(code)`-gren — betingelser som `[if(FLAG(risk))]` var alltid false.

**Fix**: Legg til i `evalCondition`:
```ts
if (cond.startsWith('FLAG(') && cond.endsWith(')')) {
  return evaluateFlag(resolve(cond.slice(5, -1).trim(), args), ctx);
}
```

---

## 4. RAP: SESSION_VALUE krever valgfrie brackets i regex

**Problem**: Tokenizeren stripper `[...]` fra direktiver før `substituteText` kjøres. Regex som krevde `\[SESSION_VALUE(...)\]` matchet aldri.

**Fix**: Gjør brackets valgfrie: `\[?SESSION_VALUE\(...\)\]?`

---

## 5. RAP: tom flag.conditions returnerer true

**Problem**: `flag.conditions.every(cond => ...)` over et tomt array returnerer `true` (JavaScript edge case). Flag uten betingelser skal ikke utløses.

**Fix**: Tidlig retur:
```ts
if (!flag.conditions.length) return false;
```

---

## 6. XML-parser: NumericSlider vs Numeric rekkefølge

**Problem**: `widgetType.includes('Numeric')` matcher også `NumericSlider`. Siden Numeric-sjekken kom først, ble slidere feilklassifisert som `numericInput`.

**Fix**: Sjekk `NumericSlider` FØR `Numeric`:
```ts
if (widgetType.includes('NumericSlider') || widgetType.includes('Slider')) return 'slider';
if (widgetType.includes('NumericInput') || widgetType.includes('Numeric')) return 'numericInput';
```

---

## 7. XML-serializer: undefined → literal 'undefined' i XML

**Problem**: `wp.min = String(qq.min)` når `qq.min === undefined` skriver literal `'undefined'` til XML.

**Fix**: Bare sett attributt hvis verdien finnes:
```ts
if (qq.min !== undefined) wp.min = String(qq.min);
if (qq.max !== undefined) wp.max = String(qq.max);
```

---

## 8. translate-api: API-svar uten Array.isArray-guard

**Problem**: Hvis oversettelsestjenesten returnerer uventet respons (null, objekt, manglende felt), krasjer kallet silently med feil som er vanskelig å debugge.

**Fix**: Legg til `Array.isArray` guard etter HTTP-sjekk og kast meningsfull Error.

---

## 9. as-any antipattern i TypeScript

**Mange** steder brukte `(q as any).property` for å få tilgang til union-properties. Riktig mønster:
- Bruk `'property' in q && q.property` for optional union members
- Bruk `q.type === 'slider'` for å narrowe union før tilgang
- Ikke bruk `as any` — det skjuler bugs og fjerner typesikkerheten

---

## 10. DimensionsEditor: feil type-sjekk

**Problem**: `(q as any).isQuestion !== false` for å ekskludere tekst-elementer. `isQuestion` er ikke en del av TypeScript-modellen.

**Fix**: Bruk den faktiske discriminatoren: `q.type !== 'text'`

---

## 11. Tabell-editor: paste-fra-Excel

Paste-hendelsen på en container mottar clipboard-tekst som TSV. Mønster for Excel-paste:
```ts
container.addEventListener('paste', (e) => {
  const text = e.clipboardData?.getData('text/plain') ?? '';
  if (!text.includes('\t')) return; // ikke TSV, la nettleseren håndtere
  e.preventDefault();
  const rows = text.split('\n').filter(Boolean).map(r => r.split('\t'));
  // ... parse og insert
});
```
Hopp over header-rad hvis første celle er "code" (case-insensitive).

---

## 12. Stale-translation hashing med norske tegn

`btoa()` krasjer på ikke-ASCII tegn (f.eks. æøå). Bruk:
```ts
btoa(unescape(encodeURIComponent(text)))
```
og tilsvarende for decode:
```ts
decodeURIComponent(escape(atob(hash)))
```

---

## 13. Auto-generate codes: immutabilitet

`generateCodes()` returnerer nye objekter via spread. Aldri muter input direkte — Zustand oppdager ikke referanselike objekter som endringer.

---

## 14. Vitest + happy-dom oppsett

Vitest konfigureres i `vite.config.ts`:
```ts
test: {
  environment: 'happy-dom',
  globals: true,
  include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
}
```
Legg til `vitest` og `happy-dom` i `devDependencies` i `frontend/package.json`. Aldri bruk shell-redirect (`> file`) for å skrive `package.json` — det kan truncere filen.

---

## 15. ScoringDebugger: CUSTOM-beregninger

CUSTOM-beregninger har en PHP-uttrykk i `_rawExpression` som ikke kan evalueres klient-side. Vis dem som "Not evaluable" med rå-uttrykket synlig — aldri prøv å evaluere PHP i JavaScript.

---

## 16. FLAG-evaluering: AND vs OR logikk

`flag.logic` er enten `'AND'` eller `'OR'`. Pass på:
- AND: `conditions.every(c => evalCondition(c, calcResults))`
- OR: `conditions.some(c => evalCondition(c, calcResults))`
- Default bør være AND (mest vanlig i Checkware)
