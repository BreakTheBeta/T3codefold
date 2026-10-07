import { useEffect, useState } from "react";

/**
 * Thread wrapping balances a reply across its columns, which is ideal until
 * the balanced columns grow taller than the screen and reading on means
 * scrolling back up. Past that point the reply switches to screen-height
 * pages of columns. Paged layout is always at least a page tall, so the
 * switch is decided from the rendered height alone: a balanced reply taller
 * than a page pages, and a paged reply that fits in one page balances again.
 * Returns a ref callback for the element that holds the reply's markdown.
 */
export function useThreadWrapPaging(enabled: boolean) {
  const [element, setElement] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!enabled || !element) return;
    const update = () => {
      const markdown = element.querySelector<HTMLElement>(".chat-markdown");
      if (!markdown) return;
      const pageHeight = Number.parseFloat(
        getComputedStyle(markdown).getPropertyValue("--thread-wrap-page-height"),
      );
      if (!(pageHeight > 0)) return;
      const height = markdown.getBoundingClientRect().height;
      const paged = element.dataset.threadWrapPaged === "true";
      if (!paged && height > pageHeight + 1) {
        element.dataset.threadWrapPaged = "true";
      } else if (paged && height <= pageHeight + 1) {
        delete element.dataset.threadWrapPaged;
      }
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    // A shorter window lowers the page height without resizing the reply.
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      delete element.dataset.threadWrapPaged;
    };
  }, [element, enabled]);

  return setElement;
}
