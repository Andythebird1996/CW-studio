import * as Dialog from '@radix-ui/react-dialog';
import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle, Upload, XCircle } from 'lucide-react';
import type { Questionnaire, MediaFile, PackageMetadata } from '../../types/questionnaire';
import { buildPackageZip } from '../../services/package-builder';
import { storeApi, type PackageSummary } from '../../services/store-api';
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
  const [error, setError] = useState('');
  const [existingPackages, setExistingPackages] = useState<PackageSummary[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRelease(questionnaire.release ?? '0');
    setStep('form');
    setDenials([]);
    setError('');
    setLoadingPackages(true);
    storeApi.listPackages(settings)
      .then(setExistingPackages)
      .catch(() => {})
      .finally(() => setLoadingPackages(false));
  }, [open, settings]);

  const overlap = existingPackages.find(
    (p) =>
      p.code === questionnaire.code &&
      String(p.version) === String(questionnaire.version) &&
      String(p.release) === String(release),
  );

  async function handleValidate() {
    setStep('validating');
    setDenials([]);
    try {
      const q = { ...questionnaire, release };
      const pkg = await buildPackageZip(q, rapFiles, mediaFiles, packageMetadata);
      const result = await storeApi.validate(settings, {
        code: q.code,
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
      const pkg = await buildPackageZip(q, rapFiles, mediaFiles, packageMetadata);
      const result = await storeApi.publish(settings, {
        code: q.code,
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
        <Dialog.Content aria-describedby={undefined} className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl w-[500px] p-6 z-50">
          <Dialog.Title className="text-lg font-semibold text-cw-blue mb-4 flex items-center gap-2">
            <Upload className="w-5 h-5" /> {t('publishToStore', uiLang)}
          </Dialog.Title>

          {/* Package info */}
          <div className="bg-cw-gray rounded p-3 mb-4 text-sm space-y-1">
            <div><span className="text-gray-500">{t('code', uiLang)}:</span> <span className="font-mono">{questionnaire.code}</span></div>
            <div><span className="text-gray-500">{t('name', uiLang)}:</span> {questionnaire.name[lang]}</div>
            <div><span className="text-gray-500">{t('version', uiLang)}:</span> {questionnaire.version}</div>
          </div>

          {step === 'done' ? (
            <div className="text-center py-6">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <p className="text-green-700 font-medium">{t('published', uiLang)}</p>
              <button onClick={() => { reset(); onClose(); }} className="mt-4 px-4 py-2 bg-cw-blue text-white rounded text-sm">{t('close', uiLang)}</button>
            </div>
          ) : step === 'error' ? (
            <div className="text-center py-6">
              <XCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
              <p className="text-red-700 text-sm">{error}</p>
              <button onClick={reset} className="mt-4 px-4 py-2 border border-cw-border rounded text-sm">{t('retry', uiLang)}</button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('release', uiLang)}</label>
                  <input
                    type="text"
                    value={release}
                    onChange={(e) => { setRelease(e.target.value); setStep('form'); setDenials([]); }}
                    className="w-full border border-cw-border rounded px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('visibility', uiLang)}</label>
                  <label className="flex items-center gap-2 mt-2">
                    <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="w-4 h-4 accent-cw-blue" />
                    <span className="text-sm">{t('isPublic', uiLang)}</span>
                  </label>
                </div>
              </div>

              {overlap && (
                <div className="bg-amber-50 border border-amber-300 rounded p-3 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-800">
                    {tf('versionExists', uiLang, { version: `${questionnaire.version}.${release}`, code: questionnaire.code })}
                  </p>
                </div>
              )}

              {denials.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded p-3">
                  <p className="text-xs font-medium text-red-700 mb-1">{t('validationErrorsLabel', uiLang)}</p>
                  <ul className="text-xs text-red-600 space-y-0.5">
                    {denials.map((d, i) => <li key={i}>• {d}</li>)}
                  </ul>
                </div>
              )}

              {step === 'valid' && (
                <div className="bg-green-50 border border-green-200 rounded p-3 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span className="text-sm text-green-700">{t('validationOkPublish', uiLang)}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => { reset(); onClose(); }} className="px-4 py-2 text-sm border border-cw-border rounded hover:bg-gray-50">{t('cancelBtn', uiLang)}</button>
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
