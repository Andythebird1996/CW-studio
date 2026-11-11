# CLAUDE.md — Checkware Studio Web

Guidance for Claude Code when working in this repository.

## Hva er dette?

**Checkware Studio Web** er en nettbasert reimplementering av Checkware Studio — den opprinnelige Eclipse RCP-desktopapplikasjonen (Java/OSGi, Windows-only) som brukes til å lage kartlegginger (assessments), scoringsalgoritmer og rapporter for Checkware-plattformen.

Webversjonen er ment for intern bruk og gir de samme redigerings- og publiseringsfunksjonene uten å kreve Java eller Windows.

---

## Monorepo-struktur

```
checkware-studio-web/
├── frontend/          React 19 + TypeScript + Vite + Tailwind CSS
├── backend/           Bun + Hono — tynn proxy mot Checkware SOAP API
└── package.json       Workspace-root (Bun workspaces)
```

### Kjøre lokalt

```bash
bun run dev              # web-versjon: frontend (:5173) + backend (:3001)
bun run build            # produksjonsbygg av web-frontend

bun run electron:dev      # electron dev-modus (laster fra Vite-dev-server)
bun run electron:pack     # bygger installer for gjeldende plattform → dist-electron/
bun run electron:pack:mac # bygger kun macOS .dmg
bun run electron:pack:win # bygger kun Windows .exe (fungerer fra macOS via Wine)
bun run electron:pack:all # bygger .dmg + .exe i én operasjon
```

Backend-konfigurasjon i `.env` (se `.env.example`):
- `STORE_WSDL_URL` — URL til Checkware SOAP-endepunkt (`store-api.wsdl`)
- `STORE_USER` / `STORE_PASSWORD` — pålogging
- `PORT` — backend-port (default 3001)

---

## Frontend

### Stack

| Teknologi | Bruk |
|:---|:---|
| React 19 | UI-rammeverk |
| TypeScript 6 | Typesikkerhet |
| Vite 8 | Bundler / dev-server |
| Tailwind CSS 4 | Styling |
| Zustand 5 | Global state (tabs, settings) |
| @dnd-kit | Drag-and-drop i editors |
| @radix-ui | Tilgjengelige UI-primitiver (Dialog, Select, Tooltip, etc.) |
| JSZip | ZIP-pakking for publisering |
| lucide-react | Ikoner |
| Vitest + happy-dom | Enhetstester |

### Mappestruktur

```
frontend/src/
├── types/
│   └── questionnaire.ts        Alle TypeScript-typer (avledet fra EMF-modellen)
├── services/
│   ├── xml-parser.ts           Parser Checkware XML-pakkeformat → TS-typer
│   ├── xml-serializer.ts       Serialiserer TS-typer → Checkware XML (round-trip)
│   ├── package-builder.ts      Bygger ZIP-pakke i Studio-format for publisering
│   ├── rap-interpreter.ts      RAP-tolkeren — kjører rapportmaler klient-side
│   ├── generate-codes.ts       Auto-genererer unike koder (S/Q/T/QT-prefiks)
│   ├── validate-questionnaire.ts  Klient-side validering — returnerer ValidationIssue[]
│   ├── store-api.ts            HTTP-klient mot backend /api/store
│   └── translate-api.ts        HTTP-klient mot backend /api/translate
├── stores/
│   ├── workspace-store.ts      Zustand — åpne tabs, undo/redo (maks 50 steg)
│   └── settings-store.ts       Zustand — server-URL, brukernavn, UI-språk
├── components/
│   ├── layout/
│   │   ├── TabBar.tsx           Faner (en per åpen pakke)
│   │   ├── Toolbar.tsx          Topp-verktøylinje (ny, åpne, lagre, publiser)
│   │   └── PackageExplorer.tsx  Venstre panel — subtabs per pakkeinnhold
│   ├── editors/
│   │   ├── QuestionnaireEditor.tsx   Hovededitor: seksjoner, spørsmål, drag-and-drop
│   │   ├── SpreadsheetOptionsEditor.tsx  Tabell-editor for svaralternativer (paste-fra-Excel)
│   │   ├── CalculationEditor.tsx     Scoringsberegninger (SUM/MEAN/COUNT/CUSTOM)
│   │   ├── ScoringDebugger.tsx       Live CALC/NORM/FLAG-inspiserer ("Debugger"-tab)
│   │   ├── ReportEditor.tsx          RAP-teksteditor med live-preview
│   │   ├── ReportSimulator.tsx       RAP-simulator med simulert pasientdata
│   │   ├── TranslationEditor.tsx     Oversettelser per språk (AI + stale-deteksjon)
│   │   ├── NormEditor.tsx            Normtabeller for score-tolkning
│   │   ├── FlagEditor.tsx            Kliniske flagg/varsler
│   │   ├── DimensionsEditor.tsx      Dimensjoner (spørreskjema-dimensjoner)
│   │   ├── MetadataEditor.tsx        Pakkemetadata
│   │   ├── MediaEditor.tsx           Mediafiler (bilder)
│   │   └── ExpressionEditor.tsx      Visuell regeleditor (show/hide/continueIf)
│   ├── preview/
│   │   └── AssessmentPreview.tsx     Interaktiv pasient-fremvisning med svarregistrering
│   └── dialogs/
│       ├── ImportDialog.tsx          Importer eksisterende ZIP-pakke
│       ├── ImportTextDialog.tsx      Importer spørsmål fra fritekst
│       ├── ImportNormDialog.tsx      Importer normtabeller fra CSV/TSV
│       ├── PublishDialog.tsx         Valider og publiser til server
│       └── SettingsDialog.tsx        Server-tilkobling og UI-innstillinger
├── i18n.ts                      UI-tekster (norsk/engelsk)
└── App.tsx                      Root — tab-håndtering, fil-åpning, import/publiser
```

