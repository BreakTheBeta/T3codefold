import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useResizableWidth } from "../../hooks/useResizableWidth";

/** Owns measurements so dragging does not re-render the conversation or work list. */
export function WorkInspector({
  open,
  scrollRef,
  children,
}: {
  open: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const maxWidth = Math.max(320, Math.min(720, availableWidth ? availableWidth - 420 : 720));
  const { width, handlers, resizeTo } = useResizableWidth({
    storageKey: "t3code:glados-work-width",
    defaultWidth: 420,
    minWidth: 320,
    maxWidth,
    edge: "left",
  });
  const inline = open && availableWidth >= 840;
  useLayoutEffect(() => {
    if (!open) return;
    const host = ref.current?.closest<HTMLElement>("[data-glados-layout]");
    if (!host) return;
    const measure = () => setAvailableWidth(host.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, [open]);
  useLayoutEffect(() => {
    const host = ref.current?.closest<HTMLElement>("[data-glados-layout]");
    if (!host) return;
    host.style.setProperty("--glados-work-width", `${width}px`);
    return () => {
      host.style.removeProperty("--glados-work-width");
    };
  }, [width]);
  return (
    <div
      ref={ref}
      hidden={!open}
      data-glados-inline={inline ? "true" : "false"}
      className={
        inline
          ? "relative col-start-2 row-start-3 min-h-0 min-w-0 border-l border-border"
          : "relative min-h-0 max-h-[45dvh] shrink-0 border-b border-border"
      }
    >
      {inline && (
        <div
          role="separator"
          tabIndex={0}
          aria-label="Resize GLaDOS work sidebar"
          aria-orientation="vertical"
          aria-valuemin={320}
          aria-valuemax={maxWidth}
          aria-valuenow={Math.round(width)}
          aria-valuetext={`${Math.round(width)} pixels`}
          className="absolute inset-y-0 -left-1 z-20 w-2 touch-none cursor-col-resize hover:bg-primary/20 focus-visible:bg-primary/20 focus-visible:outline-2 focus-visible:outline-primary"
          {...handlers}
          onDoubleClick={() => resizeTo(420)}
          onKeyDown={(event) => {
            const step = event.shiftKey ? 64 : 16;
            const next =
              event.key === "ArrowLeft"
                ? width + step
                : event.key === "ArrowRight"
                  ? width - step
                  : event.key === "Home"
                    ? 320
                    : event.key === "End"
                      ? maxWidth
                      : undefined;
            if (next === undefined) return;
            event.preventDefault();
            resizeTo(next);
          }}
        />
      )}
      <div
        ref={scrollRef}
        aria-label="GLaDOS work inspector"
        className={
          inline
            ? "h-full overflow-y-auto overscroll-contain px-4 py-3"
            : "max-h-[45dvh] overflow-y-auto overscroll-contain px-4 py-3"
        }
      >
        {children}
      </div>
    </div>
  );
}
