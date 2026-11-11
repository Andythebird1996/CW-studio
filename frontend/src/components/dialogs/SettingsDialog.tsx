import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import { PlusCircle, Trash2, User, Check } from 'lucide-react';
import { useSettingsStore, type Profile } from '../../stores/settings-store';
import { storeApi } from '../../services/store-api';
import { t, useUILang } from '../../i18n';

interface Props {
  open: boolean;
  onClose: () => void;
}

type FormState = { storeUrl: string; user: string; password: string };

export function SettingsDialog({ open, onClose }: Props) {
  const lang = useUILang();
  const { settings, setSettings, profiles, saveProfile, deleteProfile } = useSettingsStore();

  const [form, setForm] = useState<FormState>({
    storeUrl: settings.storeUrl,
    user: settings.user,
    password: settings.password,
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  // Save-as-profile state
  const [savingAs, setSavingAs] = useState(false);
  const [profileName, setProfileName] = useState('');

  function updateField(key: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setTestResult(null);
  }

  function loadProfile(p: Profile) {
    setForm({ storeUrl: p.storeUrl, user: p.user, password: p.password });
    setTestResult(null);
  }

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      await storeApi.clearCache({ ...settings, ...form });
      const pkgs = await storeApi.listPackages({ ...settings, ...form });
      setTestResult(`✓ OK — ${pkgs.length} ${lang === 'NO' ? 'pakker funnet' : 'packages found'}`);
    } catch (err: unknown) {
      setTestResult(`✗ ${lang === 'NO' ? 'Feil' : 'Error'}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTesting(false);
    }
  }

  function handleSaveProfile() {
    const name = profileName.trim();
    if (!name) return;
    saveProfile(name, form);
    setProfileName('');
    setSavingAs(false);
  }

  function save() {
    setSettings(form);
    onClose();
  }

  const inputCls = 'w-full border border-cw-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cw-blue-light';

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Dialog.Content
          aria-describedby={undefined}
          className="cw-dialog fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl z-50 flex flex-col md:flex-row overflow-hidden"
          style={{ width: 640, maxHeight: '90vh' }}
        >
          {/* ── Left: saved profiles ─────────────────────────────────────── */}
          <div className="w-full max-h-40 md:max-h-none md:w-52 bg-cw-gray border-b md:border-b-0 md:border-r border-cw-border flex flex-col shrink-0 min-h-0">
            <div className="px-3 py-3 border-b border-cw-border">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                {lang === 'NO' ? 'Lagrede profiler' : 'Saved profiles'}
              </p>
            </div>

            <div className="flex-1 overflow-auto py-1">
              {profiles.length === 0 && (
                <p className="text-xs text-gray-400 text-center mt-4 px-3 leading-relaxed">
                  {lang === 'NO'
                    ? 'Ingen profiler ennå. Fyll ut skjemaet og trykk «Lagre profil».'
                    : 'No profiles yet. Fill in the form and click «Save profile».'}
                </p>
              )}
              {profiles.map((p) => {
                const isActive = p.storeUrl === form.storeUrl && p.user === form.user;
                return (
                  <div
                    key={p.id}
                    className={`group flex items-center gap-2 px-3 py-2.5 cursor-pointer border-b border-cw-border/50 hover:bg-white/70 ${
                      isActive ? 'bg-white border-l-2 border-l-cw-blue' : ''
                    }`}
                    onClick={() => loadProfile(p)}
                  >
                    <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-gray-700 truncate">{p.name}</div>
                      <div className="text-[10px] text-gray-400 truncate">{p.user}</div>
                    </div>
                    {isActive && <Check className="w-3 h-3 text-cw-blue shrink-0" />}
                    <button
                      className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 shrink-0 transition-opacity"
                      onClick={(e) => { e.stopPropagation(); deleteProfile(p.id); }}
                      title={lang === 'NO' ? 'Slett profil' : 'Delete profile'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Save-as-profile UI */}
            <div className="p-2 border-t border-cw-border">
              {savingAs ? (
                <div className="flex gap-1">
                  <input
                    autoFocus
                    type="text"
                    placeholder={lang === 'NO' ? 'Profilnavn…' : 'Profile name…'}
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveProfile();
                      if (e.key === 'Escape') { setSavingAs(false); setProfileName(''); }
                    }}
                    className="flex-1 text-xs border border-cw-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-cw-blue-light min-w-0"
                  />
                  <button
                    onClick={handleSaveProfile}
                    disabled={!profileName.trim()}
                    className="px-2 py-1 text-xs bg-cw-blue text-white rounded hover:bg-cw-blue-light disabled:opacity-40"
                  >
                    OK
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setSavingAs(true)}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-cw-blue-light hover:bg-white rounded border border-dashed border-cw-blue-light/50"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  {lang === 'NO' ? 'Lagre profil' : 'Save profile'}
                </button>
              )}
            </div>
          </div>

          {/* ── Right: form ──────────────────────────────────────────────── */}
          <div className="flex-1 flex flex-col p-4 sm:p-6 min-w-0 min-h-0 overflow-y-auto">
            <Dialog.Title className="text-lg font-semibold text-cw-blue mb-5">
              {t('serverSettings', lang)}
            </Dialog.Title>

            <div className="space-y-4 flex-1">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('storeUrl', lang)}
                </label>
                <input
                  type="url"
                  className={inputCls}
                  placeholder="https://your-server/api/store-api.wsdl"
                  value={form.storeUrl}
                  onChange={(e) => updateField('storeUrl', e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('username', lang)}
                </label>
                <input
                  type="text"
                  className={inputCls}
                  autoComplete="username"
                  value={form.user}
                  onChange={(e) => updateField('user', e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('password', lang)}
                </label>
                <input
                  type="password"
                  className={inputCls}
                  autoComplete="current-password"
                  value={form.password}
                  onChange={(e) => updateField('password', e.target.value)}
                />
              </div>

              {testResult && (
                <p className={`text-sm p-2 rounded ${testResult.startsWith('✓') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {testResult}
                </p>
              )}
            </div>

            <div className="flex flex-wrap justify-between gap-2 mt-6 pt-4 border-t border-cw-border">
              <button
                onClick={testConnection}
                disabled={testing || !form.storeUrl}
                className="px-4 py-2 text-sm border border-cw-border rounded hover:bg-gray-50 disabled:opacity-50"
              >
                {testing ? t('testing', lang) : t('testConnection', lang)}
              </button>
              <div className="flex gap-2">
                <button onClick={onClose} className="px-4 py-2 text-sm border border-cw-border rounded hover:bg-gray-50">
                  {t('cancelBtn2', lang)}
                </button>
                <button onClick={save} className="px-4 py-2 text-sm bg-cw-blue text-white rounded hover:bg-cw-blue-light">
                  {t('saveBtn', lang)}
                </button>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
