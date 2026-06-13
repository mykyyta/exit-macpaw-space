import { useRef } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import type { QuestLanguage } from "../../shared/voice";
import { unlockReplyAudio } from "../audio/unlock";
import { VOICE_COPY } from "../copy/voice-copy";

export default function SceneMic({
  isListening,
  isBusy,
  speechAvailable,
  voiceLanguage,
  onStart,
  onStop,
}: {
  isListening: boolean;
  isBusy: boolean;
  speechAvailable: boolean;
  voiceLanguage: QuestLanguage;
  onStart: () => void;
  onStop: () => void;
}) {
  const activePointerIdRef = useRef<number | null>(null);
  const keyboardHoldActiveRef = useRef(false);
  const copy = VOICE_COPY[voiceLanguage];
  const prompt =
    isListening
      ? copy.micSpeaking
      : isBusy
      ? copy.micBusy
      : speechAvailable
        ? copy.micReady
        : copy.micUnavailable;

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (
      (event.pointerType === "mouse" && event.button !== 0) ||
      (isBusy && !isListening) ||
      (!speechAvailable && !isListening)
    ) {
      return;
    }

    event.preventDefault();
    unlockReplyAudio();

    if (isListening) {
      activePointerIdRef.current = null;
      onStop();
      return;
    }

    activePointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    onStart();
  }

  function handlePointerUp(event: PointerEvent<HTMLButtonElement>) {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    event.preventDefault();
    activePointerIdRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    unlockReplyAudio();
    onStop();
  }

  function handlePointerCancel(event: PointerEvent<HTMLButtonElement>) {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    activePointerIdRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    onStop();
  }

  function handleClick() {
    if (!isListening) {
      return;
    }

    activePointerIdRef.current = null;
    onStop();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (
      event.repeat ||
      (event.key !== " " && event.key !== "Enter") ||
      isListening ||
      isBusy ||
      !speechAvailable
    ) {
      return;
    }

    event.preventDefault();
    unlockReplyAudio();
    keyboardHoldActiveRef.current = true;
    onStart();
  }

  function handleKeyUp(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== " " && event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    keyboardHoldActiveRef.current = false;

    onStop();
  }

  function handleBlur() {
    if (!keyboardHoldActiveRef.current) {
      return;
    }

    keyboardHoldActiveRef.current = false;
    onStop();
  }

  return (
    <button
      className={`scene-mic ${isListening ? "scene-mic--active" : ""}`}
      type="button"
      onBlur={handleBlur}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onPointerCancel={handlePointerCancel}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      aria-label={
        isListening || isBusy
          ? copy.micWaitAria
          : speechAvailable
            ? copy.micPressAria
            : copy.micUnavailable
      }
      disabled={(isBusy || !speechAvailable) && !isListening}
    >
      <span className="scene-mic-icon" aria-hidden="true" />
      <span className="scene-mic-text">
        <span className="scene-mic-copy">{prompt}</span>
        <span className="scene-mic-hint">{copy.micAudioHint}</span>
      </span>
    </button>
  );
}
