import * as Dialog from '@radix-ui/react-dialog';
import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle, Upload, XCircle } from 'lucide-react';
import type { Questionnaire, MediaFile, PackageMetadata } from '../../types/questionnaire';
import { buildPackageZip } from '../../services/package-builder';
import { importPackageFiles } from '../../services/package-import';
import { compareVersions, findPreviousVersion, type VersionChange } from '../../services/version-diff';
import { storeApi, type PackageSummary } from '../../services/store-api';
import type { RapLintIssue } from '../../services/rap-interpreter';
import { useSettingsStore } from '../../stores/settings-store';
import { t, tf, useUILang } from '../../i18n';

interface Props {
  open: boolean;
  onClose: () => void;
  questionnaire: Questionnaire;
  rapFiles?: Record<string, string>;
  mediaFiles?: MediaFile[];
  packageMetadata?: PackageMetadata;
}

type Step = 'form' | 'validating' | 'valid' | 'publishing' | 'done' | 'error';

export function PublishDialog({ open, onClose, questionnaire, rapFiles, mediaFiles, packageMetadata }: Props) {
  const uiLang = useUILang();
  const { settings } = useSettingsStore();
  const lang = questionnaire.defaultLanguage;

  const [release, setRelease] = useState(questionnaire.release ?? '0');
  const [isPublic, setIsPublic] = useState(false);
  const [step, setStep] = useState<Step>('form');
  const [denials, setDenials] = useState<string[]>([]);
  const [calcWarnings, setCalcWarnings] = useState<string[]>([]);
  const [rapWarnings, setRapWarnings] = useState<string[]>([]);
  const [frameWarnings, setFrameWarnings] = useState<string[]>([]);
  const [mediaErrors, setMediaErrors] = useState<string[]>([]);
  const [rapLint, setRapLint] = useState<Record<string, RapLintIssue[]>>({});
  const [versionChanges, setVersionChanges] = useState<VersionChange[]>([]);
  const [versionCheckFailed, setVersionCheckFailed] = useState(false);
  const [error, setError] = useState('');
  const [existingPackages, setExistingPackages] = useState<PackageSummary[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);
  // Samme kode og synlighet i SOAP-identifier og manifest
  const pkgCode = packageMetadata?.code || questionnaire.code;
  const pkgMeta = { ...packageMetadata, code: pkgCode, isPublic };

  useEffect(() => {
    if (!open) return;
    setRelease(questionnaire.release ?? '0');
    setStep('form');
    setDenials([]);
    setCalcWarnings([]);
    setRapWarnings([]);
    setVersionChanges([]);
    setVersionCheckFailed(false);
    setError('');
    setLoadingPackages(true);
    storeApi.listPackages(settings)
      .then(setExistingPackages)
      .catch(() => {})
      .finally(() => setLoadingPackages(false));
  }, [open, settings]);

  const overlap = existingPackages.find(
    (p) =>
      p.code === pkgCode &&
      String(p.version) === String(questionnaire.version) &&
      String(p.release) === String(release),
  );

  const previous = findPreviousVersion(existingPackages, pkgCode, String(questionnaire.version), String(release));
  const previousLabel = previous ? `${previous.version}.${previous.release}` : '';

  /** Sammenligner med forrige versjon i store. Varsler bare – stopper aldri publiseringen. */
  async function checkPreviousVersion() {
    setVersionChanges([]);
    setVersionCheckFailed(false);
    if (!previous) return;
    try {
      const prevPkg = await storeApi.getPackage(settings, previous.uid);
      const prevQ = importPackageFiles(prevPkg.files).questionnaire;
      setVersionChanges(compareVersions(prevQ, questionnaire));
    } catch {
      setVersionCheckFailed(true);
    }
  }

  async function handleValidate() {
    setStep('validating');
    setDenials([]);
    try {
      const q = { ...questionnaire, release };
      await checkPreviousVersion();
      const pkg = await buildPackageZip(q, rapFiles, mediaFiles, pkgMeta);
      setCalcWarnings(pkg.calcsMissingQuestionnaireRef);
      setRapWarnings(pkg.rapsMissingHeaders);
      setFrameWarnings(pkg.rapsMissingFrame);
      setMediaErrors(pkg.unsupportedMedia);
      setRapLint(pkg.rapLint);
      if (pkg.unsupportedMedia.length > 0) {
        // Stopp før validering: Checkware installerer filene, men kan ikke levere dem
        setStep('form');
        return;
      }
      const result = await storeApi.validate(settings, {
        code: pkgCode,
        name: q.name[lang] ?? q.code,
        version: q.version,
        release,
        isPublic,
        base64Zip: pkg.base64,
        fileName: pkg.fileName,
        sizeBytes: pkg.sizeBytes,
        files: pkg.files,
      });
      if (result.allowed) {
        setStep('valid');
      } else {
        setDenials(result.denials);
        setStep('form');
      }
    } catch (err: any) {
      setError(err.message);
      setStep('error');
    }
  }

  async function handlePublish() {
    setStep('publishing');
    try {
      const q = { ...questionnaire, release };
      const pkg = await buildPackageZip(q, rapFiles, mediaFiles, pkgMeta);
      if (pkg.unsupportedMedia.length > 0) {
        setMediaErrors(pkg.unsupportedMedia);
        setStep('form');
        return;
      }
      const result = await storeApi.publish(settings, {
        code: pkgCode,
        name: q.name[lang] ?? q.code,
        version: q.version,
        release,
        isPublic,
        base64Zip: pkg.base64,
        fileName: pkg.fileName,
        sizeBytes: pkg.sizeBytes,
        files: pkg.files,
      });
      setStep(result.success ? 'done' : 'error');
      if (!result.success) setError(t('publishRejected', uiLang));
    } catch (err: any) {
      setError(err.message);
      setStep('error');
    }
  }

  function reset() {
    setStep('form');
    setDenials([]);
    setError('');
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Dialog.Content aria-describedby={undefined} className="cw-dialog fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl w-[500px] p-4 sm:p-6 z-50 overflow-y-auto">
          <Dialog.Title className="text-lg font-semibold text-cw-blue mb-4 flex items-center gap-2">
            <Upload className="w-5 h-5" /> {t('publishToStore', uiLang)}
          </Dialog.Title>

          {/* Package info */}
          <div className="bg-cw-gray rounded p-3 mb-4 text-sm space-y-1">
            <div><span className="text-cw-gray-text">{t('code', uiLang)}:</span> <span className="font-mono">{questionnaire.code}</span></div>
            <div><span className="text-cw-gray-text">{t('name', uiLang)}:</span> {questionnaire.name[lang]}</div>
            <div><span className="text-cw-gray-text">{t('version', uiLang)}:</span> {questionnaire.version}</div>
          </div>

          {step === 'done' ? (
            <div className="text-center py-6">
              <CheckCircle className="w-12 h-12 text-cw-positive mx-auto mb-3" />
              <p className="text-cw-positive font-medium">{t('published', uiLang)}</p>
              <button onClick={() => { reset(); onClose(); }} className="mt-4 px-4 py-2 bg-cw-blue text-white rounded text-sm">{t('close', uiLang)}</button>
            </div>
          ) : step === 'error' ? (
            <div className="text-center py-6">
              <XCircle className="w-12 h-12 text-cw-negative mx-auto mb-3" />
              <p className="text-cw-negative text-sm">{error}</p>
              <button onClick={reset} className="mt-4 px-4 py-2 border border-cw-border rounded text-sm">{t('retry', uiLang)}</button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-cw-gray-text mb-1">{t('release', uiLang)}</label>
                  <input
                    type="text"
                    value={release}
                    onChange={(e) => { setRelease(e.target.value); setStep('form'); setDenials([]); }}
                    className="w-full border border-cw-border rounded px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-cw-gray-text mb-1">{t('visibility', uiLang)}</label>
                  <label className="flex items-center gap-2 mt-2">
                    <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="w-4 h-4 accent-cw-blue" />
                    <span className="text-sm">{t('isPublic', uiLang)}</span>
                  </label>
                </div>
              </div>

              {overlap && (
                <div className="bg-cw-orange-soft border border-cw-orange/40 rounded p-3 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-cw-orange mt-0.5 shrink-0" />
                  <p className="text-xs text-cw-orange">
                    {tf('versionExists', uiLang, { version: `${questionnaire.version}.${release}`, code: questionnaire.code })}
                  </p>
                </div>
              )}

              {calcWarnings.length > 0 && (
                <div className="bg-cw-orange-soft border border-cw-orange/40 rounded p-3 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-cw-orange mt-0.5 shrink-0" />
                  <p className="text-xs text-cw-orange">
                    {tf('calcMissingQuestionnaireRef', uiLang, { codes: calcWarnings.join(', ') })}
                  </p>
                </div>
              )}

              {rapWarnings.length > 0 && (
                <div className="bg-cw-orange-soft border border-cw-orange/40 rounded p-3 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-cw-orange mt-0.5 shrink-0" />
                  <p className="text-xs text-cw-orange">
                    {tf('rapMissingHeaders', uiLang, { codes: rapWarnings.join(', ') })}
                  </p>
                </div>
              )}

              {frameWarnings.length > 0 && (
                <div className="bg-cw-orange-soft border border-cw-orange/40 rounded p-3 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-cw-orange mt-0.5 shrink-0" />
                  <p className="text-xs text-cw-orange">
                    {tf('rapMissingFrame', uiLang, { codes: frameWarnings.join(', ') })}
                  </p>
                </div>
              )}

              {Object.keys(rapLint).length > 0 && (
                <div className="bg-cw-orange-soft border border-cw-orange/40 rounded p-3 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-cw-orange mt-0.5 shrink-0" />
                  <div className="text-xs text-cw-orange">
                    <p className="font-medium">{t('rapLintTitle', uiLang)}</p>
                    <ul className="mt-1 space-y-0.5">
                      {Object.entries(rapLint).flatMap(([code, issues]) => issues.map((iss, i) => (
                        <li key={`${code}-${i}`}>• {code}{iss.line > 0 ? ` (${tf('rapLintLine', uiLang, { line: iss.line })})` : ''}: {t(`rapLint_${iss.code}`, uiLang)}</li>
                      )))}
                    </ul>
                  </div>
                </div>
              )}

              {versionChanges.length > 0 && (
                <div className="bg-cw-orange-soft border border-cw-orange/40 rounded p-3 flex items-start gap-2" data-testid="version-changes">
                  <AlertTriangle className="w-4 h-4 text-cw-orange mt-0.5 shrink-0" />
                  <div className="text-xs text-cw-orange">
                    <p className="font-medium">{tf('versionChangesTitle', uiLang, { version: previousLabel })}</p>
                    <ul className="mt-1 space-y-0.5 max-h-40 overflow-y-auto">
                      {versionChanges.map((c, i) => (
                        <li key={`${c.kind}-${c.code}-${c.option ?? ''}-${i}`} className="font-mono">
                          • {tf(`versionChange_${c.kind}`, uiLang, { code: c.code, option: c.option ?? '', from: c.from ?? '', to: c.to ?? '' })}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1">{t('versionChangesHint', uiLang)}</p>
                  </div>
                </div>
              )}

              {versionCheckFailed && (
                <div className="bg-cw-gray border border-cw-border rounded p-3 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-cw-gray-text mt-0.5 shrink-0" />
                  <p className="text-xs text-cw-gray-text">{tf('versionCheckFailed', uiLang, { version: previousLabel })}</p>
                </div>
              )}

              {mediaErrors.length > 0 && (
                <div className="bg-cw-negative-soft border border-cw-negative/30 rounded p-3 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-cw-negative mt-0.5 shrink-0" />
                  <p className="text-xs text-cw-negative">
                    {tf('unsupportedMedia', uiLang, { files: mediaErrors.join(', ') })}
                  </p>
                </div>
              )}

              {denials.length > 0 && (
                <div className="bg-cw-negative-soft border border-cw-negative/30 rounded p-3">
                  <p className="text-xs font-medium text-cw-negative mb-1">{t('validationErrorsLabel', uiLang)}</p>
                  <ul className="text-xs text-cw-negative space-y-0.5">
                    {denials.map((d, i) => <li key={i}>• {d}</li>)}
                  </ul>
                </div>
              )}

              {step === 'valid' && (
                <div className="bg-cw-positive-soft border border-cw-positive/30 rounded p-3 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-cw-positive" />
                  <span className="text-sm text-cw-positive">{t('validationOkPublish', uiLang)}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => { reset(); onClose(); }} className="px-4 py-2 text-sm border border-cw-border rounded hover:bg-cw-gray">{t('cancelBtn', uiLang)}</button>
                {step !== 'valid' ? (
                  <button
                    onClick={handleValidate}
                    disabled={step === 'validating' || !questionnaire.code || loadingPackages || !!overlap}
                    className="px-4 py-2 text-sm bg-cw-blue-light text-white rounded hover:opacity-90 disabled:opacity-50"
                  >
                    {step === 'validating' ? t('validating', uiLang) : loadingPackages ? t('loading', uiLang) : t('validate', uiLang)}
                  </button>
                ) : (
                  <button
                    onClick={handlePublish}
                    className="px-4 py-2 text-sm bg-cw-blue text-white rounded hover:bg-cw-blue-light"
                  >
                    {t('publish', uiLang)}
                  </button>
                )}
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
