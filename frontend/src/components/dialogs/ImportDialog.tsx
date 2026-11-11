import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useState, useMemo } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, ChevronsUpDown, Search } from 'lucide-react';
import { useSettingsStore } from '../../stores/settings-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { storeApi, type PackageSummary } from '../../services/store-api';

interface Props {
  open: boolean;
  onClose: () => void;
  /** replaceTabId is set when the user chose to overwrite an existing open tab */
  onImport: (uid: number, replaceTabId?: string) => void;
}

type SortField = 'name' | 'code' | 'version' | 'release';
type SortDir = 'asc' | 'desc';

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (field !== sortField) return <ChevronsUpDown className="w-3 h-3 opacity-30" />;
  return sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
}

/** Describes a conflict between the package being imported and an already-open tab */
interface ConflictInfo {
  tabId: string;
  tabTitle: string;
  packageCode: string;
  uid: number;
}

export function ImportDialog({ open, onClose, onImport }: Props) {
  const { settings } = useSettingsStore();
  const { tabs } = useWorkspaceStore();
  const [packages, setPackages] = useState<PackageSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setSelected(null);
    setConflict(null);
    storeApi
      .listPackages(settings)
      .then(setPackages)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [open, settings]);

  function handleImportClick() {
    if (selected === null) return;
    const pkg = packages.find((p) => p.uid === selected);
    if (!pkg) return;

    // Check if any open tab has the same package code
    const conflictingTab = tabs.find((tab) => tab.data?.code === pkg.code);
    if (conflictingTab) {
      setConflict({
        tabId: conflictingTab.id,
        tabTitle: conflictingTab.title,
        packageCode: pkg.code,
        uid: selected,
      });
      return;
    }

    onImport(selected);
  }

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'version' || field === 'release' ? 'desc' : 'asc');
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const list = packages.filter(
      (p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q),
    );
    return list.sort((a, b) => {
      let va = a[sortField] ?? '';
      let vb = b[sortField] ?? '';
      // Numeric comparison for version/release
      if (sortField === 'version' || sortField === 'release') {
        const na = parseFloat(va) || 0;
        const nb = parseFloat(vb) || 0;
        return sortDir === 'asc' ? na - nb : nb - na;
      }
      va = va.toString().toLowerCase();
      vb = vb.toString().toLowerCase();
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    });
  }, [packages, search, sortField, sortDir]);

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Dialog.Content aria-describedby={undefined} className="cw-dialog fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl w-[640px] h-[min(500px,calc(100dvh-1rem))] flex flex-col z-50 overflow-hidden">
          <div className="p-4 border-b border-cw-border">
            <Dialog.Title className="text-lg font-semibold text-cw-blue">
              Importer fra server
            </Dialog.Title>
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Søk etter pakke..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-cw-border rounded focus:outline-none focus:ring-2 focus:ring-cw-blue-light"
              />
            </div>
          </div>

          <div className="flex-1 overflow-auto min-h-0">
            {loading && (
              <div className="flex items-center justify-center h-full text-sm text-gray-500">
                Laster pakker...
              </div>
            )}
            {error && (
              <div className="p-4 text-sm text-red-600">
                Feil: {error}
              </div>
            )}
            {!loading && !error && (
              <table className="w-full text-sm">
                <thead className="bg-cw-gray sticky top-0">
                  <tr>
                    {(['name', 'code', 'version', 'release'] as SortField[]).map((field) => (
                      <th
                        key={field}
                        onClick={() => toggleSort(field)}
                        className="text-left px-4 py-2 font-medium text-gray-600 cursor-pointer select-none hover:bg-gray-100 whitespace-nowrap"
                      >
                        <span className="flex items-center gap-1">
                          {field === 'name' ? 'Navn' : field === 'code' ? 'Kode' : field === 'version' ? 'Versjon' : 'Release'}
                          <SortIcon field={field} sortField={sortField} sortDir={sortDir} />
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr
                      key={p.uid}
                      onClick={() => setSelected(p.uid)}
                      className={`cursor-pointer border-b border-cw-border hover:bg-blue-50 ${
                        selected === p.uid ? 'bg-blue-100' : ''
                      }`}
                    >
                      <td className="px-4 py-2">{p.name}</td>
                      <td className="px-4 py-2 text-gray-500 font-mono text-xs">{p.code}</td>
                      <td className="px-4 py-2 text-gray-500">{p.version}</td>
                      <td className="px-4 py-2 text-gray-500">{p.release}</td>
                    </tr>
                  ))}
                  {filtered.length === 0 && !loading && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                        Ingen pakker funnet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          {conflict && (
            <div className="mx-4 mb-2 p-3 bg-amber-50 border border-amber-300 rounded flex flex-col gap-2">
              <div className="flex items-start gap-2 text-sm text-amber-800">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  En pakke med kode <span className="font-mono font-semibold">&quot;{conflict.packageCode}&quot;</span> er allerede åpen som &quot;{conflict.tabTitle}&quot;.
                </span>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setConflict(null)}
                  className="px-3 py-1 text-xs border border-amber-400 text-amber-800 rounded hover:bg-amber-100"
                >
                  Avbryt
                </button>
                <button
                  onClick={() => {
                    const { uid } = conflict;
                    setConflict(null);
                    onImport(uid);
                  }}
                  className="px-3 py-1 text-xs border border-amber-400 text-amber-800 rounded hover:bg-amber-100"
                >
                  Åpne som ny kopi
                </button>
                <button
                  onClick={() => {
                    const { uid, tabId } = conflict;
                    setConflict(null);
                    onImport(uid, tabId);
                  }}
                  className="px-3 py-1 text-xs bg-amber-600 text-white rounded hover:bg-amber-700"
                >
                  Erstatt åpen tab
                </button>
              </div>
            </div>
          )}

          <div className="p-4 border-t border-cw-border flex justify-between items-center">
            <span className="text-sm text-gray-500">
              {filtered.length} av {packages.length} pakker
            </span>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm border border-cw-border rounded hover:bg-gray-50"
              >
                Avbryt
              </button>
              <button
                onClick={handleImportClick}
                disabled={selected === null}
                className="px-4 py-2 text-sm bg-cw-blue text-white rounded hover:bg-cw-blue-light disabled:opacity-50"
              >
                Åpne
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
