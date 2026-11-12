# HANDOVER — Checkware Studio Web

> Overleveringsdokument for AI-assistenter (Claude, Codex, Gemini, Cursor, osv.) og utviklere.
> Sist oppdatert: 2026-11-11. Les dette først, deretter `CLAUDE.md` (detaljert arkitektur) og `lessons-learned.md` (kjente fallgruver).

---

## 1. Hva er dette?

En nettbasert reimplementering av **Checkware Studio**, den gamle Eclipse RCP-appen (Java/OSGi, kun Windows). Studio brukes til å lage **kartlegginger** (assessments/spørreskjema), **scoringsberegninger**, **normer**, **flagg** og **rapporter** (RAP-språket). Ferdige pakker publiseres til Checkware-serveren via SOAP.

Webversjonen er til intern bruk. Den kan kjøres på tre måter:
1. **I nettleser** (lokalt via `bun run dev` eller på Fly.io)
2. **Som Electron-desktopapp** (`.exe` / `.dmg`)
3. **Som Tauri-variant** (eget prosjekt, eksperimentell)

---

## 2. Hvor ligger ting?

| Sti | Innhold |
|:---|:---|
| `~/checkware-studio-web/` | **Hovedprosjektet** (monorepo: frontend + backend + electron). Git-remotes: `cw` = `github.com/Andythebird1996/CW-studio` (her merges PR-er), `origin` = `github.com/andreasfuglstad1996/checkware-studio-web`. |
| `~/checkware-studio-web/frontend/` | React 19 + TS + Vite + Tailwind 4 + Zustand. All forretningslogikk ligger her. |
| `~/checkware-studio-web/backend/` | Bun + Hono, en tynn proxy mot Checkware SOAP API og Claude API (oversettelse). |
| `~/checkware-studio-web/electron/` | Electron main-prosess (`main.ts` → esbuild → `electron/dist/main.js`). |
| `~/checkware-studio-web/dist-electron/` | Bygde installere. Nyeste er `CW Studio Web Setup 1.0.15.exe`. |
| `~/checkware-studio-web/releases/` | Eldre zip-releaser (1.0.1, 1.0.2). |
| `~/checkware-studio-tauri/` | Tauri 2-variant av samme frontend (v0.1.x). **Er** et git-repo med GitHub Actions-bygg. |
| `~/checkware-brain/` | Referansekoden fra originalen (Java/EMF-modell, SOAP-WSDL, RAP-editor, installer). Dette er fasiten. |
| `~/checkware-studio-stack-no.md` / `-en.md` | Beskrivelse av tech-stack (nynorsk / engelsk). |

Referanserepoer i `~/checkware-brain/` (se også `CLAUDE.md`):
- `checkware-studio-master`: EMF-datamodellen som TS-typene er avledet fra
- `checkware-studio-editor-master`: SOAP-klient og `store-api.wsdl`
- `checkware-studio-reporteditor-master`: den originale RAP-editoren
- `checkware-report-engine-master` / `checkware-specification-master`: refereres i `CLAUDE.md`. Sjekk om de faktisk finnes.

---

## 3. Arkitektur i korte trekk

```
Nettleser / Electron
  └─ frontend (React, Zustand-state, ingen backend-state)
       ├─ xml-parser / xml-serializer   Checkware XML ⇄ TS-typer (round-trip)
       ├─ package-builder               ZIP i Studio-format
       ├─ rap-interpreter               RAP-rapporter kjøres klient-side (port av PHP-motoren)
       ├─ validate-questionnaire        Klient-side validering
       └─ store-api / translate-api ──► backend (Hono, :3001)
                                          ├─ GET  /health
                                          ├─ /api/store/*      → SOAP (validatePackage, publishPackage, …)
                                          └─ /api/translate/*  → Claude API (AI-oversettelse)
```

Publisering: editor → `buildPackageZip()` → `POST /api/store/validate` → `POST /api/store/publish` → Checkware-server.

I produksjon (Docker/Fly) server backend også det bygde frontend-et fra `public/`.

---

## 4. Kom i gang (lokalt)

```bash
cd ~/checkware-studio-web
bun install
cp .env.example .env        # .env finnes allerede lokalt, så ikke overskriv den
bun run dev                 # frontend http://localhost:5173 + backend :3001
```

Miljøvariabler (`.env`, **aldri commit / aldri lim inn verdier i chat**):

