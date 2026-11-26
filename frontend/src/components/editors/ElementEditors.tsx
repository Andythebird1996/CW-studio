/**
 * Editorer for glidebrytertekster (verdietiketter), vedlegg (Attachment) og lyd/video-kilde.
 * Brukes i QuestionnaireEditor.
 */
import { PlusCircle, Trash2, FileText } from 'lucide-react';
import type {
  AttachmentFileType, AttachmentQuestion, AudioVideoQuestion, LanguageType, SliderQuestion, ValueLabel,
} from '../../types/questionnaire';
import { t, tf, useUILang } from '../../i18n';

const inputCls = 'w-full border border-cw-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cw-blue/30';

/** Neste ledige etikettkode, som ekte pakker: «MAL-VL1», «MAL-VL2» … */
export function nextValueLabelCode(q: SliderQuestion, labels: ValueLabel[]): string {
  const base = q.responseTemplateCode ?? q.code ?? 'SL';
  let n = labels.length + 1;
  while (labels.some((v) => v.code === `${base}-VL${n}`)) n++;
  return `${base}-VL${n}`;
}

/** Sett teksten ved en verdi: lager etiketten om den ikke finnes, fjerner den om alle tekster er tomme */
export function setSliderLabelText(q: SliderQuestion, value: number, lang: LanguageType, text: string): SliderQuestion {
  const labels = q.valueLabels ?? [];
  const i = labels.findIndex((v) => v.value === value && v.imageFile === undefined);
  if (i < 0) {
    if (!text) return q;
    return { ...q, valueLabels: [...labels, { code: nextValueLabelCode(q, labels), value, texts: { [lang]: text } as Record<LanguageType, string> }] };
  }
  const texts = { ...(labels[i].texts ?? {}), [lang]: text } as Record<LanguageType, string>;
  const empty = Object.values(texts).every((v) => !v);
  const next = empty ? labels.filter((_, j) => j !== i) : labels.map((v, j) => (j === i ? { ...v, texts } : v));
  return { ...q, valueLabels: next.length > 0 ? next : undefined };
}

