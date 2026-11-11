import type { PackageMetadata, Questionnaire, QuestionnaireType } from '../../types/questionnaire';
import { t, useUILang } from '../../i18n';
import { RemoteScoringEditor } from './RemoteScoringEditor';

interface Props {
  questionnaire: Questionnaire;
  packageMetadata?: PackageMetadata;
  onChange?: (q: Questionnaire, pm?: PackageMetadata) => void;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-cw-gray-text mb-1">{label}</label>
      {children}
    </div>
  );
}

const INPUT = 'w-full border border-cw-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cw-blue/30';

export function MetadataEditor({ questionnaire, packageMetadata, onChange }: Props) {
  const uiLang = useUILang();
  const lang = questionnaire.defaultLanguage;
  const readOnly = !onChange;

  const questionnaireTypes: Array<{ value: QuestionnaireType; label: string }> = [
    { value: 'QUESTIONNAIRE', label: t('qtTypeQuestionnaire', uiLang) },
    { value: 'SCALE',         label: t('qtTypeScale', uiLang) },
    { value: 'EXERCISE',      label: t('qtTypeExercise', uiLang) },
  ];

  function updateQ(patch: Partial<Questionnaire>) {
    onChange?.({ ...questionnaire, ...patch }, packageMetadata);
  }

  function updatePM(patch: Partial<PackageMetadata>) {
    const base = packageMetadata ?? { code: questionnaire.code, isPublic: false };
    onChange?.(questionnaire, { ...base, ...patch });
  }

  return (
    <div className="flex flex-col h-full overflow-hidden min-w-0 min-h-0">
      <div className="bg-white border-b border-cw-border px-4 py-3 shrink-0">
        <h2 className="text-sm font-semibold text-cw-blue">{t('tabMetadata', uiLang)}</h2>
        <p className="text-xs text-cw-gray-text mt-0.5">
          {readOnly ? t('metaReadOnly', uiLang) : t('metaEdit', uiLang)}
        </p>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">

        {/* ── Assessment ── */}
        <section>
          <h3 className="text-xs font-semibold text-cw-gray-text uppercase tracking-wide mb-3">
            {t('tabQuiz', uiLang)}
          </h3>
          <div className="bg-white border border-cw-border rounded-lg p-4 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <Field label={t('code', uiLang)}>
                <input
                  value={questionnaire.code}
                  onChange={(e) => updateQ({ code: e.target.value })}
                  readOnly={readOnly}
                  className={INPUT + (readOnly ? ' bg-cw-gray text-cw-gray-text font-mono' : ' font-mono')}
                />
              </Field>
              <Field label={t('version', uiLang)}>
                <input
                  value={questionnaire.version}
                  onChange={(e) => updateQ({ version: e.target.value })}
                  readOnly={readOnly}
                  className={INPUT + (readOnly ? ' bg-cw-gray' : '')}
                />
              </Field>
              <Field label={t('release', uiLang)}>
                <input
                  value={questionnaire.release ?? ''}
                  onChange={(e) => updateQ({ release: e.target.value || undefined })}
                  readOnly={readOnly}
                  placeholder="0"
                  className={INPUT + (readOnly ? ' bg-cw-gray' : '')}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label={t('typeLabel', uiLang)}>
                {readOnly ? (
                  <input value={questionnaire.type} readOnly className={INPUT + ' bg-cw-gray'} />
                ) : (
                  <select
                    value={questionnaire.type}
                    onChange={(e) => updateQ({ type: e.target.value as QuestionnaireType })}
                    className={INPUT}
                  >
                    {questionnaireTypes.map((qt) => (
                      <option key={qt.value} value={qt.value}>{qt.label}</option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label={t('defaultLanguage', uiLang)}>
                <input
                  value={questionnaire.defaultLanguage}
                  readOnly
                  className={INPUT + ' bg-cw-gray font-mono'}
                />
              </Field>
            </div>

            <Field label={`${t('name', uiLang)} (${lang})`}>
              <input
                value={questionnaire.name[lang] ?? ''}
                onChange={(e) =>
                  updateQ({ name: { ...questionnaire.name, [lang]: e.target.value } })
                }
                readOnly={readOnly}
                className={INPUT + (readOnly ? ' bg-cw-gray' : '')}
              />
            </Field>

            <Field label={`${t('descriptionLabel', uiLang)} (${lang})`}>
              <textarea
                value={questionnaire.description?.[lang] ?? ''}
                onChange={(e) =>
                  updateQ({
                    description: {
                      ...(questionnaire.description ?? {}),
                      [lang]: e.target.value,
                    } as Record<string, string>,
                  })
                }
                readOnly={readOnly}
                rows={2}
                className={INPUT + ' resize-none' + (readOnly ? ' bg-cw-gray' : '')}
                placeholder={t('optionalDescription', uiLang)}
              />
            </Field>

            <Field label={t('copyrightField', uiLang)}>
              <input
                value={questionnaire.copyright ?? ''}
                onChange={(e) => updateQ({ copyright: e.target.value || undefined })}
                readOnly={readOnly}
                className={INPUT + (readOnly ? ' bg-cw-gray' : '')}
                placeholder="© 2024 Checkware AS"
              />
              <p className="text-[11px] text-cw-gray-text mt-0.5">
                {t('copyrightHint', uiLang)}
              </p>
            </Field>

            <div className="pt-1 border-t border-cw-border">
              <p className="text-xs text-cw-gray-text">
                {t('supportedLanguages', uiLang)}: <span className="font-mono">{questionnaire.supportedLanguages.join(', ')}</span>
                {' · '}
                {t('sections', uiLang)}: <span className="font-mono">{questionnaire.sections.length}</span>
                {questionnaire.dimensions?.length ? (
                  <>{' · '}{t('dimsHeader', uiLang)}: <span className="font-mono">{questionnaire.dimensions.length}</span></>
                ) : null}
              </p>
            </div>
          </div>
        </section>

        {/* ── Package (manifest) ── */}
        <section>
          <h3 className="text-xs font-semibold text-cw-gray-text uppercase tracking-wide mb-3">
            {t('packageSection', uiLang)}
          </h3>
          <div className="bg-white border border-cw-border rounded-lg p-4 space-y-3">
            <Field label={t('packageCode', uiLang)}>
              <input
                value={packageMetadata?.code ?? questionnaire.code}
                onChange={(e) => updatePM({ code: e.target.value })}
                readOnly={readOnly}
                className={INPUT + (readOnly ? ' bg-cw-gray font-mono' : ' font-mono')}
              />
            </Field>

            <Field label={t('descriptionLabel', uiLang)}>
              <textarea
                value={packageMetadata?.description ?? ''}
                onChange={(e) => updatePM({ description: e.target.value })}
                readOnly={readOnly}
                rows={2}
                className={INPUT + ' resize-none' + (readOnly ? ' bg-cw-gray' : '')}
                placeholder={t('packageDescriptionPh', uiLang)}
              />
            </Field>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={packageMetadata?.requiredSkills === 'CLINICIAN' || questionnaire.clinicianOnly === true}
                onChange={(e) => {
                  updatePM({ requiredSkills: e.target.checked ? 'CLINICIAN' : '' });
                  onChange?.({ ...questionnaire, clinicianOnly: e.target.checked || undefined }, packageMetadata);
                }}
                disabled={readOnly}
                className="w-4 h-4 accent-cw-blue"
              />
              <span className="text-sm text-cw-gray-text">{t('clinicianOnly', uiLang)}</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={packageMetadata?.isPublic ?? false}
                onChange={(e) => updatePM({ isPublic: e.target.checked })}
                disabled={readOnly}
                className="w-4 h-4 accent-cw-blue"
              />
              <span className="text-sm text-cw-gray-text">{t('publicPackage', uiLang)}</span>
            </label>
          </div>
        </section>

        {/* ── Navigasjon og visning ── */}
        <section>
          <details className="group">
            <summary className="list-none cursor-pointer flex items-center gap-2 text-xs font-semibold text-cw-gray-text uppercase tracking-wide mb-3 select-none">
              <span className="group-open:rotate-90 transition-transform inline-block">&#9654;</span>
              {t('navigationDisplay', uiLang)}
            </summary>
            <div className="bg-white border border-cw-border rounded-lg p-4 space-y-3">
              <Field label={t('visualizeProgress', uiLang)}>
                {readOnly ? (
                  <input value={questionnaire.visualizeProgress ?? 'Percentage'} readOnly className={INPUT + ' bg-cw-gray'} />
                ) : (
                  <select
                    value={questionnaire.visualizeProgress ?? 'Percentage'}
                    onChange={(e) => updateQ({ visualizeProgress: e.target.value as Questionnaire['visualizeProgress'] })}
                    className={INPUT}
                  >
                    <option value="Percentage">{t('vpPercentage', uiLang)}</option>
                    <option value="Steps">{t('vpSteps', uiLang)}</option>
                    <option value="None">{t('vpNone', uiLang)}</option>
                  </select>
                )}
              </Field>

              <div className="space-y-2 pt-1">
                {(
                  [
                    { field: 'allowTOC',               label: t('showToc', uiLang)          },
                    { field: 'restrictBackButton',      label: t('hideBack', uiLang)                 },
                    { field: 'allowSingleBackButton',   label: t('allowOneStepBack', uiLang)           },
                    { field: 'unresponsiveUI',          label: t('nonResponsive', uiLang) },
                    { field: 'authorizedDevicesOnly',   label: t('authorizedDevices', uiLang)          },
                    { field: 'exportAllowed',           label: t('allowDataExport', uiLang)                },
                  ] as Array<{ field: keyof Questionnaire; label: string }>
                ).map(({ field, label }) => (
                  <label key={field} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!(questionnaire[field])}
                      onChange={(e) => updateQ({ [field]: e.target.checked || undefined })}
                      disabled={readOnly}
                      className="w-4 h-4 accent-cw-blue"
                    />
                    <span className="text-sm text-cw-gray-text">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </details>
        </section>

        {/* ── Remote Scoring ── */}
        {!readOnly && (
          <section>
            <details className="group">
              <summary className="list-none cursor-pointer flex items-center gap-2 text-xs font-semibold text-cw-gray-text uppercase tracking-wide mb-3 select-none">
                <span className="group-open:rotate-90 transition-transform inline-block">&#9654;</span>
                {t('remoteScoringLabel', uiLang)}
              </summary>
              <RemoteScoringEditor questionnaire={questionnaire} onChange={(q) => onChange?.(q, packageMetadata)} />
            </details>
          </section>
        )}
      </div>
    </div>
  );
}
