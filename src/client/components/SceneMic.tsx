import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import type { QuestLanguage } from "../../shared/voice";
import {
  getMicStartDelayMs,
  playMicEndSignal,
  playMicStartSignal,
  pulseMicHaptic,
} from "../audio/mic-feedback";
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
  const startTimerRef = useRef<number | null>(null);
  const keyboardHoldActiveRef = useRef(false);
  const ignoreNextClickRef = useRef(false);
  const [isPrimed, setIsPrimed] = useState(false);
  const copy = VOICE_COPY[voiceLanguage];
  const prompt =
    isListening
      ? copy.micSpeaking
      : isBusy
      ? copy.micBusy
      : speechAvailable
        ? copy.micReady
        : copy.micUnavailable;

  useEffect(() => {
    return () => {
      if (startTimerRef.current !== null) {
        window.clearTimeout(startTimerRef.current);
      }
    };
  }, []);

  function clearPendingStart() {
    if (startTimerRef.current === null) {
      return false;
    }

    window.clearTimeout(startTimerRef.current);
    startTimerRef.current = null;
    setIsPrimed(false);
    return true;
  }

  function startAfterSignal() {
    clearPendingStart();
    setIsPrimed(true);
    playMicStartSignal();
    pulseMicHaptic();

    startTimerRef.current = window.setTimeout(() => {
      startTimerRef.current = null;
      setIsPrimed(false);
      onStart();
    }, getMicStartDelayMs());
  }

  function stopAfterSignal() {
    const cancelledPendingStart = clearPendingStart();

    if (cancelledPendingStart && !isListening) {
      return;
    }

    playMicEndSignal();
    onStop();
  }

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
      ignoreNextClickRef.current = true;
      stopAfterSignal();
      return;
    }

    activePointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    startAfterSignal();
  }

  function handlePointerUp(event: PointerEvent<HTMLButtonElement>) {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    event.preventDefault();
    activePointerIdRef.current = null;
    ignoreNextClickRef.current = true;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    unlockReplyAudio();
    stopAfterSignal();
  }

  function handlePointerCancel(event: PointerEvent<HTMLButtonElement>) {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    activePointerIdRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    stopAfterSignal();
  }

  function handleClick() {
    if (ignoreNextClickRef.current) {
      ignoreNextClickRef.current = false;
      return;
    }

    if (!isListening) {
      return;
    }

    activePointerIdRef.current = null;
    stopAfterSignal();
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
    startAfterSignal();
  }

  function handleKeyUp(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== " " && event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    keyboardHoldActiveRef.current = false;

    stopAfterSignal();
  }

  function handleBlur() {
    if (!keyboardHoldActiveRef.current) {
      clearPendingStart();
      return;
    }

    keyboardHoldActiveRef.current = false;
    stopAfterSignal();
  }

  const micClassName = [
    "scene-mic",
    isListening ? "scene-mic--active" : "",
    isPrimed ? "scene-mic--primed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      className={micClassName}
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
      <span className="scene-mic-icon" aria-hidden="true">
        <span className="scene-mic-meter">
          <i />
          <i />
          <i />
        </span>
      </span>
      <span className="scene-mic-text">
        <span className="scene-mic-copy">{prompt}</span>
        <span className="scene-mic-hint">{copy.micAudioHint}</span>
      </span>
    </button>
  );
}
