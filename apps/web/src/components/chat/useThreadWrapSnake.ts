import { useEffect, useState } from "react";

/**
 * Thread wrapping balances a reply across its columns, which is ideal until
 * the balanced columns grow taller than the screen and reading on means
 * scrolling back up. Past that point the reply "snakes": it pins as a
 * screen-height window of columns, and scrolling through it shifts the text
 * along the columns, so lines leaving the top of one column arrive at the
 * bottom of the column before it.
 *
 * The reply's track grows by its remaining length (its travel) so the
 * timeline scrolls through it at reading speed. All writes are DOM attributes and
 * custom properties, so rows never re-render while scrolling. Returns a ref
 * callback for the element that holds the reply's markdown.
 */
export function useThreadWrapSnake(enabled: boolean) {
  const [element, setElement] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!enabled || !element) return;
    const track = element.querySelector<HTMLElement>("[data-thread-wrap-track]");
    const source = track?.querySelector<HTMLElement>("[data-assistant-citation-source]");
    const markdown = source?.querySelector<HTMLElement>(".chat-markdown");
    const scroller = findScrollParent(element);
    if (!track || !source || !markdown || !scroller) return;

    let travel = 0;
    let offset = 0;
    let frame: number | null = null;

    const setSnake = (snake: boolean) => {
      if (snake) element.dataset.threadWrapSnake = "true";
      else delete element.dataset.threadWrapSnake;
    };

    // Advances the text by how far the pinned window has stuck past its
    // natural place, which is exactly how far the reader scrolled into it.
    const follow = () => {
      frame = null;
      if (element.dataset.threadWrapSnake !== "true" || travel <= 0) return;
      const next = Math.round(
        Math.min(
          travel,
          Math.max(0, source.getBoundingClientRect().top - track.getBoundingClientRect().top),
        ),
      );
      if (next === offset) return;
      offset = next;
      markdown.style.setProperty("--thread-wrap-snake-offset", `${offset}px`);
      source.style.setProperty("--thread-wrap-snake-progress", String(offset / travel));
      const moving = offset > 0 && offset < travel;
      if (moving !== (source.dataset.threadWrapSnaking === "true")) {
        if (moving) source.dataset.threadWrapSnaking = "true";
        else delete source.dataset.threadWrapSnaking;
      }
    };
    const scheduleFollow = () => {
      if (frame === null) frame = requestAnimationFrame(follow);
    };

    const measure = () => {
      const columns = Number.parseInt(getComputedStyle(markdown).columnCount, 10);
      const pageHeight = Number.parseFloat(
        getComputedStyle(markdown).getPropertyValue("--thread-wrap-page-height"),
      );
      // Columns only engage on wide screens; anywhere else the reply reads normally.
      if (!(columns >= 2) || !(pageHeight > 0)) {
        setSnake(false);
        return;
      }
      if (element.dataset.threadWrapSnake !== "true") {
        if (markdown.getBoundingClientRect().height <= pageHeight + 1) return;
        setSnake(true);
      }
      const length = snakeFlowLength(markdown, columns, pageHeight) + offset;
      const nextTravel = Math.max(0, Math.round(length - columns * pageHeight));
      if (nextTravel <= 1) {
        // The reply fits on one screen after all, so it balances again.
        setSnake(false);
        travel = 0;
        return;
      }
      if (nextTravel !== travel) {
        travel = nextTravel;
        track.style.setProperty("--thread-wrap-snake-travel", `${travel}px`);
      }
      scheduleFollow();
    };

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    observer.observe(markdown);
    // A shorter window lowers the page height without resizing the reply.
    window.addEventListener("resize", measure);
    scroller.addEventListener("scroll", scheduleFollow, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      scroller.removeEventListener("scroll", scheduleFollow);
      if (frame !== null) cancelAnimationFrame(frame);
      setSnake(false);
      delete source.dataset.threadWrapSnaking;
      track.style.removeProperty("--thread-wrap-snake-travel");
      source.style.removeProperty("--thread-wrap-snake-progress");
      markdown.style.removeProperty("--thread-wrap-snake-offset");
    };
  }, [element, enabled]);

  return setElement;
}

/**
 * Height the reply would take as one column, read from where its last line
 * lands among the fixed-height columns. Excludes the current snake offset.
 */
function snakeFlowLength(markdown: HTMLElement, columns: number, pageHeight: number) {
  const box = markdown.getBoundingClientRect();
  const rects = markdown.lastElementChild?.getClientRects();
  const last = rects?.[rects.length - 1];
  if (!last) return 0;
  const pitch =
    (box.width + Number.parseFloat(getComputedStyle(markdown).columnGap || "0")) / columns;
  const column = Math.max(0, Math.floor((last.left - box.left + 1) / pitch));
  return column * pageHeight + (last.bottom - box.top);
}

function findScrollParent(element: HTMLElement) {
  for (let node = element.parentElement; node; node = node.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)) return node;
  }
  return null;
}
