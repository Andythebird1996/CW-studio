import { useState } from 'react';
import { useSettingsStore } from '../stores/settings-store';
import { storeApi } from '../services/store-api';
import { t } from '../i18n';

export function ConnectPage() {
  const { settings, setSettings } = useSettingsStore();
  const lang = settings.uiLanguage;
  const [form, setForm] = useState({
    storeUrl: settings.storeUrl,
    user: settings.user,
    password: settings.password,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function field(key: keyof typeof form) {
    return {
      value: form[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        setForm((f) => ({ ...f, [key]: e.target.value }));
        setError(null);
      },
    };
  }

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    if (!form.storeUrl || !form.user || !form.password) {
      setError(t('fillAllFields', lang));
      return;
    }
    const url = form.storeUrl.toLowerCase();
    const isRest = /\/rest\/|\/clinician\/|\/respondent\/|backend-commons/.test(url);
    if (!url.includes('wsdl') || isRest) {
      setError(t('wsdlHint', lang));
      return;
    }
    setLoading(true);
    setError(null);
    const full = { ...settings, ...form };
    try {
      await storeApi.clearCache(full);
      await storeApi.listPackages(full);
      setSettings(form);
    } catch (err: any) {
      setError(err.message ?? t('connectFailed', lang));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-cw-gray flex flex-col items-center justify-center">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-cw-blue mb-4">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-cw-blue">{t('appTitle', lang)}</h1>
          <p className="text-sm text-cw-gray-text mt-1">{t('connectSubtitle', lang)}</p>
        </div>

        <form onSubmit={connect} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('serverWsdl', lang)}
            </label>
            <input
              type="url"
              className="w-full border border-cw-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cw-blue-light"
              placeholder="https://example/api/store-api.wsdl"
              autoComplete="url"
              required
              {...field('storeUrl')}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('username', lang)}
            </label>
            <input
              type="text"
              className="w-full border border-cw-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cw-blue-light"
              placeholder={t('usernamePh', lang)}
              autoComplete="username"
              required
              {...field('user')}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('password', lang)}
            </label>
            <input
              type="password"
              className="w-full border border-cw-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cw-blue-light"
              placeholder="••••••••"
              autoComplete="current-password"
              required
              {...field('password')}
            />
          </div>

          {error && (
            <p className="text-sm bg-red-50 text-red-700 p-3 rounded border border-red-200">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-cw-blue text-white py-2.5 rounded font-medium text-sm hover:bg-cw-blue-light transition-colors disabled:opacity-60 mt-2"
          >
            {loading ? t('connecting', lang) : t('connect', lang)}
          </button>
        </form>
      </div>
    </div>
  );
}
