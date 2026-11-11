import { useEffect, useRef } from 'react';

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}

export interface ContextMenuSeparator {
  separator: true;
}

export type ContextMenuEntry = ContextMenuItem | ContextMenuSeparator;

interface Props {
  x: number;
  y: number;
  items: ContextMenuEntry[];
  onClose: () => void;
}

export function ItemContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  // Nudge off-screen menus back into the viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    zIndex: 9999,
    top: Math.min(y, window.innerHeight - 160),
    left: Math.min(x, window.innerWidth - 180),
  };

  const base = 'flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left transition-colors cursor-pointer';

  return (
    <div
      ref={ref}
      style={style}
      className="bg-white border border-cw-border rounded shadow-xl min-w-[160px] py-1 select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((entry, i) => {
        if ('separator' in entry) {
          return <div key={i} className="border-t border-cw-border my-0.5" />;
        }
        return (
          <button
            key={i}
            className={`${base} ${entry.danger ? 'text-cw-negative hover:bg-cw-negative-soft' : 'text-cw-ink hover:bg-cw-gray'}`}
            onClick={() => { entry.onClick(); onClose(); }}
          >
            {entry.icon}
            {entry.label}
          </button>
        );
      })}
    </div>
  );
}
