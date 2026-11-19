import { useRef } from "react";
import { TextInput, View, type TextInputInstance } from "react-native";
import { T, useGT, useMessages } from "gt-react-native";

import { AppText as Text } from "../../../components/ui/AppText";
import type { ComposerEditorSelection } from "../../../components/ComposerEditor";
import {
  ComposerDictationCancelAction,
  ComposerDictationError,
  ComposerDictationPrimaryAction,
  ComposerDictationStartAction,
  ComposerDictationStatus,
  ComposerDictationToolbar,
} from "../../voice-input/ComposerDictationControl";
import type { useVoiceInputController } from "../../voice-input/useVoiceInputController";
import { resolveVoiceComposerPresentation } from "../../voice-input/voiceInputPresentation";
import { ControllerPressable } from "../../controller/ControllerPressable";

export function ScheduledTaskPromptField(props: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly selection: ComposerEditorSelection;
  readonly onChangeSelection: (selection: ComposerEditorSelection) => void;
  readonly disabled: boolean;
  readonly voiceInput: ReturnType<typeof useVoiceInputController>;
}) {
  const gt = useGT();
  const m = useMessages();
  const voice = props.voiceInput;
  const inputRef = useRef<TextInputInstance>(null);
  const presentation = resolveVoiceComposerPresentation(voice.state, voice.elapsedSeconds, m);
  const showsDictation = presentation.statusKind === "active";
  const showsIdleTrigger = voice.isAvailable && !showsDictation;

  return (
    <View className="gap-2 border-t border-border-subtle px-4 py-3">
      <Text className="text-sm text-foreground-muted">
        <T>Prompt</T>
      </Text>
      <View className="flex-row items-end">
        <ControllerPressable
          touchPassthrough
          reply
          style={{ flex: 1, minWidth: 0 }}
          accessibilityLabel={gt("Prompt. X or Square dictates")}
          disabled={props.disabled}
          onActivate={() => inputRef.current?.focus()}
          onDictate={() => {
            if (voice.isBusy) voice.stop();
            else if (voice.isAvailable) voice.start();
            else return false;
          }}
        >
          <TextInput
            ref={inputRef}
            accessibilityLabel={gt("Prompt")}
            value={props.value}
            onChangeText={props.onChange}
            selection={props.selection}
            onSelectionChange={({ nativeEvent }) => props.onChangeSelection(nativeEvent.selection)}
            readOnly={props.disabled || voice.freezesEditor}
            multiline
            scrollEnabled
            textAlignVertical="top"
            placeholder={gt("What should the agent do each time?")}
            placeholderTextColorClassName="accent-foreground-muted"
            className="max-h-40 min-h-24 min-w-0 flex-1 font-sans text-base text-foreground"
          />
        </ControllerPressable>
        {showsIdleTrigger ? (
          <ComposerDictationStartAction
            state={voice.state}
            isAvailable={voice.isAvailable}
            disabled={props.disabled}
            onStart={voice.start}
            onCancel={voice.cancel}
          />
        ) : null}
      </View>
      <ComposerDictationError
        error={voice.state.phase === "error" ? voice.state.error : null}
        onDismiss={voice.cancel}
      />
      {showsDictation ? (
        <ComposerDictationToolbar showsDictation>
          <View className="h-11 flex-row items-center">
            <ComposerDictationCancelAction presentation={presentation} onCancel={voice.cancel} />
            <ComposerDictationStatus
              audioLevels={voice.audioLevels}
              elapsedSeconds={voice.elapsedSeconds}
              phase={voice.state.phase}
              presentation={presentation}
            />
            <ComposerDictationPrimaryAction
              state={voice.state}
              presentation={presentation}
              isAvailable={voice.isAvailable}
              disabled={props.disabled}
              onStart={voice.start}
              onConfirm={voice.stop}
              onCancel={voice.cancel}
            />
          </View>
        </ComposerDictationToolbar>
      ) : null}
    </View>
  );
}
