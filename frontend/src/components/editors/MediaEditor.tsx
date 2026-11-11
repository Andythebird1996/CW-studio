import { useRef, useState } from 'react';
import { PlusCircle, Trash2, X } from 'lucide-react';
import type { MediaFile } from '../../types/questionnaire';
import { useUILang } from '../../i18n';

interface Props {
  mediaFiles: MediaFile[];
  onChange?: (files: MediaFile[]) => void;
}

const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/bmp', 'image/webp', 'image/svg+xml']);

const MIME_EXT: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif',
  'image/bmp': 'bmp', 'image/webp': 'webp', 'image/svg+xml': 'svg',
  'application/pdf': 'pdf', 'audio/mpeg': 'mp3', 'audio/wav': 'wav',
  'audio/ogg': 'ogg', 'video/mp4': 'mp4',
};

export function MediaEditor({ mediaFiles, onChange }: Props) {
  const uiLang = useUILang();
  const [lightbox, setLightbox] = useState<MediaFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0 || !onChange) return;
    const readers = files.map(
      (file) =>
        new Promise<MediaFile>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            const ext = MIME_EXT[file.type] ?? file.name.split('.').pop()?.toLowerCase() ?? '';
            resolve({
              fileName: file.name,
              extension: ext,
              mimeType: file.type,
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
          <h2 className="text-sm font-semibold text-cw-blue">Media</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {mediaFiles.length} {uiLang === 'NO'
              ? `fil${mediaFiles.length !== 1 ? 'er' : ''}`
              : `file${mediaFiles.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        {onChange && (
          <>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-cw-blue text-white rounded hover:bg-cw-blue-light"
            >
              <PlusCircle className="w-3.5 h-3.5" /> {uiLang === 'NO' ? 'Legg til filer' : 'Add files'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,application/pdf,audio/*,video/mp4"
              className="hidden"
              onChange={handleFilesSelected}
            />
          </>
        )}
      </div>

      {mediaFiles.length === 0 && (
        <div className="flex flex-col items-center justify-center flex-1 text-gray-400 gap-3">
          <div className="text-4xl">🖼</div>
          <p className="text-sm">{uiLang === 'NO' ? 'Ingen mediafiler' : 'No media files'}</p>
          {onChange && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-xs px-3 py-1.5 border border-cw-border rounded hover:bg-gray-50"
            >
              {uiLang === 'NO' ? 'Last opp filer' : 'Upload files'}
            </button>
          )}
        </div>
      )}

      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
          {mediaFiles.map((f) => {
            const isImage = IMAGE_MIMES.has(f.mimeType) && !!f.dataUrl;
            return (
              <div key={f.fileName} className="border border-cw-border rounded-lg overflow-hidden bg-white shadow-sm flex flex-col">
                {/* Preview */}
                <div
                  className={`h-32 bg-gray-50 flex items-center justify-center overflow-hidden ${isImage ? 'cursor-zoom-in' : ''}`}
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
                <div className="px-2 py-1.5 border-t border-cw-border">
                  <p className="text-xs font-medium text-gray-700 truncate" title={f.fileName}>
                    {f.fileName}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {f.sizeKb < 1024 ? `${f.sizeKb} B` : `${Math.round(f.sizeKb / 1024)} KB`} · {f.extension.toUpperCase()}
                  </p>
                </div>

                {/* Download */}
                {f.dataUrl && (
                  <a
                    href={f.dataUrl}
                    download={f.fileName}
                    className="block text-center text-[10px] text-cw-link hover:underline py-1 border-t border-cw-border bg-gray-50"
                  >
                    {uiLang === 'NO' ? 'Last ned' : 'Download'}
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
            className="absolute top-4 right-4 text-white hover:text-gray-300"
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
