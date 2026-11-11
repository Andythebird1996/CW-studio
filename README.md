# Checkware Studio Web

Nettbasert reimplementering av Checkware Studio — den opprinnelige Eclipse RCP-desktopapplikasjonen (Java/OSGi, Windows-only) for å lage kartlegginger, scoringsalgoritmer og rapporter for Checkware-plattformen.

## Kom i gang

```bash
bun install
bun run dev        # frontend :5173 + backend :3001
```

Kopier `.env.example` til `.env` og fyll inn server-URL og brukernavn.

## Stack

| Lag | Teknologi |
|:---|:---|
| Frontend | React 19, TypeScript 6, Vite 8, Tailwind CSS 4 |
| State | Zustand 5 (workspace-store, settings-store) |
| UI | @radix-ui, @dnd-kit, lucide-react |
| Backend | Bun + Hono (SOAP-proxy) |
| Desktop | Electron (valgfritt) |
| Tester | Vitest + happy-dom — 340 tester, 11 filer |

## Funksjoner

### Editor
- **QuestionnaireEditor** — seksjoner, spørsmål, drag-and-drop, auto-generering av koder
- **CalculationEditor** — SUM/MEAN/COUNT/CUSTOM-beregninger med live scoring-debugger
- **ReportEditor** — RAP-teksteditor med live-preview
- **ReportSimulator** — simuler utfylt kartlegging med syntetisk pasientdata
- **TranslationEditor** — flerspråklig oversettelse med AI-assistanse og stale-deteksjon
- **NormEditor** — normtabeller for score-tolkning
- **FlagEditor** — kliniske varsler basert på score
- **DimensionsEditor** — dimensjoner/subskalaer
- **ScoringDebugger** — live CALC/NORM/FLAG-inspiserer (ny tab i editoren)

### Verktøy
- **SpreadsheetOptionsEditor** — rediger svaralternativer som tabell med paste-fra-Excel
- **ImportTextDialog** — importer spørsmål fra fritekst (ett per linje)
- **ImportNormDialog** — importer normtabeller fra CSV/TSV
- **Validering** — klient-side validering med feil og advarsler
- **Auto-generer koder** — tildel koder til alle elementer i ett klikk
- **Publisering** — ZIP-pakke → SOAP-validering → Checkware-server

### Scoring-debugger
Ny "Debugger"-tab i editoren:
- Sett testverdier per spørsmål
- Se alle beregningsresultater (SUM/MEAN/COUNT) live
- Se hvilke flagg som utløses og hvorfor
- Norm-oppslag vises i egen tabell

### AI-oversettelse
- Auto-oversett enkeltspråk via Claude API
- **"Oversett utdaterte (N)"** — oversetter kun tekster som har endret seg siden sist
- Stale-indikator (⚠) vises per celle når kildetekst er endret

## Testing

```bash
cd frontend && bun run test          # kjør alle tester
cd frontend && bun run test:watch    # watch-modus
```

340 tester dekker: XML round-trip, RAP-tolker, pakkebygging, SOAP-klient, assessment-logikk, validering, kode-generering, import-logikk og gap-fixes.

## Bygging

```bash
bun run build                # web-produksjonsbygg
bun run electron:pack:mac    # macOS .dmg
bun run electron:pack:win    # Windows .exe (fra macOS via Wine)
bun run electron:pack:all    # begge platformer
```

## Arkitektur

```
checkware-studio-web/
├── frontend/src/
│   ├── types/questionnaire.ts      TypeScript-typer (avledet fra EMF-modell)
│   ├── services/
│   │   ├── xml-parser.ts           Checkware XML → TS-typer
│   │   ├── xml-serializer.ts       TS-typer → Checkware XML
│   │   ├── rap-interpreter.ts      RAP-tolker (reimplementering av PHP-referansen)
│   │   ├── package-builder.ts      Bygger ZIP-pakke for publisering
│   │   ├── generate-codes.ts       Auto-genererer unike koder
│   │   ├── validate-questionnaire.ts Klient-side validering
│   │   ├── store-api.ts            HTTP-klient mot backend
│   │   └── translate-api.ts        Oversettelsestjeneste-klient
│   ├── stores/
│   │   ├── workspace-store.ts      Åpne tabs, undo/redo (50 steg)
│   │   └── settings-store.ts       Server-URL, brukernavn, UI-språk
│   └── components/
│       ├── editors/                Alle editor-komponenter
│       ├── preview/AssessmentPreview.tsx
│       └── dialogs/                Import, publisering, innstillinger
├── backend/                        Bun + Hono SOAP-proxy
└── electron/                       Desktop-wrapper
```

## Referanser

Kildekode og spesifikasjoner i `~/checkware-brain/`:
- `checkware-studio-master` — EMF-datamodell (Java)
- `checkware-report-engine-master` — PHP RAP-referanseimplementasjon
- `checkware-specification-master` — tekniske spesifikasjoner