---

## Testing

```bash
cd frontend && bun run test          # kjør alle tester (340 tester, 11 filer)
cd frontend && bun run test:watch    # watch-modus
```

Testfiler dekker: XML round-trip, RAP-tolker, pakkebygging, SOAP-klient, assessment-logikk, validering, kode-generering, import-logikk, gap-fixes.

Vitest er konfigurert i `vite.config.ts` med `environment: 'happy-dom'`.

---

## Electron (desktop-app)

Electron-versjonen wrapper eksisterende frontend + backend i en installerbar applikasjon uten krav om nettleser eller serverinstallasjon.

```
electron/
├── main.ts          Electron main process (TypeScript)
├── tsconfig.json
└── dist/
    └── main.js      Ferdig-bundlet via esbuild (ikke i versjonskontroll)
```

### Arkitektur

```
Electron main process
├── Starter @hono/node-server på localhost:PORT
│   ├── Dev:  kun API-ruter (frontend serveres av Vite :5173)
│   └── Prod: API-ruter + statiske filer fra frontend/dist/
└── BrowserWindow
    ├── Dev:  → http://localhost:5173 (Vite, hot reload)
    └── Prod: → http://localhost:PORT (alt fra Hono)
```

### Build-flyt

1. `bun run build` — bygger Vite-frontend til `frontend/dist/`
2. `bun run electron:build:main` — bundler `electron/main.ts` + backend med esbuild → `electron/dist/main.js`
3. `electron-builder --mac/--win` — pakker `electron/dist/` + `frontend/dist/` til installer

### Port-håndtering

Appen prøver port 3001 ved oppstart. Hvis den er opptatt (f.eks. web-backenden kjører), finner den automatisk en ledig port via OS. BrowserWindow lastes alltid fra riktig port.

### Output

| Platform | Format | Størrelse | Konfig |
|:---|:---|:---|:---|
| Windows | NSIS `.exe`-installer | ~84 MB | Valgbar installasjonsmappe, kan bygges fra macOS via Wine |
| macOS | `.dmg` | ~101 MB | arm64 (Apple Silicon) |
| Linux | `.AppImage` | — | x64 |

Output-mappe: `dist-electron/`

> Windows-bygging fra macOS fungerer uten ekstra oppsett — electron-builder laster ned Wine automatisk.

### Avhengigheter (rot-nivå for Electron)