| Variabel | Bruk |
|:---|:---|
| `STORE_WSDL_URL` | Checkware SOAP-endepunkt (`.../store-api.wsdl`) |
| `STORE_USER` / `STORE_PASSWORD` | Pålogging mot Checkware |
| `PORT` | Backend-port (default 3001) |
| `ANTHROPIC_API_KEY` | AI-oversettelse i TranslationEditor |

### Tester

```bash
cd frontend && bun run test
```

Status 2026-11-11 (etter PR #5): **339 bestått, 10 hoppet over, 2 feilet** (351 totalt, 12 filer).
De 2 som feiler er integrasjonstester i `src/services/store-api.test.ts`. De forventer at backend kjører på `localhost:3001` (feilen er `ECONNREFUSED`). Start `bun run dev` i et annet terminalvindu før testene, så skal de bestå. Dette er ikke en kodefeil.

### Ende-til-ende (Playwright)

Frontend-røyktester i tre viewporter: mobil 375×812, nettbrett 768×1024 og desktop 1440×900. De åpner appen, oppretter en kartlegging, åpner hovededitorene og innstillingsdialogen, og sjekker at siden ikke får horisontal scroll og at kontrollene er synlige. Backend kalles ikke.

```bash
cd frontend && bunx playwright install chromium   # én gang, laster ned nettleser
cd frontend && bun run test:e2e                   # eller `bun run test:e2e` fra rot
```

Vite startes automatisk. Skjermbildene ligger i `frontend/e2e/*-snapshots/`. Oppdater dem med `cd frontend && bun run test:e2e:update` når layouten med vilje endres.

Fra 1280 px og opp er desktop-oppsettet som før (fast sidemeny, forhåndsvisning ved siden av editoren). Under 1280 px er pakkeutforskeren et overlay, forhåndsvisning stables, og dialoger begrenses til viewporten.

---

## 5. Bygg og distribusjon

### Electron-desktopapp
```bash
bun run electron:dev        # dev-modus
bun run electron:pack:mac   # .dmg
bun run electron:pack:win   # .exe (fra macOS via Wine)
bun run electron:pack:all   # begge
```
- Versjon styres i rot-`package.json` (nå `1.0.15`).
- Produktnavnet ble endret fra "Checkware Studio" til **"CW Studio Web"** i 1.0.15, så filnavnene i `dist-electron/` har begge navnene.
- `appId`: `no.checkware.cwstudioweb`. NSIS-installer per maskin, med `build/installer.nsh`.

### Rapportvisning (PR #5)
Rapportredigering og simulator har en bryter mellom **«Vis som rapportmotor»** (standard) og **«Vis som portal»**. Rapportmotor-visningen bruker samme CSS som den ekte rapportmotoren (`~/checkware-brain/checkware-report-engine-master/web/stylesheets/css/`: Calibri 9pt, `#25b8ec`, fast 960-grid), slik at forhåndsvisningen ligner det som faktisk publiseres. Portalvisningen er bare kosmetisk. **Ikke gjør portalstilen til standard**, fordi forhåndsvisningen da ikke lenger ligner den ekte rapporten.

### Fly.io (webversjon)
- Konfig: `~/checkware-studio-web/fly.toml`
- App: **`checkware-studio`**, region **`ams`**, intern port **3001**, 1 delt CPU / 1 GB RAM
- `auto_stop_machines = 'stop'` og `min_machines_running = 0`, så maskinen sover når ingen bruker den, og første kall kan bruke lang tid (kaldstart).
- Bygges fra `Dockerfile` (flerstegs: bygger frontend med Bun, kjører `bun run src/server.ts`).
- URL: `https://checkware-studio.fly.dev`
- **Fly-konto:** `andreas.fuglstad@checkware.com` (org `personal`). Den private kontoen (anh.fug@gmail.com) har ingen apper, så ikke deploy derfra.
- **Status 2026-11-11 (kveld):** main til og med PR #5 (`c503c93`) er deployet som release v22 (v21 = deploy, v22 = fjerning av secrets). `/health` gir `{"ok":true}`.
- **Ingen secrets er satt.** `STORE_*` ble satt for testing og fjernet igjen samme dag, fordi appen ikke har innlogging (se punkt 8). Brukerne legger inn egen server-URL og innlogging i innstillingene. `ANTHROPIC_API_KEY` er heller ikke satt, så AI-oversettelse virker ikke før eieren legger den inn selv. AI-assistenter skal ikke sette den.

```bash
flyctl auth whoami                      # skal være andreas.fuglstad@checkware.com
flyctl status   -a checkware-studio
flyctl logs     -a checkware-studio
flyctl secrets list -a checkware-studio # viser bare navn og digest, ikke verdier
flyctl deploy                           # kjøres fra ~/checkware-studio-web
```

### Docker lokalt
```bash
docker compose up --build   # http://localhost:3001
```
Merk: `docker-compose.yml` sender bare `ANTHROPIC_API_KEY` videre, ikke `STORE_*`. Publisering fra Docker-containeren krever at disse legges til.

---

## 6. Regler for AI-assistenter

- **Svar på norsk.** Kode og identifikatorer beholdes på engelsk.
- **TypeScript strict.** Ikke bruk `as any`. Bruk union-guards og type narrowing.
- **Tailwind:** bruk de eksisterende `cw-*`-fargene (`cw-blue`, `cw-border`, `cw-gray`, …).
- **Ingen state i backend.** Alt ligger i Zustand-stores i frontend.
- Rediger eksisterende filer framfor å lage nye. Lag den minste løsningen som fungerer.
- Kjør `cd frontend && bun run test` etter endringer.
- Er du usikker på formatet eller oppførselen, sjekk referansekoden i `~/checkware-brain/` før du gjetter.
- **Ikke publiser til en ekte Checkware-server** (`/api/store/publish`) uten at brukeren har bekreftet det. Det endrer produksjonsdata.
- Ikke vis innholdet i `.env`.

### Kjente fallgruver (fullstendig liste i `lessons-learned.md`)
1. Tomme spørsmålskoder gir `NaN`-score og krasjer live-preview. Sjekk `code` før kall.
2. RAP: navngitte operatorer (`GTE`, `LT`, …) må håndteres i `compareNums`.
3. RAP: `FLAG(code)` i `[if(...)]` trenger egen gren i `evalCondition`.
4. RAP: tokenizeren fjerner `[...]`, så regex for `SESSION_VALUE` må ha valgfrie klammer.
5. Et flagg uten betingelser skal gi `false` (`[].every()` gir `true`).
6. XML: sjekk `NumericSlider` før `Numeric`.
7. XML: ikke skriv `undefined` som attributtverdi.
8. Kjønn i RAP: `0` = kvinne, `1` = mann.

---

## 7. Forslag til testing

1. **Lokal røyktest:** kjør `bun run dev`, åpne :5173, importer en eksisterende ZIP-pakke (ImportDialog), lagre og eksporter. Sammenlign XML-en før og etter (round-trip).
2. **Scoring:** gå til Debugger-fanen, sett testverdier og kontroller SUM/MEAN/COUNT, normer og flagg.
3. **Rapport:** bruk ReportSimulator med syntetisk pasient. Test `$KJONN*`-variabler, `FLAG()` og `SESSION_VALUE`.
4. **AI-oversettelse:** endre en kildetekst og sjekk at ⚠ vises. Kjør deretter "Oversett utdaterte (N)".
5. **Validering mot server:** kall `/api/store/validate` mot et **test**miljø (ikke prod).
6. **Fly:** logg inn, kjør `flyctl status`, og sjekk `/health` og at secrets er satt.
7. **Electron:** installer nyeste `.dmg`/`.exe` og sjekk at appen starter og når backend.

---

## 8. Åpne punkter / usikkerhet

- ⚠ **Sikkerhet på Fly:** backend har **ingen autentisering**, og CORS er `*` i produksjon. **Ikke sett `STORE_*` som Fly-secrets** før appen har innlogging foran seg (f.eks. Basic Auth i Hono eller privat Fly-nettverk). Ellers kan alle som kjenner URL-en liste og publisere pakker med den Checkware-brukeren. I dag sender hver bruker sin egen innlogging via `X-Store-*`-headerne.
- Fly-appen sover når den ikke brukes, så første kall etter en pause kan ta flere sekunder.
- Tauri-varianten (`~/checkware-studio-tauri`, v0.1.2) og Electron-varianten utvikles hver for seg. Det er ikke avklart hvilken som er strategisk valgt.
- `CLAUDE.md` sier "340 tester". Det faktiske tallet er 351.
