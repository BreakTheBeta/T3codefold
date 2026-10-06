export interface LocalDictationBackend {
  start(
    callbacks: {
      phrase(text: string): void;
      ended(): void;
      failed(message: string): void;
      preparing(message: string): void;
    },
    signal: AbortSignal,
  ): Promise<void>;
  stop(flush: boolean): Promise<void>;
  getStatus(): { isRecording: boolean; metering: number; durationMillis: number };
  configure(): Promise<void>;
}

export function getLocalDictationBackend(): LocalDictationBackend | null {
  return null;
}
