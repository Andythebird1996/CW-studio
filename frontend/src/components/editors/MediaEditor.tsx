import { useRef, useState } from 'react';
import { PlusCircle, Pencil, X } from 'lucide-react';
import type { MediaFile } from '../../types/questionnaire';
import {t, tf, useUILang } from '../../i18n';
import { isAllowedMediaFile, ALLOWED_MEDIA_TYPES } from '../../services/package-builder';

interface Props {
  mediaFiles: MediaFile[];
  onChange?: (files: MediaFile[]) => void;
  /** Antall steder som viser til fila (kartlegging, svarmaler, rapporter, manifest) */
  referenceCount?: (fileName: string) => number;
  /** Feilkode for et nytt navn, eller null når det kan brukes */
  renameError?: (oldName: string, newName: string) => 'empty' | 'exists' | 'extension' | 'invalid' | null;
  /** Gi fila nytt navn og oppdater referansene */
  onRename?: (oldName: string, newName: string) => void;
  /** Filer som vises som dokumentlenker i menyen (manifest: reference) */
  documentLinks?: string[];
  onToggleDocumentLink?: (fileName: string, on: boolean) => void;
}

const RENAME_ERROR_KEY = {
  empty: 'mediaRenameEmpty', exists: 'mediaRenameExists', extension: 'mediaRenameExt', invalid: 'mediaRenameInvalid',
} as const;

/** Filtyper portalen kan vise som dokumentlenke i menyen (pdf, doc/docx og mp3 i ekte pakker) */
const DOC_LINK_EXT = new Set(['pdf', 'docx', 'doc', 'mp3', 'png', 'jpg', 'jpeg']);

const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/bmp', 'image/webp', 'image/svg+xml']);

const MIME_EXT: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif',
  'image/bmp': 'bmp', 'image/webp': 'webp', 'image/svg+xml': 'svg',
  'application/pdf': 'pdf', 'audio/mpeg': 'mp3', 'audio/wav': 'wav',
  'audio/ogg': 'ogg', 'video/mp4': 'mp4',
};

