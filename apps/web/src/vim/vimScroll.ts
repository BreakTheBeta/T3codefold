type ScrollSurface = Pick<HTMLElement, "clientHeight" | "scrollHeight" | "scrollTop">;

type FrameScheduler = {
  request: (callback: FrameRequestCallback) => number;
  cancel: (id: number) => void;
};

type VimScrollControllerOptions = {
  scheduler?: FrameScheduler;
  prefersReducedMotion?: () => boolean;
};

type VimScrollPress = {
  code: string;
  continuous: boolean;
  repeat: boolean;
};

function moveImmediately(element: ScrollSurface, amount: number): boolean {
  const before = element.scrollTop;
  const maximum = Math.max(0, element.scrollHeight - element.clientHeight);
  element.scrollTop = Math.max(0, Math.min(maximum, before + amount));
  return element.scrollTop !== before;
}

/**
 * Drives Vim scrolling itself instead of repeatedly retargeting the browser's native smooth
 * animation. A held key owns one animator; OS key-repeat events never enqueue extra distance.
 */
export function createVimScrollController(options: VimScrollControllerOptions = {}) {
  const scheduler =
    options.scheduler ??
    ({
      request: (callback) => window.requestAnimationFrame(callback),
      cancel: (id) => window.cancelAnimationFrame(id),
    } satisfies FrameScheduler);
  const prefersReducedMotion =
    options.prefersReducedMotion ??
    (() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const animationFrames = new Set<number>();
  let sequence = 0;
  let heldCode: string | null = null;

  const requestFrame = (callback: FrameRequestCallback) => {
    const id = scheduler.request((timestamp) => {
      animationFrames.delete(id);
      callback(timestamp);
    });
    animationFrames.add(id);
  };

  const press = (element: ScrollSurface, distance: number, input: VimScrollPress) => {
    if (!distance) return false;
    if (prefersReducedMotion()) {
      return moveImmediately(element, distance);
    }
    if (input.repeat) return false;

    const activation = ++sequence;
    heldCode = input.code;
    const sign = Math.sign(distance);
    const amount = Math.abs(distance);
    const duration = Math.max(100, 20 * Math.log(amount));
    let calibration = 1;
    let elapsedTotal = 0;
    let previousTimestamp: number | null = null;
    let totalDelta = 0;

    const animate = (timestamp: number) => {
      if (previousTimestamp === null) {
        previousTimestamp = timestamp;
        requestFrame(animate);
        return;
      }

      // A suspended tab or busy frame must not turn into a large catch-up jump.
      const elapsed = Math.min(34, Math.max(0, timestamp - previousTimestamp));
      previousTimestamp = timestamp;
      elapsedTotal += elapsed;
      const stillHeld = input.continuous && sequence === activation && heldCode === input.code;

      if (stillHeld && elapsedTotal >= 75 && calibration >= 0.5 && calibration <= 1.6) {
        if (1.05 * calibration * amount < 150) calibration *= 1.05;
        if (0.95 * calibration * amount > 150) calibration *= 0.95;
      }

      let delta = Math.ceil(amount * (elapsed / duration) * calibration);
      if (!stillHeld) delta = Math.max(0, Math.min(delta, amount - totalDelta));
      if (delta > 0 && moveImmediately(element, sign * delta)) {
        totalDelta += delta;
        requestFrame(animate);
      }
    };

    requestFrame(animate);
    return true;
  };

  const release = (code: string) => {
    if (code !== heldCode) return;
    heldCode = null;
    sequence += 1;
  };

  const cancel = () => {
    heldCode = null;
    sequence += 1;
    for (const id of animationFrames) scheduler.cancel(id);
    animationFrames.clear();
  };

  return { cancel, press, release };
}