export function SliderLabelsEditor({ question, lang, onChange }: { question: SliderQuestion; lang: LanguageType; onChange: (q: SliderQuestion) => void }) {
  const uiLang = useUILang();
  const labels = question.valueLabels ?? [];
  const textAt = (value: number) => labels.find((v) => v.value === value && v.imageFile === undefined)?.texts?.[lang] ?? '';
  const others = labels.filter((v) => v.imageFile !== undefined || (v.value !== question.min && v.value !== question.max));
  const update = (code: string, patch: Partial<ValueLabel>) =>
    onChange({ ...question, valueLabels: labels.map((v) => (v.code === code ? { ...v, ...patch } : v)) });
  return (
    <div className="border border-cw-border rounded px-3 py-2 space-y-2" data-testid="slider-labels">
      <div className="text-xs font-medium text-cw-gray-text">{t('sliderLabels', uiLang)}</div>
      <p className="text-[11px] text-cw-gray-text">{t('sliderLabelsHint', uiLang)}</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-cw-gray-text mb-1">{tf('sliderMinText', uiLang, { value: question.min })}</label>
          <input
            type="text"
            aria-label={tf('sliderMinText', uiLang, { value: question.min })}
            value={textAt(question.min)}
            onChange={(e) => onChange(setSliderLabelText(question, question.min, lang, e.target.value))}
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs text-cw-gray-text mb-1">{tf('sliderMaxText', uiLang, { value: question.max })}</label>
          <input
            type="text"
            aria-label={tf('sliderMaxText', uiLang, { value: question.max })}
            value={textAt(question.max)}
            onChange={(e) => onChange(setSliderLabelText(question, question.max, lang, e.target.value))}
            className={inputCls}
          />
        </div>
      </div>
      {others.length > 0 && <div className="text-xs text-cw-gray-text">{t('sliderOtherLabels', uiLang)}</div>}
      {others.map((v) => (
        <div key={v.code} className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-cw-gray-text w-20 truncate" title={v.code}>{v.code}</span>
          <input
            type="number"
            aria-label={t('sliderLabelValue', uiLang)}
            value={v.value}
            onChange={(e) => update(v.code, { value: +e.target.value, _rawValue: undefined })}
            className="w-20 border border-cw-border rounded px-2 py-1 text-xs"
          />
          {v.imageFile !== undefined ? (
            <span className="text-xs text-cw-gray-text flex-1 truncate">{tf('sliderLabelImage', uiLang, { file: v.imageFile })}</span>
          ) : (
            <input
              type="text"
              value={v.texts?.[lang] ?? ''}
              onChange={(e) => update(v.code, { texts: { ...(v.texts ?? {}), [lang]: e.target.value } as Record<LanguageType, string> })}
              className="flex-1 border border-cw-border rounded px-2 py-1 text-xs"
            />
          )}
          <button
            type="button"
            onClick={() => {
              const next = labels.filter((x) => x.code !== v.code);
              onChange({ ...question, valueLabels: next.length > 0 ? next : undefined });
            }}
            className="text-cw-gray-text hover:text-cw-negative"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => {
          const mid = Math.round((question.min + question.max) / 2);
          onChange({ ...question, valueLabels: [...labels, { code: nextValueLabelCode(question, labels), value: mid, texts: { [lang]: '' } as Record<LanguageType, string> }] });
        }}
        className="flex items-center gap-1 text-xs text-cw-link hover:underline"
      >
        <PlusCircle className="w-3.5 h-3.5" /> {t('sliderAddLabel', uiLang)}
      </button>
    </div>
  );
}

const FILE_TYPES: { value: AttachmentFileType; key: 'attachmentAny' | 'attachmentImage' | 'attachmentDocument' }[] = [
  { value: 'ANY', key: 'attachmentAny' },
  { value: 'IMAGE', key: 'attachmentImage' },
  { value: 'DOCUMENT', key: 'attachmentDocument' },
];

export function AttachmentEditor({ question, onChange }: { question: AttachmentQuestion; onChange: (q: AttachmentQuestion) => void }) {
  const uiLang = useUILang();
  const num = (v: string) => (v === '' ? undefined : Math.max(0, Math.round(+v)));
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 bg-cw-blue-soft border border-cw-blue/30 rounded px-3 py-2 text-xs text-cw-blue">
        <FileText className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>{t('attachmentHint', uiLang)}</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-cw-gray-text mb-1">{t('attachmentFileType', uiLang)}</label>
          <select
            value={question.fileType ?? 'ANY'}
            onChange={(e) => onChange({ ...question, fileType: e.target.value as AttachmentFileType })}
            className={inputCls}
          >
            {FILE_TYPES.map((f) => <option key={f.value} value={f.value}>{t(f.key, uiLang)}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-cw-gray-text mb-1">{t('attachmentMaxFiles', uiLang)}</label>
          <input type="number" min={1} value={question.maxFiles ?? ''} onChange={(e) => onChange({ ...question, maxFiles: num(e.target.value) })} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-cw-gray-text mb-1">{t('attachmentMaxSize', uiLang)}</label>
          <input type="number" min={0} value={question.maxFileSize ?? ''} onChange={(e) => onChange({ ...question, maxFileSize: num(e.target.value) })} className={inputCls} />
        </div>
      </div>
    </div>
  );
}

export const isUrl = (v: string | undefined) => !!v && /^https?:\/\//i.test(v);

export function AudioSourceEditor({ question, mediaCodes, onChange }: { question: AudioVideoQuestion; mediaCodes: string[]; onChange: (q: AudioVideoQuestion) => void }) {
  const uiLang = useUILang();
  const fromUrl = isUrl(question.mediaFile) || (mediaCodes.length === 0 && !!question.mediaFile && !mediaCodes.includes(question.mediaFile));
  const audioFiles = mediaCodes.filter((c) => /\.mp3$/i.test(c));
  return (
    <div className="space-y-2">
      <div className="flex gap-4 text-xs text-cw-gray-text">
        <span className="font-medium">{t('audioSource', uiLang)}:</span>
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="radio" checked={!fromUrl} onChange={() => onChange({ ...question, mediaFile: audioFiles[0] ?? '' })} className="accent-cw-blue" />
          {t('audioFromPackage', uiLang)}
        </label>
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="radio" checked={fromUrl} onChange={() => onChange({ ...question, mediaFile: 'https://' })} className="accent-cw-blue" />
          {t('audioFromUrl', uiLang)}
        </label>
      </div>
      {fromUrl ? (
        <input
          type="url"
          aria-label={t('audioFromUrl', uiLang)}
          value={question.mediaFile ?? ''}
          onChange={(e) => onChange({ ...question, mediaFile: e.target.value || undefined })}
          placeholder="https://www.youtube.com/watch?v=…"
          className={`${inputCls} font-mono`}
        />
      ) : (
        <select
          aria-label={t('audioFromPackage', uiLang)}
          value={question.mediaFile ?? ''}
          onChange={(e) => onChange({ ...question, mediaFile: e.target.value || undefined })}
          className={`${inputCls} font-mono`}
        >
          <option value="">{t('selectMediaFile', uiLang)}</option>
          {(audioFiles.length > 0 ? audioFiles : mediaCodes).map((code) => <option key={code} value={code}>{code}</option>)}
        </select>
      )}
    </div>
  );
}