export function MediaEditor({ mediaFiles, onChange, referenceCount, renameError, onRename, documentLinks = [], onToggleDocumentLink }: Props) {
  const uiLang = useUILang();
  const [renaming, setRenaming] = useState<{ from: string; to: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const renameErr = renaming && renameError ? renameError(renaming.from, renaming.to) : null;
  function commitRename() {
    if (!renaming || !onRename || renameErr) return;
    const n = referenceCount?.(renaming.from) ?? 0;
    if (renaming.to.trim() !== renaming.from) {
      onRename(renaming.from, renaming.to.trim());
      setNotice(tf('mediaRenamed', uiLang, { name: renaming.to.trim(), n }));
    }
    setRenaming(null);
  }
  const [lightbox, setLightbox] = useState<MediaFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rejected, setRejected] = useState<string[]>([]);

  function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const all = Array.from(e.target.files ?? []);
    // Checkware FP6 leverer bare PNG, JPEG, MP3, PDF og DOCX (andre typer gir HTTP 500)
    setRejected(all.filter((f) => !isAllowedMediaFile(f.name)).map((f) => f.name));
    const files = all.filter((f) => isAllowedMediaFile(f.name));
    if (files.length === 0) e.target.value = '';
    if (files.length === 0 || !onChange) return;
    const readers = files.map(
      (file) =>
        new Promise<MediaFile>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            const ext = file.name.split('.').pop()?.toLowerCase() ?? MIME_EXT[file.type] ?? '';
            resolve({
              fileName: file.name,
              extension: ext,
              mimeType: ALLOWED_MEDIA_TYPES[ext] ?? file.type,
              dataUrl,
              sizeKb: Math.round(file.size / 1024),
            });
          };
          reader.readAsDataURL(file);
        }),
    );
    Promise.all(readers).then((newFiles) => {
      const merged = [...mediaFiles];
      for (const nf of newFiles) {
        const idx = merged.findIndex((f) => f.fileName === nf.fileName);
        if (idx >= 0) merged[idx] = nf;
        else merged.push(nf);
      }
      onChange(merged);
    });
    e.target.value = '';
  }

  function removeFile(fileName: string) {
    onChange?.(mediaFiles.filter((f) => f.fileName !== fileName));
  }

  return (
    <div className="flex flex-col h-full overflow-hidden min-w-0 min-h-0">
      <div className="bg-white border-b border-cw-border px-4 py-3 shrink-0 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-cw-blue">{t('tabMedia', uiLang)}</h2>
          <p className="text-xs text-cw-gray-text mt-0.5">
            {mediaFiles.length} {t(mediaFiles.length === 1 ? 'nFileOne' : 'nFileMany', uiLang)}
          </p>
        </div>
        {onChange && (
          <>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-cw-blue text-white rounded hover:bg-cw-blue-light"
            >
              <PlusCircle className="w-3.5 h-3.5" /> {t('addFiles', uiLang)}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".png,.jpg,.jpeg,.mp3,.pdf,.docx"
              className="hidden"
              onChange={handleFilesSelected}
            />
          </>
        )}
      </div>

      {notice && (
        <div className="bg-cw-blue-soft border-b border-cw-blue/30 px-4 py-2 text-xs text-cw-blue shrink-0 flex justify-between" data-testid="media-notice">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)}><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {rejected.length > 0 && (
        <div className="bg-cw-orange-soft border-b border-cw-orange/40 px-4 py-2 text-xs text-cw-orange shrink-0">
          {tf('mediaTypeRejected', uiLang, { files: rejected.join(', ') })}
        </div>
      )}

      {mediaFiles.length === 0 && (
        <div className="flex flex-col items-center justify-center flex-1 text-cw-gray-text gap-3">
          <div className="text-4xl">🖼</div>
          <p className="text-sm">{t('noMedia', uiLang)}</p>
          {onChange && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-xs px-3 py-1.5 border border-cw-border rounded hover:bg-cw-gray"
            >
              {t('uploadFiles', uiLang)}
            </button>
          )}
        </div>
      )}

      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
          {mediaFiles.map((f) => {
            const isImage = IMAGE_MIMES.has(f.mimeType) && !!f.dataUrl;
            return (
              <div key={f.fileName} className="border border-cw-border rounded-lg overflow-hidden bg-white shadow-sm flex flex-col">
                {/* Preview */}
                <div
                  className={`h-32 bg-cw-gray flex items-center justify-center overflow-hidden ${isImage ? 'cursor-zoom-in' : ''}`}
                  onClick={() => isImage && setLightbox(f)}
                >
                  {isImage ? (
                    <img
                      src={f.dataUrl}
                      alt={f.fileName}
                      className="max-h-full max-w-full object-contain"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <div className="text-3xl select-none">
                      {f.mimeType.startsWith('audio/') ? '🔊' :
                       f.mimeType === 'application/pdf' ? '📄' :
                       f.mimeType.startsWith('video/') ? '🎬' : '📎'}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="px-3 py-2 border-t border-cw-border">
                  {renaming?.from === f.fileName ? (
                    <div className="space-y-1">
                      <input
                        autoFocus
                        aria-label={t('mediaRename', uiLang)}
                        value={renaming.to}
                        onChange={(e) => setRenaming({ from: f.fileName, to: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(null); }}
                        className="w-full border border-cw-border rounded px-1.5 py-0.5 text-xs font-mono"
                      />
                      {renameErr && <p className="text-[10px] text-cw-negative">{t(RENAME_ERROR_KEY[renameErr], uiLang)}</p>}
                      <div className="flex gap-2">
                        <button type="button" disabled={!!renameErr} onClick={commitRename} className="text-[10px] px-2 py-0.5 bg-cw-blue text-white rounded disabled:opacity-50">{t('mediaRenameSave', uiLang)}</button>
                        <button type="button" onClick={() => setRenaming(null)} className="text-[10px] px-2 py-0.5 border border-cw-border rounded">{t('mediaRenameCancel', uiLang)}</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <p className="text-xs font-medium text-cw-ink truncate flex-1" title={f.fileName}>
                        {f.fileName}
                      </p>
                      {onRename && (
                        <button type="button" title={t('mediaRename', uiLang)} aria-label={`${t('mediaRename', uiLang)} ${f.fileName}`} onClick={() => setRenaming({ from: f.fileName, to: f.fileName })} className="text-cw-gray-text hover:text-cw-blue">
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}
                  <p className="text-[10px] text-cw-gray-text mt-0.5">
                    {f.sizeKb < 1024 ? `${f.sizeKb} B` : `${Math.round(f.sizeKb / 1024)} KB`} · {f.extension.toUpperCase()}
                    {referenceCount && (
                      <> · {referenceCount(f.fileName) > 0 ? tf('mediaUsedIn', uiLang, { n: referenceCount(f.fileName) }) : t('mediaUnused', uiLang)}</>
                    )}
                  </p>
                  {onToggleDocumentLink && DOC_LINK_EXT.has(f.extension.toLowerCase()) && (
                    <label className="flex items-center gap-1 mt-1 cursor-pointer" title={t('mediaDocLinkHint', uiLang)}>
                      <input
                        type="checkbox"
                        checked={documentLinks.includes(f.fileName)}
                        onChange={(e) => onToggleDocumentLink(f.fileName, e.target.checked)}
                        className="accent-cw-blue"
                      />
                      <span className="text-[10px] text-cw-gray-text">{t('mediaDocLink', uiLang)}</span>
                    </label>
                  )}
                </div>

                {/* Download */}
                {f.dataUrl && (
                  <a
                    href={f.dataUrl}
                    download={f.fileName}
                    className="block text-center text-[10px] text-cw-link hover:underline py-1 border-t border-cw-border bg-cw-gray"
                  >
                    {t('download', uiLang)}
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6"
          onClick={() => setLightbox(null)}
        >
          <button
            className="absolute top-4 right-4 text-white hover:text-cw-gray-text"
            onClick={() => setLightbox(null)}
          >
            <X className="w-6 h-6" />
          </button>
          <div
            className="max-w-full max-h-full flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightbox.dataUrl}
              alt={lightbox.fileName}
              className="max-w-[80vw] max-h-[80vh] object-contain rounded shadow-xl bg-white"
            />
            <p className="text-white text-sm">{lightbox.fileName}</p>
          </div>
        </div>
      )}
    </div>
  );
}
