import { MAX_THEME_BACKDROP_SEED } from "@t3tools/contracts";
import {
  renderSplatterPreview,
  type SplatterRenderOptions,
} from "@t3tools/shared/splatterBackdrop";
import { type RefObject, useEffect, useRef, useState } from "react";

import { cn } from "../../lib/utils";

/** Patterns added each time the strip is scrolled to its end. */
const PAGE = 24;
/** A desktop canvas's shape, so the thumbnail shows the layout the app uses. */
const [PREVIEW_WIDTH, PREVIEW_HEIGHT] = [1600, 1000];
/** Shrunk to a thumbnail, paint tuned to sit behind text fades to nothing;
 *  stronger paint keeps each pattern's shape readable. */
const PREVIEW_INTENSITY_BOOST = 4;

type PreviewOptions = Omit<SplatterRenderOptions, "seed">;

/**
 * A horizontally scrolling strip of pattern thumbnails, in the paint the
 * backdrop is using now. Thumbnails render only once scrolled near, and more
 * patterns load as the strip reaches its end.
 */
export function SplatterPatternGallery(props: {
  readonly options: PreviewOptions;
  readonly selectedSeed: number;
  readonly onSelect: (seed: number) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(PAGE);
  // A shuffled seed is far past the strip, so it leads it until the next visit.
  const [pinned] = useState(props.selectedSeed >= PAGE ? props.selectedSeed : null);

  useEffect(() => {
    const end = endRef.current;
    if (!end) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setCount((current) => Math.min(MAX_THEME_BACKDROP_SEED + 1, current + PAGE));
        }
      },
      { root: scrollerRef.current, rootMargin: "0px 400px" },
    );
    observer.observe(end);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    scrollerRef.current
      ?.querySelector<HTMLElement>("[aria-pressed='true']")
      ?.scrollIntoView({ block: "nearest", inline: "center" });
    // Only on open: following every pick would yank the strip out from under the pointer.
  }, []);

  const seeds = Array.from({ length: count }, (_, seed) => seed);
  if (pinned !== null) seeds.unshift(pinned);

  return (
    <div
      ref={scrollerRef}
      className="flex snap-x gap-2 overflow-x-auto px-4 pt-1 pb-3 sm:px-5"
      aria-label="Splatter patterns"
      role="group"
    >
      {seeds.map((seed) => (
        <PatternThumbnail
          key={seed}
          seed={seed}
          options={props.options}
          root={scrollerRef}
          selected={seed === props.selectedSeed}
          onSelect={props.onSelect}
        />
      ))}
      <div ref={endRef} className="w-px shrink-0" />
    </div>
  );
}

function PatternThumbnail(props: {
  readonly seed: number;
  readonly options: PreviewOptions;
  readonly root: RefObject<HTMLDivElement | null>;
  readonly selected: boolean;
  readonly onSelect: (seed: number) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [near, setNear] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const { seed, options } = props;
  const [lead, second, third] = options.colors;

  useEffect(() => {
    const button = buttonRef.current;
    if (!button || near) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      { root: props.root.current, rootMargin: "0px 320px" },
    );
    observer.observe(button);
    return () => observer.disconnect();
  }, [near, props.root]);

  useEffect(() => {
    const image = imageRef.current;
    if (!near || !image) return;
    const svg = renderSplatterPreview(
      {
        colors: [lead, second, third],
        appearance: options.appearance,
        intensity: options.intensity * PREVIEW_INTENSITY_BOOST,
        glow: options.glow,
        seed,
      },
      PREVIEW_WIDTH,
      PREVIEW_HEIGHT,
    );
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [near, seed, lead, second, third, options.appearance, options.intensity, options.glow]);

  return (
    <button
      ref={buttonRef}
      type="button"
      aria-pressed={props.selected}
      aria-label={seed === 0 ? "Original splatter pattern" : `Splatter pattern ${seed}`}
      className={cn(
        "relative h-30 w-48 shrink-0 snap-start overflow-hidden rounded-lg border bg-background outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring",
        props.selected ? "border-primary ring-2 ring-primary" : "border-border hover:border-ring",
      )}
      onClick={() => props.onSelect(seed)}
    >
      <img ref={imageRef} alt="" className="size-full" draggable={false} />
      <span className="absolute bottom-1 left-1.5 rounded bg-background/80 px-1 font-mono text-[10px] text-muted-foreground tabular-nums">
        {seed === 0 ? "Original" : `#${seed}`}
      </span>
    </button>
  );
}
