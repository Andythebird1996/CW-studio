/**
 * UI translations for Checkware Studio Web.
 * Source: checkware-studio-editor-master/plugin.properties (EN)
 *         checkware-studio-editor-master/plugin_no.properties (NO)
 */

import { createContext, useContext } from 'react';

export type UILang = 'EN' | 'NO';

/** React context — provides the current UI language to all components */
export const UILangContext = createContext<UILang>('NO');

/** Hook to read the current UI language from context */
export function useUILang(): UILang {
  return useContext(UILangContext);
}

/** Inline helper: pick the right string based on UI language */
export function s(no: string, en: string, lang: UILang): string {
  return lang === 'NO' ? no : en;
}

const strings = {
  // ── App chrome ─────────────────────────────────────────────────────────
  appTitle:          { EN: 'Checkware Studio', NO: 'Checkware Studio' },

  // ── Toolbar buttons ────────────────────────────────────────────────────
  newQuestionnaire:  { EN: 'New package', NO: 'Ny pakke' },
  openFile:          { EN: 'Open file',         NO: 'Åpne fil' },
  import:            { EN: 'Import',            NO: 'Importer' },
  save:              { EN: 'Save',              NO: 'Lagre' },
  publish:           { EN: 'Publish',           NO: 'Publiser' },
  settings:          { EN: 'Settings',          NO: 'Innstillinger' },

  // ── Sub-tabs (from ResourceType folder names + plugin.properties) ──────
  tabQuiz:           { EN: 'Questionnaire',     NO: 'Kartlegging' },
  tabCalculations:   { EN: 'Calculations',      NO: 'Beregninger' },
  tabDimensions:     { EN: 'Dimensions',        NO: 'Dimensjoner' },
  tabFlags:          { EN: 'Flags',             NO: 'Flagg' },
  tabNorms:          { EN: 'Norms',             NO: 'Normer' },
  tabReports:        { EN: 'Report',            NO: 'Rapport' },
  tabMedia:          { EN: 'Media',             NO: 'Media' },
  tabMetadata:       { EN: 'Metadata',          NO: 'Metadata' },
  tabTranslations:   { EN: 'Translations',      NO: 'Oversettelser' },
  tabDebugger:       { EN: 'Debugger',          NO: 'Debugger' },
  tabDependencies:   { EN: 'Dependencies',      NO: 'Avhengigheter' },

  // ── Toolbar undo/redo ──────────────────────────────────────────────────
  undo:              { EN: 'Undo (Ctrl+Z)',      NO: 'Angre (Ctrl+Z)' },
  redo:              { EN: 'Redo (Ctrl+Y)',      NO: 'Gjør om (Ctrl+Y)' },

  // ── Empty state ────────────────────────────────────────────────────────
  noQuestionnaire:   { EN: 'No package open',                          NO: 'Ingen pakke åpen' },
  noQuestionnaireHint: {
    EN: 'Create new, open a local file, or import from server',
    NO: 'Opprett ny, åpne lokal fil, eller importer fra server',
  },

  // ── Settings dialog ────────────────────────────────────────────────────
  storeUrl:          { EN: 'Store URL',              NO: 'Server-URL' },
  userId:            { EN: 'User ID',                NO: 'Bruker-ID' },
  password:          { EN: 'Password',               NO: 'Passord' },
  serverSettings:    { EN: 'Server settings',        NO: 'Serverinnstillinger' },
  username:          { EN: 'Username',               NO: 'Brukernavn' },
  testConnection:    { EN: 'Test connection',        NO: 'Test tilkobling' },
  testing:           { EN: 'Testing...',             NO: 'Tester...' },
  disconnect:        { EN: 'Disconnect',             NO: 'Koble fra' },
  saveBtn:           { EN: 'Save',                   NO: 'Lagre' },
  cancelBtn2:        { EN: 'Cancel',                 NO: 'Avbryt' },

  // ── Import dialog ──────────────────────────────────────────────────────
  importFromStore:   { EN: 'Import from Store', NO: 'Importer fra server' },

  // ── Publish dialog ─────────────────────────────────────────────────────
  publishToStore:    { EN: 'Publish to Store',  NO: 'Publiser til server' },
  code:              { EN: 'Code',              NO: 'Kode' },
  version:           { EN: 'Version',           NO: 'Versjon' },
  release:           { EN: 'Release',           NO: 'Utgivelse' },
  name:              { EN: 'Name',              NO: 'Navn' },
  isPublic:          { EN: 'Public',            NO: 'Offentlig' },

  // ── Question types ──────────────────────────────────────────────────────────
  qtRadiobutton:     { EN: 'Radio (single choice)',           NO: 'Radioknapp (velg ett)'            },
  qtCheckbox:        { EN: 'Checkbox (multiple choice)',      NO: 'Avkrysning (velg flere)'          },
  qtStringInput:     { EN: 'Text field',                      NO: 'Tekstfelt'                        },
  qtNumericInput:    { EN: 'Numeric field',                   NO: 'Tallfelt'                         },
  qtDateInput:       { EN: 'Date field',                      NO: 'Datofelt'                         },
  qtSlider:          { EN: 'Slider',                          NO: 'Skyver'                           },
  qtRank:            { EN: 'Ranking',                         NO: 'Rangering'                        },
  qtText:            { EN: 'Text block',                      NO: 'Tekstblokk'                       },
  qtCombobox:        { EN: 'Dropdown (combobox)',              NO: 'Nedtrekksliste (combobox)'        },
  qtImage:           { EN: 'Image',                           NO: 'Bilde'                            },
  qtCountry:         { EN: 'Country selector',                NO: 'Landvelger'                       },

  // ── General field labels ─────────────────────────────────────────────────────
  typeLabel:         { EN: 'Type',                            NO: 'Type'                             },
  required:          { EN: 'Required',                        NO: 'Påkrevd'                          },
  requiredAnswer:    { EN: 'Required answer',                 NO: 'Påkrevd svar'                     },
  questionText:      { EN: 'Question text',                   NO: 'Spørsmålstekst'                   },
  helpText:          { EN: 'Help text (optional)',            NO: 'Hjelpetekst (valgfritt)'           },
  noText:            { EN: 'No text',                         NO: 'Ingen tekst'                      },
  descriptionLabel:  { EN: 'Description',                     NO: 'Beskrivelse'                      },
  sourceLabel:       { EN: 'Source / origin',                 NO: 'Kilde / opprinnelse'              },
  deleteBtn:         { EN: 'Delete',                          NO: 'Slett'                            },
  noCode:            { EN: '(no code)',                       NO: '(ingen kode)'                     },
  noName:            { EN: '(no name)',                       NO: '(ingen navn)'                     },

  // ── Answer options ───────────────────────────────────────────────────────────
  optionsLabel:      { EN: 'Answer options',                  NO: 'Svaralternativer'                 },
  optionPlaceholder: { EN: 'Option text...',                  NO: 'Svaralternativ...'                },
  addOption:         { EN: 'Add option',                      NO: 'Legg til alternativ'              },
  inlineAnswer:      { EN: 'Inline answers',                  NO: 'Inline svar'                      },
  useTemplate:       { EN: 'Use response template',           NO: 'Bruk svarmal'                     },
  templateLabel:     { EN: 'Response template',               NO: 'Svarmal'                          },
  responseTpls:      { EN: 'Response templates',              NO: 'Svarmaler'                        },
  newResponseTpl:    { EN: '+ New template',                  NO: '+ Ny svarmal'                     },
  noResponseTpls:    { EN: 'No templates',                    NO: 'Ingen svarmaler'                  },
  newTplBtn:         { EN: 'New template',                    NO: 'Ny svarmal'                       },

  // ── Expressions ──────────────────────────────────────────────────────────────
  showQWhen:         { EN: 'Show question when...',           NO: 'Vis spørsmål når...'              },
  hideQWhen:         { EN: 'Hide question when...',           NO: 'Skjul spørsmål når...'            },
  continueWhen:      { EN: 'Continue to next section when...', NO: 'Fortsett til neste seksjon når...' },
  showSWhen:         { EN: 'Show section when...',            NO: 'Vis seksjon når...'               },
  hideSWhen:         { EN: 'Hide section when...',            NO: 'Skjul seksjon når...'             },
  continueSection:   { EN: 'Continue to next section when...', NO: 'Fortsett til neste seksjon når...' },
  opEq:              { EN: 'equals',                          NO: 'er lik'                           },
  opNeq:             { EN: 'does not equal',                  NO: 'er ikke lik'                      },
  opGt:              { EN: 'is greater than',                 NO: 'er større enn'                    },
  opGte:             { EN: 'is greater than or equal',        NO: 'er større enn eller lik'          },
  opLt:              { EN: 'is less than',                    NO: 'er mindre enn'                    },
  opLte:             { EN: 'is less than or equal',           NO: 'er mindre enn eller lik'          },
  opHasValue:        { EN: 'has answer',                      NO: 'har svar'                         },
  opNoValue:         { EN: 'has no answer',                   NO: 'mangler svar'                     },
  selectQuestion:    { EN: 'Select question...',              NO: 'Velg spørsmål...'                 },
  selectAnswer:      { EN: 'Select answer...',                NO: 'Velg svar...'                     },
  valuePlaceholder:  { EN: 'Value...',                        NO: 'Verdi...'                         },
  logicPrefix:       { EN: 'Logic:',                          NO: 'Logikk:'                          },
  logicAnd:          { EN: 'AND',                             NO: 'OG'                               },
  logicOr:           { EN: 'OR',                              NO: 'ELLER'                            },
  addCondition:      { EN: 'Add condition',                   NO: 'Legg til betingelse'              },

  // ── NumericInput / StringInput / Slider ──────────────────────────────────────
  maxField:          { EN: 'Max',                             NO: 'Maks'                             },
  decimals:          { EN: 'Decimals',                        NO: 'Desimaler'                        },
  sizeLabel:         { EN: 'Size',                            NO: 'Størrelse'                        },
  sizeSmall:         { EN: 'Small',                           NO: 'Liten'                            },
  sizeLarge:         { EN: 'Large',                           NO: 'Stor'                             },
  sizeXLarge:        { EN: 'Extra large',                     NO: 'Ekstra stor'                      },
  multiline:         { EN: 'Multi-line',                      NO: 'Flerlinjet'                       },
  textareaLabel:     { EN: 'Text area',                       NO: 'Tekstområde'                      },
  includeTime:       { EN: 'Include time',                    NO: 'Inkluder klokkeslett'             },
  stepLabel:         { EN: 'Step',                            NO: 'Steg'                             },
  minLabelField:     { EN: 'Min label',                       NO: 'Min-etikett'                      },
  maxLabelField:     { EN: 'Max label',                       NO: 'Maks-etikett'                     },
  unitLabel:         { EN: 'Unit',                            NO: 'Enhet'                            },
  reversedScore:     { EN: 'Reversed score',                  NO: 'Reversert skår'                   },
  voluntaryQ:        { EN: 'Voluntary (optional)',             NO: 'Frivillig (valgfritt)'            },
  readonlyQ:         { EN: 'Read only',                       NO: 'Skrivebeskyttet'                  },

  // ── Section / questionnaire structure ────────────────────────────────────────
  sectionTitle:      { EN: 'Section title...',                NO: 'Seksjonstittel...'                },
  stNormal:          { EN: 'Normal',                          NO: 'Normal'                           },
  stRepeated:        { EN: 'Repeated',                        NO: 'Repetert'                         },
  stConditional:     { EN: 'Conditional',                     NO: 'Betinget'                         },
  sectionTypeLabel:  { EN: 'Section type',                    NO: 'Seksjonstype'                     },
  repeatCodePH:      { EN: 'repeat-code',                     NO: 'repeat-kode'                      },
  repetitionCode:    { EN: 'Repetition code',                 NO: 'Repetisjons-kode'                 },
  questionsQ:        { EN: 'q',                               NO: 'spm'                              },
  addLabel:          { EN: 'Add:',                            NO: 'Legg til:'                        },
  selectQType:       { EN: 'Select question type...',         NO: 'Velg spørsmålstype...'            },
  subsection:        { EN: 'Subsection',                      NO: 'Underseksjon'                     },
  addSection:        { EN: 'Add section',                     NO: 'Legg til seksjon'                 },
  previewPanel:      { EN: 'Preview',                         NO: 'Forhåndsvisning'                  },
  previewHint:       { EN: '— as the respondent sees it',     NO: '— slik respondenten ser det'      },

  // ── Flags ────────────────────────────────────────────────────────────────────
  severity:          { EN: 'Severity',                        NO: 'Alvorlighetsgrad'                 },
  flagNameMsg:       { EN: 'Name / message',                  NO: 'Navn / melding'                   },
  conditions:        { EN: 'Conditions',                      NO: 'Betingelser'                      },
  allConditions:     { EN: 'All must apply (AND)',             NO: 'Alle må gjelde (OG)'              },
  anyCondition:      { EN: 'At least one must apply (OR)',     NO: 'Minst én må gjelde (ELLER)'       },
  noConditions:      { EN: 'No conditions yet',               NO: 'Ingen betingelser ennå'           },
  flagsHeader:       { EN: 'Flags',                           NO: 'Flagg'                            },
  flagsSubtitle:     { EN: 'Score-based alerts',              NO: 'Skårbaserte varsler'              },
  noFlags:           { EN: 'No flags yet',                    NO: 'Ingen flagg ennå'                 },
  newFlag:           { EN: 'New flag',                        NO: 'Nytt flagg'                       },
  selectOrCreateFlag: { EN: 'Select or create a flag',        NO: 'Velg eller opprett et flagg'      },
  selectCalc:        { EN: 'Select calculation...',           NO: 'Velg beregning...'                },
  flagWarning:       { EN: 'Warning',                         NO: 'Advarsel'                         },
  flagCritical:      { EN: 'Critical',                        NO: 'Kritisk'                          },

  // ── Norms ────────────────────────────────────────────────────────────────────
  normTypeTScore:    { EN: 'Norm (T-score)',                   NO: 'Norm (T-skår)'                    },
  normTypePerc:      { EN: 'Percentile',                      NO: 'Persentil'                        },
  normTypeZ:         { EN: 'Z-score',                         NO: 'Z-skår'                           },
  lookupTable:       { EN: 'Lookup table (raw score → norm value)', NO: 'Oppslagstabell (rå skår → norm verdi)' },
  zscoreMean:        { EN: 'Population mean',                 NO: 'Populasjonsgjennomsnitt'          },
  zscoreStdDev:      { EN: 'Standard deviation (SD)',         NO: 'Standardavvik (SD)'               },
  ageCol:            { EN: 'Age',                             NO: 'Alder'                            },
  genderCol:         { EN: 'Gender',                          NO: 'Kjønn'                            },
  pasteData:         { EN: 'Paste data',                      NO: 'Lim inn data'                     },
  cancelBtn:         { EN: 'Cancel',                          NO: 'Avbryt'                           },
  rawScore:          { EN: 'Raw score',                       NO: 'Rå skår'                          },
  noRows:            { EN: 'No rows yet',                     NO: 'Ingen rader ennå'                 },
  addRow:            { EN: 'Add row',                         NO: 'Legg til rad'                     },
  normsHeader:       { EN: 'Norms',                           NO: 'Normer'                           },
  normsSubtitle:     { EN: 'Normative lookup tables',         NO: 'Normative oppslagstabeller'       },
  noNorms:           { EN: 'No norms yet',                    NO: 'Ingen normer ennå'                },
  newNormBtn:        { EN: 'New norm',                        NO: 'Ny norm'                          },
  selectOrCreateNorm: { EN: 'Select or create a norm',        NO: 'Velg eller opprett en norm'       },
  rowsLabel:         { EN: 'rows',                            NO: 'rader'                            },

  // ── Calculations ─────────────────────────────────────────────────────────────
  calcTypeMean:      { EN: 'Mean',                            NO: 'Gjennomsnitt'                     },
  calcTypeCount:     { EN: 'Count',                           NO: 'Antall'                           },
  calcTypeCustom:    { EN: 'Custom',                          NO: 'Egendefinert'                     },
  importedFormula:   { EN: 'Formula (imported)',              NO: 'Formel (importert)'               },
  editCalc:          { EN: 'Edit calculation',                NO: 'Rediger beregning'                },
  noFormula:         { EN: 'No formula available',            NO: 'Ingen formel tilgjengelig'        },
  newCalcPH:         { EN: 'new calculation',                 NO: 'ny beregning'                     },
  includedQuestions: { EN: 'Included questions',              NO: 'Spørsmål som inngår'              },
  addQuestion:       { EN: 'Add question',                    NO: 'Legg til spørsmål'                },
  formulaLabel:      { EN: 'Formula',                         NO: 'Formel'                           },
  customFormula:     { EN: 'Custom formula',                  NO: 'Egendefinert formel'              },
  remoteScoringLabel: { EN: 'External scoring (remote scoring)', NO: 'Ekstern scoring (remote scoring)' },
  serviceCode:       { EN: 'Service code',                    NO: 'Tjenestekode'                     },
  parametersLabel:   { EN: 'Parameters (key=value, one per line)', NO: 'Parametere (nøkkel=verdi, én per linje)' },
  linkedNorm:        { EN: 'Linked norm (optional)',          NO: 'Tilknyttet norm (valgfritt)'      },
  noNormOption:      { EN: '— No norm —',                     NO: '— Ingen norm —'                   },
  calcsHeader:       { EN: 'Scoring calculations',            NO: 'Scoringsberegninger'              },
  noCalcs:           { EN: 'No calculations. Import a package or add manually.', NO: 'Ingen beregninger. Importer en pakke eller legg til manuelt.' },
  addCalcBtn:        { EN: 'Add calculation',                 NO: 'Legg til beregning'               },
  closeEdit:         { EN: 'Close editing',                   NO: 'Lukk redigering'                  },

  // ── Dimensions ───────────────────────────────────────────────────────────────
  dimsHeader:        { EN: 'Dimensions',                      NO: 'Dimensjoner'                      },
  noDims:            { EN: 'No dimensions defined',           NO: 'Ingen dimensjoner definert'       },
  newDimBtn:         { EN: 'New dimension',                   NO: 'Ny dimensjon'                     },
  addDimBtn:         { EN: 'Add dimension',                   NO: 'Legg til dimensjon'               },
  newDimPH:          { EN: 'new dimension',                   NO: 'ny dimensjon'                     },
  filterCodes:       { EN: 'Filter codes...',                 NO: 'Filtrer koder...'                 },
  noQuestions:       { EN: 'No questions',                    NO: 'Ingen spørsmål'                   },

  // ── Metadata ─────────────────────────────────────────────────────────────────
  qtTypeQuestionnaire: { EN: 'Questionnaire',                 NO: 'Kartlegging'                      },
  qtTypeScale:       { EN: 'Scale',                           NO: 'Skala'                            },
  qtTypeExercise:    { EN: 'Exercise',                        NO: 'Øvelse'                           },
  metaReadOnly:      { EN: 'Package info (read only)',        NO: 'Pakkeinformasjon (kun lesing)'    },
  metaEdit:          { EN: 'Edit package info',               NO: 'Rediger pakkeinformasjon'         },
  defaultLanguage:   { EN: 'Default language',                NO: 'Standardspråk'                    },
  packageCode:       { EN: 'Package code',                    NO: 'Pakkekode'                        },
  requiredSkillsLabel: { EN: 'Required skills',               NO: 'Påkrevde ferdigheter'             },
  clinicianOnly:     { EN: 'Clinician only',                  NO: 'Kun kliniker'                     },
  publicPackage:     { EN: 'Public package',                  NO: 'Offentlig pakke'                  },
  packageSection:    { EN: 'Package',                         NO: 'Pakke'                            },
  visualizeProgress: { EN: 'Progress indicator',              NO: 'Fremdriftsindikator'              },
  vpPercentage:      { EN: 'Percentage',                      NO: 'Prosent'                          },
  vpSteps:           { EN: 'Steps',                           NO: 'Steg'                             },
  vpNone:            { EN: 'None',                            NO: 'Ingen'                            },

  // ── Package Explorer ─────────────────────────────────────────────────────
  explorerTitle:     { EN: 'Package Explorer',    NO: 'Pakke-utforsker'                  },
  newResource:       { EN: 'New resource',         NO: 'Ny ressurs'                       },
  newReport:         { EN: 'New report',           NO: 'Ny rapport'                       },
  newTranslation:    { EN: 'New translation',      NO: 'Ny oversettelse'                  },
  closePackage:      { EN: 'Close package',        NO: 'Lukk pakke'                       },
  noPackagesOpen:    { EN: 'No packages open.',    NO: 'Ingen pakker åpne.'               },
  createNew:         { EN: 'Create new',           NO: 'Lag ny'                           },
  unsaved:           { EN: 'Unsaved',              NO: 'Ulagret'                          },

  // ── Generate codes ────────────────────────────────────────────────────────
  generateCodes:     { EN: 'Generate codes',                  NO: 'Generer koder'                    },
  codesGenerated:    { EN: 'codes generated',                 NO: 'koder generert'                   },

  // ── Validation panel ──────────────────────────────────────────────────────
  validationErrors:  { EN: 'error',                           NO: 'feil'                             },
  validationErrorsPlural: { EN: 'errors',                    NO: 'feil'                             },
  validationWarnings: { EN: 'warning',                        NO: 'advarsel'                         },
  validationWarningsPlural: { EN: 'warnings',                 NO: 'advarsler'                        },
  validationPanel:   { EN: 'Validation',                      NO: 'Validering'                       },
  validationOk:      { EN: 'No issues found',                 NO: 'Ingen problemer funnet'           },

  // ── TranslationEditor ─────────────────────────────────────────────────────
  stringsLabel:      { EN: 'strings',                         NO: 'strenger'                         },
  missingLabel:      { EN: 'missing',                         NO: 'mangler'                          },
  allTranslated:     { EN: 'All translated',                  NO: 'Alle oversatt'                    },
  addLanguage:       { EN: '+ Add language',                  NO: '+ Legg til språk'                 },
  contextCol:        { EN: 'Context',                         NO: 'Kontekst'                         },
  defaultLangBadge:  { EN: '(default)',                       NO: '(standard)'                       },
  translatingLabel:  { EN: 'Translating…',                    NO: 'Oversetter…'                      },

  // ── Auto-save / session restore ───────────────────────────────────────────
  sessionRestoreMsg: { EN: 'You have {n} package(s) from a previous session.',  NO: 'Du har {n} pakke(r) fra forrige sesjon.' },
  sessionRestore:    { EN: 'Restore',                         NO: 'Gjenopprett'                      },
  sessionDismiss:    { EN: 'Dismiss',                         NO: 'Avvis'                            },

  // ── Recently opened ───────────────────────────────────────────────────────
  recentlyOpened:    { EN: 'Recently opened',                 NO: 'Nylig åpnede'                     },

  // ── Clear cache ───────────────────────────────────────────────────────────
  clearCache:        { EN: 'Clear cache',                     NO: 'Tøm cache'                        },
  cacheClearedOk:    { EN: 'Cache cleared',                   NO: 'Cache tømt'                       },
  cacheClearedErr:   { EN: 'Cache error',                     NO: 'Cache-feil'                       },

  // ── Print / PDF dialog ────────────────────────────────────────────────────
  printPdf:          { EN: 'Print / PDF',                     NO: 'Skriv ut / PDF'                   },
  printDialogTitle:  { EN: 'Print questionnaire',             NO: 'Skriv ut kartlegging'             },
  printLanguage:     { EN: 'Language',                        NO: 'Språk'                            },
  printExpertMode:   { EN: 'Expert mode (show question codes)', NO: 'Ekspertmodus (vis spørsmålskoder)' },
  printBtn:          { EN: 'Print',                           NO: 'Skriv ut'                         },
  printCancel:       { EN: 'Cancel',                          NO: 'Avbryt'                           },
} as const;

export type StringKey = keyof typeof strings;

export function t(key: StringKey, lang: UILang): string {
  return strings[key][lang];
}

export const ALL_STRINGS = strings;
