import { useCallback, useLayoutEffect, useRef, useState } from "react";

// Keep in sync with --thread-wrap-column-width and --thread-wrap-gap.
const COLUMN_WIDTH_REM = 42;
const COLUMN_GAP_REM = 3.5;
const TOP_INSET_REM = 0.75;
const BOTTOM_GAP_REM = 0.75;
const MIN_PAGE_HEIGHT_REM = 18;

export interface ThreadRibbon {
  readonly columns: number;
  readonly pageHeight: number;
}

/**
 * Thread wrapping's ribbon: once a thread is taller than one screen and the
 * timeline fits several reading-width columns, the whole thread flows
 * through them like one continuous strip of paper. LegendList's content
 * container pins as a screen-height window of columns, and scrolling feeds
 * the thread through it, so text leaving the top of one column arrives at the
 * bottom of the column before it.
 *
 * Scroll position maps 1:1 to the ribbon position: scrollTop is the
 * single-column offset of the first column's top. LegendList keeps measuring
 * and virtualizing in single-column coordinates, so jumps, anchoring and
 * the minimap keep working; it only needs to draw the extra columns' worth
 * of rows (see the returned page size). A spacer after the window keeps the
 * scroll range ending exactly when the thread's end reaches the last column.
 *
 * Every per-frame write is a DOM style, so rows never re-render while
 * scrolling; the hook re-renders its owner only when the ribbon turns on, off,
 * or changes shape.
 */
export function useThreadRibbon({
  scroller,
  maxColumns,
  composerInset,
}: {
  scroller: HTMLElement | null;
  maxColumns: number | null;
  composerInset: number;
}) {
  const [ribbon, setRibbon] = useState<ThreadRibbon | null>(null);
  const endRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const content = scroller?.firstElementChild;
    // A previous run's cleanup already cleared the ribbon.
    if (!scroller || maxColumns === null || !(content instanceof HTMLElement)) return;
    const spacer = document.createElement("div");
    spacer.setAttribute("aria-hidden", "true");
    spacer.dataset.threadRibbonSpacer = "";
    const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    let offset = -1;
    let frame: number | null = null;

    // The flow's first child carries the ribbon offset as a negative margin.
    const lead = () =>
      content.firstElementChild instanceof HTMLElement ? content.firstElementChild : null;

    const follow = () => {
      frame = null;
      const end = endRef.current;
      if (end === null) return;
      const next = Math.round(Math.min(end, Math.max(0, scroller.scrollTop)));
      if (next === offset) return;
      offset = next;
      lead()?.style.setProperty("margin-top", `${-offset}px`);
    };
    const scheduleFollow = () => {
      if (frame === null) frame = requestAnimationFrame(follow);
    };

    // Computed heights are the unfragmented single-column heights, even for
    // children split across columns.
    const contentLength = () =>
      Array.from(content.children).reduce(
        (sum, child) => sum + (Number.parseFloat(getComputedStyle(child).height) || 0),
        0,
      );

    const deactivate = () => {
      endRef.current = null;
      delete scroller.dataset.threadRibbon;
      spacer.remove();
      lead()?.style.removeProperty("margin-top");
      offset = -1;
      setRibbon(null);
    };

    const measure = () => {
      const style = getComputedStyle(scroller);
      const width =
        scroller.clientWidth -
        Number.parseFloat(style.paddingLeft) -
        Number.parseFloat(style.paddingRight);
      const columnWidth = COLUMN_WIDTH_REM * rem;
      const gap = COLUMN_GAP_REM * rem;
      const columns = Math.min(maxColumns, Math.floor((width + gap) / (columnWidth + gap)));
      const viewport = scroller.clientHeight;
      const top = TOP_INSET_REM * rem;
      const pageHeight = Math.floor(viewport - top - composerInset - BOTTOM_GAP_REM * rem);
      const length = contentLength();
      if (columns < 2 || pageHeight < MIN_PAGE_HEIGHT_REM * rem || length <= pageHeight) {
        if (endRef.current !== null) deactivate();
        return;
      }
      const previousEnd = endRef.current;
      // Entering the ribbon from the bottom of the thread lands at its end.
      const wasAtEnd =
        previousEnd === null
          ? scroller.scrollTop + viewport >= scroller.scrollHeight - 2
          : scroller.scrollTop >= previousEnd - 2;
      const end = Math.max(0, Math.ceil(length - columns * pageHeight));
      endRef.current = end;
      scroller.dataset.threadRibbon = "true";
      scroller.style.setProperty("--thread-ribbon-columns", String(columns));
      scroller.style.setProperty("--thread-ribbon-page-height", `${pageHeight}px`);
      scroller.style.setProperty("--thread-ribbon-top", `${top}px`);
      // scrollHeight - viewport = top + pageHeight + spacer - viewport = end.
      spacer.style.height = `${Math.max(0, end + viewport - pageHeight - top)}px`;
      if (!spacer.isConnected) scroller.append(spacer);
      if (wasAtEnd) scroller.scrollTop = end;
      setRibbon((current) =>
        current?.columns === columns && current.pageHeight === pageHeight
          ? current
          : { columns, pageHeight },
      );
      offset = -1;
      follow();
    };

    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    for (const child of Array.from(content.children)) observer.observe(child);
    // LegendList swaps its header and footer as history and anchoring change.
    const childObserver = new MutationObserver(() => {
      observer.disconnect();
      observer.observe(scroller);
      for (const child of Array.from(content.children)) observer.observe(child);
      measure();
    });
    childObserver.observe(content, { childList: true });
    scroller.addEventListener("scroll", scheduleFollow, { passive: true });
    measure();
    return () => {
      observer.disconnect();
      childObserver.disconnect();
      scroller.removeEventListener("scroll", scheduleFollow);
      if (frame !== null) cancelAnimationFrame(frame);
      deactivate();
      for (const name of [
        "--thread-ribbon-columns",
        "--thread-ribbon-page-height",
        "--thread-ribbon-top",
      ]) {
        scroller.style.removeProperty(name);
      }
    };
  }, [composerInset, maxColumns, scroller]);

  /** At the ribbon's end, or undefined when the ribbon is off. */
  const ribbonIsAtEnd = useCallback(() => {
    const end = endRef.current;
    if (end === null || !scroller) return undefined;
    return scroller.scrollTop >= end - 2;
  }, [scroller]);

  return { ribbon, ribbonIsAtEnd };
}
