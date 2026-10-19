import { useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';
// Several dialogs can stack (a confirmation over a case file); only the top one reacts to Escape.
const stack: symbol[] = [];

/**
 * Dialog behaviour for any panel: Escape closes it, Tab stays inside it, focus returns to whatever
 * opened it, and the page behind does not scroll. Spread the result onto the panel element.
 */
export function useModal<T extends HTMLElement = HTMLElement>(onClose: (() => void) | undefined, label: string, active = true) {
  const ref = useRef<T>(null);
  const close = useRef(onClose);
  // Declared before the dialog effect so it always sees the latest callback without re-subscribing.
  useEffect(() => { close.current = onClose; });

  useEffect(() => {
    const panel = ref.current;
    if (!active || !panel || !close.current) return;
    const id = Symbol('modal');
    stack.push(id);
    const opener = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    (panel.querySelector<HTMLElement>('[autofocus],input,textarea,select') ?? panel).focus({ preventScroll: true });

    const onKey = (event: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id) return;
      if (event.key === 'Escape') { event.stopPropagation(); close.current?.(); return; }
      if (event.key !== 'Tab') return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((item) => item.offsetParent !== null);
      if (!items.length) { event.preventDefault(); return; }
      const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      stack.splice(stack.indexOf(id), 1);
      document.body.style.overflow = previousOverflow;
      opener?.focus?.({ preventScroll: true });
    };
  }, [active]);

  return { ref, role: 'dialog' as const, 'aria-modal': true as const, 'aria-label': label, tabIndex: -1 };
}
