import { MoreHorizontal, type LucideIcon } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type RowAction = {
  label: string;
  icon: LucideIcon;
  run: () => void;
  destructive?: boolean;
};

type Point = { x: number; y: number };
type Anchor = Point & { alignedToButton: boolean };
const viewportInset = 8;

export function RowActionMenu({
  actions,
  as: Row = 'li',
  children,
  className,
  label,
}: {
  actions: RowAction[];
  as?: 'li' | 'article';
  children: ReactNode;
  className?: string;
  label: string;
}) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const openMenu = (pointer?: Point) => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setAnchor({
      x: pointer?.x ?? rect.right,
      y: pointer?.y ?? rect.bottom + 5,
      alignedToButton: !pointer,
    });
  };

  const closeAndFocusTrigger = () => {
    setAnchor(null);
    triggerRef.current?.focus({ preventScroll: true });
  };

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!anchor || !menu) return;
    const { offsetWidth: width, offsetHeight: height } = menu;
    const x = anchor.x - (anchor.alignedToButton ? width : 0);
    menu.style.left = `${Math.max(viewportInset, Math.min(x, window.innerWidth - width - viewportInset))}px`;
    menu.style.top = `${Math.max(viewportInset, Math.min(anchor.y, window.innerHeight - height - viewportInset))}px`;
    menu.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus({ preventScroll: true });
  }, [anchor]);

  useEffect(() => {
    if (!anchor) return;
    const dismiss = () => setAnchor(null);
    const outsideInteraction = (event: Event) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) dismiss();
    };
    document.addEventListener('pointerdown', outsideInteraction, true);
    // Focus and browser scroll-to-view can emit scroll events as the menu opens.
    document.addEventListener('wheel', outsideInteraction, { capture: true, passive: true });
    document.addEventListener('touchmove', outsideInteraction, { capture: true, passive: true });
    window.addEventListener('resize', dismiss);
    return () => {
      document.removeEventListener('pointerdown', outsideInteraction, true);
      document.removeEventListener('wheel', outsideInteraction, true);
      document.removeEventListener('touchmove', outsideInteraction, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [anchor]);

  const handleMenuKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' || event.key === 'Tab') {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
      }
      closeAndFocusTrigger();
      return;
    }

    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? items.length - 1
      : event.key === 'ArrowDown' ? (current + 1) % items.length
      : event.key === 'ArrowUp' ? (current + items.length - 1) % items.length
      : null;
    if (next === null) return;
    event.preventDefault();
    items[next]?.focus({ preventScroll: true });
  };

  return (
    <>
      <Row
        className={className}
        onContextMenu={(event) => {
          event.preventDefault();
          if (event.button === 2 || event.clientX || event.clientY) {
            openMenu({ x: event.clientX, y: event.clientY });
          } else {
            openMenu();
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
            event.preventDefault();
            openMenu();
          }
        }}
      >
        {children}
        <button
          aria-controls={anchor ? menuId : undefined}
          aria-expanded={Boolean(anchor)}
          aria-haspopup="menu"
          aria-label={`更多操作：${label}`}
          className="row-action-trigger"
          onClick={() => anchor ? closeAndFocusTrigger() : openMenu()}
          ref={triggerRef}
          type="button"
        >
          <MoreHorizontal aria-hidden="true" size={19} />
        </button>
      </Row>
      {anchor ? createPortal(
        <div aria-label={`操作：${label}`} className="row-action-menu" id={menuId} onKeyDown={handleMenuKey} ref={menuRef} role="menu">
          {actions.map(({ destructive, icon: Icon, label: actionLabel, run }) => (
            <button className={destructive ? 'is-destructive' : undefined} key={actionLabel} onClick={() => {
              closeAndFocusTrigger();
              run();
            }} role="menuitem" tabIndex={-1} type="button">
              <Icon aria-hidden="true" size={16} />
              {actionLabel}
            </button>
          ))}
        </div>,
        document.body,
      ) : null}
    </>
  );
}
