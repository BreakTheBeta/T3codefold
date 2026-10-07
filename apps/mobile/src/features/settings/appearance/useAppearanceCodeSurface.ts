import { useCallback, useMemo } from "react";

import {
  resolveMobileCodeSurface,
  normalizeCodeFontSize,
  type ResolvedMobileCodeSurface,
} from "../../../lib/appearancePreferences";
import { createNativeReviewDiffStyle } from "../../review/nativeReviewDiffAdapter";
import { createNativeSourceStyle } from "../../files/nativeSourceFileAdapter";
import { useAppearancePreferences } from "./AppearancePreferencesProvider";

export function useAppearanceCodeSurface(): {
  readonly codeSurface: ResolvedMobileCodeSurface;
  readonly codeWordBreak: boolean;
  readonly onFontScaleCommit: (event: { readonly nativeEvent: { readonly scale: number } }) => void;
  readonly nativeSourceStyle: ReturnType<typeof createNativeSourceStyle>;
  readonly nativeReviewDiffStyle: ReturnType<typeof createNativeReviewDiffStyle>;
} {
  const { appearance, setCodeFontSize } = useAppearancePreferences();
  const codeSurface = useMemo(
    () => resolveMobileCodeSurface(appearance.codeFontSize),
    [appearance.codeFontSize],
  );
  const onFontScaleCommit = useCallback(
    (event: { readonly nativeEvent: { readonly scale: number } }) => {
      if (!Number.isFinite(event.nativeEvent.scale)) return;
      const next = normalizeCodeFontSize(appearance.codeFontSize * event.nativeEvent.scale);
      if (next !== appearance.codeFontSize) setCodeFontSize(next);
    },
    [appearance.codeFontSize, setCodeFontSize],
  );
  const nativeSourceStyle = useMemo(
    () => createNativeSourceStyle(codeSurface, appearance.codeWordBreak),
    [codeSurface, appearance.codeWordBreak],
  );
  const nativeReviewDiffStyle = useMemo(
    () => createNativeReviewDiffStyle(codeSurface, appearance.codeWordBreak),
    [appearance.codeWordBreak, codeSurface],
  );

  return {
    codeSurface,
    onFontScaleCommit,
    codeWordBreak: appearance.codeWordBreak,
    nativeSourceStyle,
    nativeReviewDiffStyle,
  };
}
