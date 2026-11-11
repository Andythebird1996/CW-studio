import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Settings {
  storeUrl: string;
  user: string;
  password: string;
  uiLanguage: 'EN' | 'NO';
}

export interface Profile {
  id: string;
  name: string;
  storeUrl: string;
  user: string;
  password: string;
}

interface SettingsStore {
  settings: Settings;
  setSettings: (s: Partial<Settings>) => void;
  profiles: Profile[];
  saveProfile: (name: string, credentials: Omit<Profile, 'id' | 'name'>) => void;
  updateProfile: (id: string, patch: Partial<Omit<Profile, 'id'>>) => void;
  deleteProfile: (id: string) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      settings: {
        storeUrl: 'https://cia.checkwareonline.com/v2/store/api/store-api.wsdl',
        user: '',
        password: '',
        uiLanguage: 'NO' as const,
      },
      setSettings: (s) =>
        set((state) => ({ settings: { ...state.settings, ...s } })),
      profiles: [],
      saveProfile: (name, credentials) =>
        set((state) => ({
          profiles: [
            ...state.profiles,
            { id: crypto.randomUUID(), name, ...credentials },
          ],
        })),
      updateProfile: (id, patch) =>
        set((state) => ({
          profiles: state.profiles.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),
      deleteProfile: (id) =>
        set((state) => ({ profiles: state.profiles.filter((p) => p.id !== id) })),
    }),
    { name: 'cw-studio-settings' },
  ),
);
