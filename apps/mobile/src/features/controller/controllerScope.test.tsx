import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
vi.mock("react-native", () => ({
  Platform: { OS: "android" },
  Pressable: ({ children }: { children: React.ReactNode }) => children,
}));
import { ControllerScope, useControllerNativeScope } from "./controllerScope";
import { ControllerPressable } from "./ControllerPressable";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
it("publishes request, question, and effective availability changes to the native scope", () => {
  let nativeScope = "";
  function Probe({
    request,
    question,
    disabled,
  }: {
    request: string;
    question: string;
    disabled: boolean;
  }) {
    const scope = useControllerNativeScope("thread-a");
    useEffect(() => {
      nativeScope = scope;
    }, [scope]);
    return (
      <ControllerScope value="thread-a">
        <ControllerPressable
          controllerKey={`${request}:${question}`}
          disabled={disabled}
          onActivate={() => {}}
        />
      </ControllerScope>
    );
  }
  const root = createRoot(document.createElement("div"));
  try {
    act(() => root.render(<Probe request="request-a" question="question-a" disabled={false} />));
    const initial = nativeScope;
    act(() => root.render(<Probe request="request-b" question="question-a" disabled={false} />));
    expect(nativeScope).not.toBe(initial);
    const requestChanged = nativeScope;
    act(() => root.render(<Probe request="request-b" question="question-b" disabled={false} />));
    expect(nativeScope).not.toBe(requestChanged);
    const questionChanged = nativeScope;
    act(() => root.render(<Probe request="request-b" question="question-b" disabled />));
    expect(nativeScope).not.toBe(questionChanged);
  } finally {
    act(() => root.unmount());
  }
});
