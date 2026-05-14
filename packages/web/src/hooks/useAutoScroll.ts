import { useEffect, useRef } from 'react';

/** Returns a ref for the scroll container. On `trigger` change, scrolls to the bottom
 *  unless the user has scrolled away (>= 100 px above the bottom). */
export function useAutoScroll<T extends HTMLElement>(trigger: unknown) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distance < 100) {
      el.scrollTop = el.scrollHeight;
    }
  }, [trigger]);
  return ref;
}
