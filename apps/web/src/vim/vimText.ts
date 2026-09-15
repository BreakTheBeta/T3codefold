export type VimMotion =
  | "h"
  | "j"
  | "k"
  | "l"
  | "w"
  | "b"
  | "e"
  | "0"
  | "^"
  | "$"
  | "gg"
  | "G"
  | "{"
  | "}";

export type TextRange = { start: number; end: number };

const isWord = (character: string | undefined) =>
  character !== undefined && /[\p{Letter}\p{Number}_]/u.test(character);

const clamp = (value: number, text: string) => Math.max(0, Math.min(text.length, value));

export function lineStart(text: string, offset: number): number {
  const previousBreak = text.lastIndexOf("\n", Math.max(0, clamp(offset, text) - 1));
  return previousBreak + 1;
}

export function lineEnd(text: string, offset: number): number {
  const nextBreak = text.indexOf("\n", clamp(offset, text));
  return nextBreak === -1 ? text.length : nextBreak;
}

function moveVertical(text: string, offset: number, direction: -1 | 1, count: number): number {
  let current = clamp(offset, text);
  const column = current - lineStart(text, current);
  for (let index = 0; index < count; index += 1) {
    if (direction < 0) {
      const start = lineStart(text, current);
      if (start === 0) return current;
      const previousEnd = start - 1;
      const previousStart = lineStart(text, previousEnd);
      current = Math.min(previousStart + column, previousEnd);
    } else {
      const end = lineEnd(text, current);
      if (end === text.length) return current;
      const nextStart = end + 1;
      current = Math.min(nextStart + column, lineEnd(text, nextStart));
    }
  }
  return current;
}

function nextWordStart(text: string, offset: number): number {
  let cursor = clamp(offset, text);
  if (isWord(text[cursor])) {
    while (isWord(text[cursor])) cursor += 1;
  } else if (text[cursor] && !/\s/u.test(text[cursor]!)) {
    while (text[cursor] && !/\s/u.test(text[cursor]!) && !isWord(text[cursor])) cursor += 1;
  }
  while (cursor < text.length && /\s/u.test(text[cursor]!)) cursor += 1;
  return cursor;
}

function previousWordStart(text: string, offset: number): number {
  let cursor = Math.max(0, clamp(offset, text) - 1);
  while (cursor > 0 && /\s/u.test(text[cursor]!)) cursor -= 1;
  const word = isWord(text[cursor]);
  while (cursor > 0 && !/\s/u.test(text[cursor - 1]!) && isWord(text[cursor - 1]) === word) {
    cursor -= 1;
  }
  return cursor;
}

function nextWordEnd(text: string, offset: number): number {
  let cursor = clamp(offset, text);
  while (cursor < text.length && /\s/u.test(text[cursor]!)) cursor += 1;
  const word = isWord(text[cursor]);
  while (cursor < text.length && !/\s/u.test(text[cursor]!) && isWord(text[cursor]) === word) {
    cursor += 1;
  }
  return Math.max(0, cursor - 1);
}

function paragraphMotion(text: string, offset: number, direction: -1 | 1): number {
  if (direction < 0) {
    const before = text.slice(0, Math.max(0, offset - 1));
    const match = /\n\s*\n(?![\s\S]*\n\s*\n)/u.exec(before);
    return match ? match.index + match[0].length : 0;
  }
  const after = text.slice(offset);
  const match = /\n\s*\n/u.exec(after);
  return match ? offset + match.index + match[0].length : text.length;
}

export function moveTextCursor(text: string, offset: number, motion: VimMotion, count = 1): number {
  const repetitions = Math.max(1, count);
  let cursor = clamp(offset, text);
  if (motion === "gg") return 0;
  if (motion === "G") return text.length;
  if (motion === "0") return lineStart(text, cursor);
  if (motion === "^") {
    const start = lineStart(text, cursor);
    const content = /^\s*/u.exec(text.slice(start, lineEnd(text, cursor)))?.[0].length ?? 0;
    return start + content;
  }
  if (motion === "$") return lineEnd(text, cursor);
  if (motion === "j" || motion === "k") {
    return moveVertical(text, cursor, motion === "j" ? 1 : -1, repetitions);
  }

  for (let index = 0; index < repetitions; index += 1) {
    switch (motion) {
      case "h":
        cursor = Math.max(0, cursor - 1);
        break;
      case "l":
        cursor = Math.min(text.length, cursor + 1);
        break;
      case "w":
        cursor = nextWordStart(text, cursor);
        break;
      case "b":
        cursor = previousWordStart(text, cursor);
        break;
      case "e":
        cursor = nextWordEnd(text, cursor + (index === 0 ? 0 : 1));
        break;
      case "{":
        cursor = paragraphMotion(text, cursor, -1);
        break;
      case "}":
        cursor = paragraphMotion(text, cursor, 1);
        break;
      default:
        break;
    }
  }
  return cursor;
}

export function currentLineRange(text: string, offset: number): TextRange {
  const start = lineStart(text, offset);
  const end = lineEnd(text, offset);
  return { start, end: end < text.length ? end + 1 : end };
}

export function currentWordRange(text: string, offset: number, around: boolean): TextRange {
  if (text.length === 0) return { start: 0, end: 0 };
  let cursor = Math.min(Math.max(0, offset), text.length - 1);
  if (!isWord(text[cursor])) {
    while (cursor < text.length && !isWord(text[cursor])) cursor += 1;
    if (cursor === text.length) return { start: offset, end: offset };
  }
  let start = cursor;
  let end = cursor + 1;
  while (start > 0 && isWord(text[start - 1])) start -= 1;
  while (end < text.length && isWord(text[end])) end += 1;
  if (around) {
    const originalEnd = end;
    while (end < text.length && /[^\S\n]/u.test(text[end]!)) end += 1;
    if (end === originalEnd) {
      while (start > 0 && /[^\S\n]/u.test(text[start - 1]!)) start -= 1;
    }
  }
  return { start, end };
}

export function orderedRange(anchor: number, focus: number, inclusive = false): TextRange {
  return {
    start: Math.min(anchor, focus),
    end: Math.max(anchor, focus) + (inclusive && focus >= anchor ? 1 : 0),
  };
}