- `electron` — Electron runtime
- `electron-builder` — pakking + installers
- `esbuild` — bundler for electron main-prosessen
- `@hono/node-server` — kjøre Hono på Node.js (Electron bruker Node.js, ikke Bun)
- `wait-on` — venter på Vite-dev-server før Electron starter i dev-modus

### `Bun.env` vs `process.env`

Backend-koden bruker `process.env` (ikke `Bun.env`) slik at den kjører i både Bun og Node.js (Electron).

---

## Backend

**Bun + Hono** — fungerer som en CORS-proxy mellom nettleseren og Checkware-serverens SOAP-API. Nettleseren kan ikke kalle SOAP direkte (CORS + kompleks XML). Påloggingsdata sendes per-request som HTTP-headere (`X-Store-Url`, `X-Store-User`, `X-Store-Password`), aldri lagret server-side.

### Ruter

| Metode | Rute | Beskrivelse |
|:---|:---|:---|
| GET | `/api/store/packages` | List tilgjengelige pakker |
| GET | `/api/store/packages/:uid` | Last ned pakke (ZIP som base64) |
| POST | `/api/store/validate` | Valider pakke før publisering |
| POST | `/api/store/publish` | Publiser pakke til server |
| POST | `/api/store/clear-cache` | Tøm cachet SOAP-endepunkt |
| GET | `/api/translate/*` | Proxy til oversettelsestjeneste |
| GET | `/health` | Helsesjekk |

### SOAP-klient (`backend/src/soap/client.ts`)

Wrapper mot Checkware `store-api.wsdl`. Bruker `zip-extractor.ts` for å pakke ut nedlastede ZIP-pakker til strukturerte objekter.

---

## Datamodell

TypeScript-typene i `types/questionnaire.ts` er avledet fra Checkwares EMF-modell (Eclipse Modeling Framework, Java). Kildekoden for modellen ligger i `checkware-studio-master` (se `~/checkware-brain/`).

### Hierarki

```
Questionnaire
├── sections: Section[]
│   ├── questions: Question[]           (radio, checkbox, slider, tekst, dato, ...)
│   └── subSections?: Section[]         (nestede seksjoner, f.eks. MINI7)
├── calculations?: Calculations
│   ├── calculations: Calculation[]     (SUM / MEAN / COUNT / CUSTOM)
│   └── norms: Norm[]                   (normtabeller for score-tolkning)
├── flags?: Flag[]                      (kliniske varsler basert på score)
├── dimensions?: Dimension[]            (dimensjoner/subskalaer)
├── responseTemplates?: ResponseTemplates  (gjenbrukbare svaralternativer)
└── media?: MediaFile[]                 (bilder)
```

### Viktige type-detaljer

- **`Section.type`**: `NORMAL | REPEATED | CONDITIONAL`
- **`Section.requiresNewPage`**: bool — tvinger sideskift (EMF `Container.requiresNewPage`)
- **`Calculation.type`**: `SUM | MEAN | COUNT | CUSTOM`
- **`Calculation._rawExpression`**: bevarer rå XML for CUSTOM-beregninger (round-trip fidelitet) — vises read-only i CalculationEditor
- **`Question`**: union-type — `RadioQuestion | CheckboxQuestion | SliderQuestion | StringQuestion | DateQuestion | ...`
- **`TextOption.reverseValue`**: `boolean | undefined` — om scores skal reverseres for dette alternativet
- **`HideExpression / ShowExpression / ContinueIfExpression`**: strukturerte betingelsesregler med `statements[]` og `logic: AND | OR`

---

## XML-format og round-trip

Checkware Studio bruker en proprietær XML-pakkeformat i ZIP. Parser og serialiserer er designet for **fullstendig round-trip fidelitet** — XML inn → TypeScript-typer → XML ut skal gi identisk resultat.

- Parser: `xml-parser.ts` → leser `questionnaire:Questionnaire` EMF-XML
- Serialiserer: `xml-serializer.ts` → skriver tilbake til samme format
- ZIP-pakken inneholder: `quiz/`, `calculations/`, `flags/`, `norms/`, `reports/`, `media/`, `translations/`, `manifest.xml`

---

## RAP-tolkeren (`rap-interpreter.ts`)

