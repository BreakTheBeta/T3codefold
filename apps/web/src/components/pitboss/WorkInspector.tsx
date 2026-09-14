import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useResizableWidth } from "../../hooks/useResizableWidth";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "../ui/dialog";

/** A focused work view; resizing its list never re-renders the conversation. */
export function WorkInspector({
  open,
  onOpenChange,
  onReturnToChat,
  scrollRef,
  header,
  list,
  selected,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReturnToChat: () => void;
  scrollRef: RefObject<HTMLDivElement | null>;
  header: ReactNode;
  list?: ReactNode;
  selected: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const maxWidth = Math.max(320, Math.min(520, availableWidth ? availableWidth - 440 : 520));
  const { width, handlers, resizeTo } = useResizableWidth({
    storageKey: "t3code:glados-work-width",
    defaultWidth: 360,
    minWidth: 320,
    maxWidth,
    edge: "right",
  });
  const wide = !!list && availableWidth >= 840;
  useLayoutEffect(() => {
    const surface = ref.current;
    if (!open || !surface) return;
    const measure = () => setAvailableWidth(surface.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(surface);
    return () => observer.disconnect();
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup
        keepMounted
        showCloseButton={false}
        bottomStickOnMobile={false}
        className="flex h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-7xl flex-col gap-0 overflow-hidden p-0"
        finalFocus={() => {
          onReturnToChat();
          return false;
        }}
      >
        <DialogTitle className="sr-only">GLaDOS work</DialogTitle>
        <DialogDescription className="sr-only">
          Explore outcomes and their evidence. Return to chat to describe new work.
        </DialogDescription>
        {header}
        <div ref={ref} className="relative flex min-h-0 flex-1" aria-label="GLaDOS work inspector">
          {list && (
            <div
              aria-label="Work list"
              className={`${!wide && selected ? "hidden" : "block"} min-h-0 shrink-0 overflow-y-auto overscroll-contain p-4 ${wide ? "border-r border-border" : "w-full"}`}
              style={wide ? { width } : undefined}
            >
              {list}
            </div>
          )}
          {wide && (
            <div
              role="separator"
              tabIndex={0}
              aria-label="Resize work list"
              aria-orientation="vertical"
              aria-valuemin={320}
              aria-valuemax={maxWidth}
              aria-valuenow={Math.round(width)}
              aria-valuetext={`${Math.round(width)} pixels`}
              style={{ left: width - 4 }}
              className="absolute inset-y-0 z-10 w-2 touch-none cursor-col-resize hover:bg-primary/20 focus-visible:bg-primary/20 focus-visible:outline-2 focus-visible:outline-primary"
              {...handlers}
              onDoubleClick={() => resizeTo(360)}
              onKeyDown={(event) => {
                const step = event.shiftKey ? 64 : 16;
                const next =
                  event.key === "ArrowRight"
                    ? width + step
                    : event.key === "ArrowLeft"
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
            aria-label="Outcome details"
            className={`${list && !wide && !selected ? "hidden" : "block"} min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-7`}
          >
            {children}
          </div>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