RAP er Checkwares proprietære rapportmalmål. Tolkeren er en fullstendig TypeScript-reimplementering av PHP-referanseimplementasjonen i `checkware-report-engine-master/vendor/report/report.class.php` (5988 linjer).

### Støttede konstruksjoner

| Konstruksjon | Beskrivelse |
|:---|:---|
| `[if(COND)] ... [else] ... [endif]` | Betingede blokker |
| `[loop(code)] ... [loop_end]` | Løkke over svaralternativer |
| `[LOOP_BEGIN $VAR(...)] ... [LOOP_END]` | PHP-style løkke (legacy) |
| `[function name(p)] ... [function_end]` + `[CALL name(arg)]` | Funksjonsdefinisjoner |
| `[group("label")] ... [group_end]` | Grupperingsblokker |
| `[DEFINE $VAR, "val"]` | Konstant-definisjon (preprocessing) |
| `[IF(cond) DEFINE $VAR, "a":"b"]` | Betinget definisjon |
| `Q(code)`, `A(code)`, `L(code)` | Spørsmål, svar, svaralternativ-tekst |
| `CALC(code)`, `CALC(code, decimaler)` | Beregningsresultat |
| `NORM(code, val)`, `PERCENTILE(...)`, `ZSCORE(...)` | Normtabell-oppslag |
| `FLAG(code)` | Flagg-evaluering |
| `EXIST(code)`, `!EXIST(code)` | Svar-eksistenssjekk |
| `SUM(c1,c2,...)`, `COUNTEXIST(...)`, `SUBTR(a,b)`, `DIFF(a,b)` | Aritmetiske hjelpefunksjoner |
| `DIM_T(calcCode, normCode)` | T-skåre (50 + 10z) |
| `LOOKUP(val, ?, normCode)` | Normtabell-oppslag med verdi |
| `[SESSION_VALUE(n, code)]` | Calc-verdi fra historisk sesjon N |
| `[SESSION_DIFF(n1, n2, code)]` | Differanse mellom to sesjoner |
| `COUNT_SURVEY(...)` | Antall tidligere sesjoner (returnerer 0 i simulator) |

### Kjente quirks i RAP-tolkeren

- `FLAG(code)` i `[if(...)]`-betingelser krever egen gren i `evalCondition` — ikke bare i `substituteText`
- Navngitte operatorer (`GTE`, `LTE`, `GT`, `LT`, `EQ`, `NEQ`) må håndteres i `compareNums` i tillegg til symboler
- `SESSION_VALUE`/`SESSION_DIFF` — tokenizeren stripper brackets, så regex matcher uten `\[...\]`
- Tom `flag.conditions` skal returnere `false`, ikke `true` (`.every()` edge case)

### Systemvariabler

`$PATIENT_NAME`, `$PATIENT_FNAME`/`$PATIENT_FIRSTNAME`, `$PATIENT_LNAME`/`$PATIENT_SURNAME`, `$FODT`, `$AGE`/`$ALDER`, `$KJONN` (han/hun), `$KJONN_SUBST` (mann/kvinne), `$KJONN_GEN` (hans/hennes), `$KJONN_AKK` (ham/henne), `$KJONN_FLER` (menn/kvinner), `$GENDER` (0/1), `$SURVEY_NAME`, `$REPORT_NAME`, `$CURRENT_DATE`, `$CURRENT_TIME`, `$COPYRIGHT`

### Kjønn-mapping (fra PHP-referansen)

- `gender = 0` → kvinne (hun, hennes, henne, kvinner)
- `gender = 1` → mann (han, hans, ham, menn)

### SimContext

```ts
interface SimContext {
  questionnaire: Questionnaire;
  answers: Map<string, SimAnswer>;       // questionCode → { score, text }
  patient: SimPatient;                   // navn, fødselsdato, kjønn
  reportName?: string;
  sessionHistory?: Map<string, SimAnswer>[];  // historiske sesjoner (1-basert i RAP)
}
```

---

## AssessmentPreview

Interaktiv pasient-fremvisning med seksjonspaginering. Kjøres helt klient-side — ingen server-kall.

- Seksjoner vises som sider (én om gangen, neste/forrige-navigasjon)
- `isVisible(q, answers)` — evaluerer `show/hideExpressions` dynamisk
- `canContinue(section, answers)` — sjekker `continueIfExpressions` for å disable "Neste"-knappen
- Støttede widget-typer: radio, checkbox, slider, stringInput, dateInput
- Svar lagres i `Map<string, string | string[]>` per spørsmålskode
- **Viktig**: `handleAnswer` må sjekke at `code` ikke er tomt før den kaller `onAnswerChange` — tomme koder gir `NaN` score i RAP-tolkeren og krasjer live-preview

---

## SpreadsheetOptionsEditor

Tabell-editor for svaralternativer i ResponseTemplates. Aktiveres via "Tabell/Liste"-toggle.

- Kolonner: `code | score | Rev. | <lang1> | <lang2> | ...`
- Paste fra Excel: listener på `onPaste` i containeren, parser TSV-clipboard
- Hopper over header-rad hvis første celle er "code" (case-insensitive)
- Kolonnerekkefølge: code → score → tekst per språk i `languages`-prop-rekkefølge
- Brukes på alle 4 steder som har options: inline spørsmål, ResponseTemplates, rank, combobox

---

## ScoringDebugger

Live CALC/NORM/FLAG-inspiserer tilgjengelig som "Debugger"-tab i editoren.

- `collectQuestions(sections)` — rekursiv flattening av alle spørsmål med kode
- `resolveOptions(q, questionnaire)` — slår opp options fra spørsmål eller via `responseTemplateCode`
- `buildAnswerMap` — konverterer `Map<code, string>` til `Map<code, {value, score}>`
- Evaluerer SUM/MEAN/COUNT direkte uten å gå via RAP-tolkeren
- CUSTOM-beregninger vises som "Not evaluable" med råuttrykket
- FLAG-evaluering respekterer `flag.logic AND/OR`
- Bruker `<details>` for sammenleggbare seksjoner per beregningsgruppe

---

## TranslationEditor — stale-deteksjon

- `hashSource(text)` — `btoa(unescape(encodeURIComponent(text)))` for å håndtere norske tegn
- `sourceHashes: Map<"${rowKey}:${lang}", string>` — lagres per sesjon (ikke persistert)
- ⚠-indikator vises når `currentHash !== storedHash`
- "Oversett utdaterte (N)"-knapp sender bare stale-rader til AI i batch per målspråk
- Hashes oppdateres etter vellykket oversettelse

---

## Publiseringsflyt

1. Bruker redigerer kartlegging i `QuestionnaireEditor`
2. `buildPackageZip()` bygger en ZIP-pakke i Studio-format
3. Frontend kaller `POST /api/store/validate` — backend kaller SOAP `validatePackage`
4. Ved godkjent validering: `POST /api/store/publish` — backend kaller SOAP `publishPackage`
5. Pakken er nå tilgjengelig i Checkware-serveren

---

## Referanseimplementasjoner (i `~/checkware-brain/`)

| Repo | Relevans |
|:---|:---|
| `checkware-studio-master` | EMF-datamodell (Java) — kilde for TypeScript-typene |
| `checkware-studio-editor-master` | SOAP-klient, `store-api.wsdl` |
| `checkware-studio-reporteditor-master` | Eclipse RAP-editor (syntax-highlight kun, ingen preview) |
| `checkware-report-engine-master` | PHP RAP-tolkeren — referanse for `rap-interpreter.ts` |
| `checkware-specification-master` | Tekniske spesifikasjoner (source of truth) |

---

## Kodestil

- **TypeScript** med strict mode — unngå `as any`, bruk union-guards og type narrowing
- **Tailwind CSS** — bruk eksisterende `cw-*` fargevariabler (`cw-blue`, `cw-border`, `cw-gray`, etc.)
- **Vitest** for enhetstester — kjør `bun run test` etter endringer
- **Ingen backend-state** — alt applikasjonsstate lever i Zustand-stores i nettleseren
- Rediger eksisterende filer fremfor å lage nye
- Unngå over-engineering — minste nødvendige løsning
