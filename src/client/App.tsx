import { useEffect, useRef, useState } from "react";
import type {
  LeaderboardCompletionMetrics,
  LeaderboardEntry,
} from "../shared/leaderboard";
import type {
  QuestLanguage,
  QuestLanguageInput,
  QuestNameTagActor,
  QuestState,
} from "../shared/voice";
import { isUnsupportedDetectedTranscript } from "../shared/voice";
import {
  requestCreateLeaderboardEntry,
  requestLeaderboard,
} from "./api/leaderboard";
import { getFriendlyLeaderboardError } from "./api/errors";
import {
  requestRealtimeSttCapability,
  requestRecordedStt,
  requestVoiceTurn,
} from "./api/voice";
import {
  playTurnReply,
  waitForReplyBusyGate,
} from "./audio/playback";
import { speakWithBrowser } from "./audio/speech-synthesis";
import { stopActiveAudio } from "./audio/state";
import { stopReplyAudioArm } from "./audio/unlock";
import AmbientHint from "./components/AmbientHint";
import RestartButton from "./components/RestartButton";
import RoomScene from "./components/RoomScene";
import SceneMic from "./components/SceneMic";
import {
  BROWSER_RECOGNITION_LANGUAGE,
  DEFAULT_QUEST_LANGUAGE,
} from "./config/languages";
import {
  ESCAPE_REWARD_DELAY_MS,
  MICROPHONE_PERMISSION_TIMEOUT_MS,
  MIN_RECORDED_STT_BYTES,
  MIN_RECORDED_STT_DURATION_MS,
} from "./config/timing";
import { VOICE_COPY } from "./copy/voice-copy";
import { getBubbleForVoiceTurn } from "./quest/bubbles";
import {
  createLanguageInput,
  isReliableLanguageDecision,
} from "./quest/language";
import {
  getRoomStateForVoiceTurn,
  initialQuestState,
  mapQuestStateToRoomState,
} from "./quest/state";
import {
  getSpeechRecognitionConstructor,
  getSupportedRecordingMimeType,
} from "./speech/detection";
import { startElevenLabsRealtimeRecognition } from "./speech/elevenlabs-realtime";
import { observeNonverbalMarkers } from "./speech/nonverbal";
import type {
  BrowserSpeechRecognition,
} from "./types/speech-recognition";
import type {
  RealtimeSpeechRecognizer,
  RecordedSpeechRecognizer,
} from "./types/realtime";
import type {
  CharacterNameTagState,
  RoomState,
  SceneBubbleContent,
} from "./types/scene";

const NAME_TAG_ACTORS: QuestNameTagActor[] = ["sofia", "dan", "hoover", "fixel"];
const SERVICE_PAUSED = true;

function createHiddenNameTags(): CharacterNameTagState {
  return {
    sofia: false,
    dan: false,
    hoover: false,
    fixel: false,
  };
}

function revealNameTags(
  current: CharacterNameTagState,
  actors: QuestNameTagActor[],
): CharacterNameTagState {
  if (actors.length === 0) {
    return current;
  }

  const next = { ...current };
  let changed = false;

  for (const actor of actors) {
    if (!NAME_TAG_ACTORS.includes(actor) || next[actor]) {
      continue;
    }

    next[actor] = true;
    changed = true;
  }

  return changed ? next : current;
}

export function App() {
  const [roomState, setRoomState] = useState<RoomState>("idle");
  const [questState, setQuestState] = useState<QuestState>(initialQuestState);
  const [readout, setReadout] = useState("");
  const [bubble, setBubble] = useState<SceneBubbleContent | null>(null);
  const [visibleNameTags, setVisibleNameTags] = useState<CharacterNameTagState>(
    createHiddenNameTags,
  );
  const [interimTranscript, setInterimTranscript] = useState("");
  const [speechAvailable, setSpeechAvailable] = useState(true);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [questSessionId, setQuestSessionId] = useState<string | null>(null);
  const [leaderboardCompletionToken, setLeaderboardCompletionToken] =
    useState<string | null>(null);
  const [leaderboardCompletionMetrics, setLeaderboardCompletionMetrics] =
    useState<LeaderboardCompletionMetrics | null>(null);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [leaderboardEntries, setLeaderboardEntries] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardMessage, setLeaderboardMessage] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [leaderboardSubmitting, setLeaderboardSubmitting] = useState(false);
  const [submittedLeaderboardEntryId, setSubmittedLeaderboardEntryId] =
    useState<string | null>(null);
  const [voiceLanguage, setVoiceLanguage] = useState<QuestLanguage>(
    DEFAULT_QUEST_LANGUAGE,
  );
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const realtimeRecognitionRef = useRef<RealtimeSpeechRecognizer | null>(null);
  const recordedRecognitionRef = useRef<RecordedSpeechRecognizer | null>(null);
  const elevenLabsSttAvailableRef = useRef<boolean | null>(null);
  const previousStateRef = useRef<RoomState>("idle");
  const escapeTimerRef = useRef<number | null>(null);
  const questStateRef = useRef<QuestState>(initialQuestState);
  const questSessionIdRef = useRef<string | null>(null);
  const previousLanguageRef = useRef<QuestLanguage | null>(null);
  const voiceLanguageRef = useRef<QuestLanguage>(DEFAULT_QUEST_LANGUAGE);
  const browserFallbackLanguageRef = useRef<QuestLanguage>(DEFAULT_QUEST_LANGUAGE);
  const leaderboardCompletionOpenedRef = useRef(false);
  const turnIdRef = useRef(0);
  const wantsListeningRef = useRef(false);
  const listenAttemptRef = useRef(0);
  const pendingStopAfterStartRef = useRef(false);

  useEffect(() => {
    const browserSpeechAvailable = getSpeechRecognitionConstructor() !== undefined;

    setSpeechAvailable(browserSpeechAvailable);
    void requestRealtimeSttCapability()
      .then((capability) => {
        elevenLabsSttAvailableRef.current = capability.realtimeAvailable;
        setSpeechAvailable(browserSpeechAvailable || capability.realtimeAvailable);
      })
      .catch(() => {
        elevenLabsSttAvailableRef.current = false;
        setSpeechAvailable(browserSpeechAvailable);
      });

    return () => {
      wantsListeningRef.current = false;
      pendingStopAfterStartRef.current = false;
      listenAttemptRef.current += 1;
      recordedRecognitionRef.current?.abort();
      realtimeRecognitionRef.current?.abort();
      recognitionRef.current?.abort();

      if (escapeTimerRef.current !== null) {
        window.clearTimeout(escapeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    questStateRef.current = questState;
  }, [questState]);

  useEffect(() => {
    questSessionIdRef.current = questSessionId;
  }, [questSessionId]);

  function setRoomStateSafely(nextState: RoomState) {
    if (escapeTimerRef.current !== null) {
      window.clearTimeout(escapeTimerRef.current);
      escapeTimerRef.current = null;
    }

    setRoomState(nextState);

  }

  function setVoiceLanguageSafely(language: QuestLanguage) {
    voiceLanguageRef.current = language;
    setVoiceLanguage(language);
  }

  function getCurrentVoiceCopy() {
    return VOICE_COPY[voiceLanguageRef.current];
  }

  function scheduleEscapedState(delayMs = ESCAPE_REWARD_DELAY_MS) {
    if (escapeTimerRef.current !== null) {
      window.clearTimeout(escapeTimerRef.current);
    }

    escapeTimerRef.current = window.setTimeout(() => {
      setRoomState("escaped");
      escapeTimerRef.current = null;
    }, delayMs);
  }

  function startListening() {
    if (wantsListeningRef.current || voiceBusy) {
      return;
    }

    wantsListeningRef.current = true;
    pendingStopAfterStartRef.current = false;
    const listenAttempt = listenAttemptRef.current + 1;
    listenAttemptRef.current = listenAttempt;
    stopActiveAudio();
    window.speechSynthesis?.cancel();
    recordedRecognitionRef.current?.abort();
    realtimeRecognitionRef.current?.abort();
    recognitionRef.current?.abort();
    previousStateRef.current = roomState === "listening" ? "idle" : roomState;
    const copy = getCurrentVoiceCopy();
    setInterimTranscript("");
    setBubble({
      actor: "room",
      name: copy.microphoneName,
      text: copy.listening,
    });
    setRoomState("listening");

    if (elevenLabsSttAvailableRef.current !== false) {
      void startRecordedElevenLabsListening()
        .then((recognizer) => {
          if (listenAttempt !== listenAttemptRef.current) {
            recognizer.abort();
            return;
          }

          if (!wantsListeningRef.current || pendingStopAfterStartRef.current) {
            pendingStopAfterStartRef.current = false;
            recordedRecognitionRef.current = recognizer;
            recognizer.stop();
            recordedRecognitionRef.current = null;
            return;
          }

          recordedRecognitionRef.current = recognizer;
        })
        .catch((error: unknown) => {
          if (listenAttempt !== listenAttemptRef.current) {
            return;
          }

          if (!wantsListeningRef.current) {
            pendingStopAfterStartRef.current = false;
            setVoiceBusy(false);
            setRoomState(previousStateRef.current);
            return;
          }

          console.info("[elevenlabs-stt] Falling back to browser speech.", {
            error: error instanceof Error ? error.message : String(error),
          });
          elevenLabsSttAvailableRef.current = false;
          startBrowserSpeechRecognition();
        });
      return;
    }

    startBrowserSpeechRecognition();
  }

  async function startRecordedElevenLabsListening(): Promise<RecordedSpeechRecognizer> {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      throw new Error("Recorded microphone capture is unavailable.");
    }

    const mediaStream = await getRecordedMediaStream();
    const chunks: Blob[] = [];
    const recordingMimeType = getSupportedRecordingMimeType();
    const recorder = new MediaRecorder(
      mediaStream,
      recordingMimeType ? { mimeType: recordingMimeType } : undefined,
    );
    let stopped = false;
    let stopResolver: (() => void) | null = null;
    const recordingStartedAt = performance.now();
    const stoppedPromise = new Promise<void>((resolve) => {
      stopResolver = resolve;
    });

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };
    recorder.onstop = () => {
      stopResolver?.();
    };
    recorder.start();

    setSpeechAvailable(true);
    const copy = getCurrentVoiceCopy();
    setInterimTranscript("");
    setBubble({
      actor: "room",
      name: copy.microphoneName,
      text: copy.listening,
    });
    setRoomState("listening");

    const finish = async (shouldTranscribe: boolean) => {
      if (stopped) {
        return;
      }

      stopped = true;

      if (recorder.state !== "inactive") {
        recorder.stop();
      }

      mediaStream.getTracks().forEach((track) => track.stop());
      await stoppedPromise;

      if (!shouldTranscribe) {
        setVoiceBusy(false);
        return;
      }

      if (chunks.length === 0) {
        setVoiceBusy(false);
        setRoomState(previousStateRef.current);
        setBubble({
          actor: "room",
          name: copy.microphoneName,
          text: copy.holdLonger,
        });
        return;
      }

      const audio = new Blob(chunks, {
        type: recorder.mimeType || "audio/webm",
      });
      const recordedDurationMs = performance.now() - recordingStartedAt;

      if (
        recordedDurationMs < MIN_RECORDED_STT_DURATION_MS ||
        audio.size < MIN_RECORDED_STT_BYTES
      ) {
        setVoiceBusy(false);
        setRoomState(previousStateRef.current);
        setBubble({
          actor: "room",
          name: copy.microphoneName,
          text: copy.holdLonger,
        });
        return;
      }

      setInterimTranscript("");
      setVoiceBusy(true);
      setBubble({
        actor: "room",
        name: copy.microphoneName,
        text: copy.thinking,
      });

      try {
        const transcription = await requestRecordedStt(audio);

        if (!transcription.text) {
          setVoiceBusy(false);
          setRoomState(previousStateRef.current);
          setBubble({
            actor: "room",
            name: copy.microphoneName,
            text: copy.notUnderstood,
          });
          return;
        }

        observeNonverbalMarkers("elevenlabs-recorded", "committed", transcription.text);
        await applyTranscript(transcription.text, transcription.language);
      } catch (error) {
        console.info("[elevenlabs-stt] Recorded transcription failed.", {
          error: error instanceof Error ? error.message : String(error),
          bytes: audio.size,
          contentType: audio.type,
          durationMs: Math.round(recordedDurationMs),
        });
        elevenLabsSttAvailableRef.current = false;
        setVoiceBusy(false);
        setRoomState(previousStateRef.current);
        setBubble({
          actor: "room",
          name: copy.microphoneName,
          text: getSpeechRecognitionConstructor()
            ? copy.elevenLabsRetryBrowser
            : copy.elevenLabsRetryMicrophone,
        });
      }
    };

    return {
      abort() {
        void finish(false);
      },
      stop() {
        void finish(true);
      },
    };
  }

  async function getRecordedMediaStream(): Promise<MediaStream> {
    let timeoutId: number | null = null;
    let timedOut = false;

    const mediaStreamPromise = navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    try {
      return await Promise.race([
        mediaStreamPromise.then((mediaStream) => {
          if (timedOut) {
            mediaStream.getTracks().forEach((track) => track.stop());
            throw new Error("Microphone permission timed out.");
          }

          return mediaStream;
        }),
        new Promise<never>((_, reject) => {
          timeoutId = window.setTimeout(() => {
            timedOut = true;
            reject(new Error("Microphone permission timed out."));
          }, MICROPHONE_PERMISSION_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    }
  }

  function startBrowserSpeechRecognition() {
    const SpeechRecognition = getSpeechRecognitionConstructor();
    const copy = getCurrentVoiceCopy();

    if (!wantsListeningRef.current) {
      return;
    }

    if (!SpeechRecognition) {
      setSpeechAvailable(false);
      setRoomState("listening");
      setReadout(copy.browserUnavailableReadout);
      setBubble({
        actor: "room",
        name: copy.microphoneName,
        text: copy.browserUnavailableBubble,
      });
      return;
    }

    recognitionRef.current?.abort();

    const recognition = new SpeechRecognition();
    recognition.lang = BROWSER_RECOGNITION_LANGUAGE[browserFallbackLanguageRef.current];
    recognition.continuous = false;
    recognition.interimResults = true;
    const browserLanguage = createLanguageInput({
      source: "browser-speech",
      providerLanguageCode: recognition.lang,
    });
    let submittedFinalTranscript = false;

    recognition.onstart = () => {
      if (!wantsListeningRef.current) {
        recognition.abort();
        return;
      }

      setInterimTranscript("");
      setBubble({
        actor: "room",
        name: copy.microphoneName,
        text: copy.listening,
      });
      setRoomState("listening");
    };

    recognition.onresult = (event) => {
      let interim = "";
      let finalTranscript = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results.item(index);
        const transcript = result.item(0).transcript.trim();

        if (result.isFinal) {
          finalTranscript = `${finalTranscript} ${transcript}`.trim();
        } else {
          interim = `${interim} ${transcript}`.trim();
        }
      }

      setInterimTranscript(finalTranscript || interim);

      if (finalTranscript) {
        submittedFinalTranscript = true;
        observeNonverbalMarkers("browser-speech", "committed", finalTranscript);
        void applyTranscript(finalTranscript, browserLanguage);
      }
    };

    recognition.onerror = (event) => {
      if (!wantsListeningRef.current) {
        return;
      }

      setRoomState(previousStateRef.current);
      const message =
        event.error === "not-allowed"
          ? copy.microphoneBlocked
          : copy.speechNotRecognized;

      setReadout(message);
      setBubble({
        actor: "room",
        name: copy.microphoneName,
        text: message,
      });
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setInterimTranscript("");
      if (!submittedFinalTranscript) {
        setVoiceBusy(false);
      }
      setRoomState((current) =>
        current === "listening" ? previousStateRef.current : current,
      );
    };

    recognitionRef.current = recognition;

    if (!wantsListeningRef.current) {
      recognition.abort();
      return;
    }

    recognition.start();
  }

  async function startElevenLabsRealtimeListening(): Promise<RealtimeSpeechRecognizer> {
    return startElevenLabsRealtimeRecognition({
      onStart() {
        if (!wantsListeningRef.current) {
          return;
        }

        const copy = getCurrentVoiceCopy();
        setSpeechAvailable(true);
        setInterimTranscript("");
        setBubble({
          actor: "room",
          name: copy.microphoneName,
          text: copy.listening,
        });
        setRoomState("listening");
      },
      onPartialTranscript(transcript) {
        if (!wantsListeningRef.current) {
          return;
        }

        setInterimTranscript(transcript);
        observeNonverbalMarkers("elevenlabs", "partial", transcript);
      },
      onCommittedTranscript(transcript, language) {
        if (!wantsListeningRef.current) {
          return;
        }

        setInterimTranscript(transcript);
        observeNonverbalMarkers("elevenlabs", "committed", transcript);
        void applyTranscript(transcript, language);
      },
      onError(error) {
        console.info("[elevenlabs-stt] Realtime session ended with an error.", {
          error,
        });
      },
      onEnd() {
        realtimeRecognitionRef.current = null;
        setInterimTranscript("");
        setRoomState((current) =>
          current === "listening" ? previousStateRef.current : current,
        );
      },
    });
  }

  function stopListening() {
    const hasActiveRecognizer =
      wantsListeningRef.current ||
      recordedRecognitionRef.current !== null ||
      realtimeRecognitionRef.current !== null ||
      recognitionRef.current !== null;
    const stopBeforeRecognizerReady =
      wantsListeningRef.current &&
      recordedRecognitionRef.current === null &&
      realtimeRecognitionRef.current === null &&
      recognitionRef.current === null;

    if (!hasActiveRecognizer) {
      return;
    }

    wantsListeningRef.current = false;
    pendingStopAfterStartRef.current = recordedRecognitionRef.current === null;
    setVoiceBusy(true);
    recordedRecognitionRef.current?.stop();
    recordedRecognitionRef.current = null;
    realtimeRecognitionRef.current?.stop();
    realtimeRecognitionRef.current = null;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setRoomState((current) =>
      current === "listening" ? previousStateRef.current : current,
    );

    if (stopBeforeRecognizerReady) {
      const copy = getCurrentVoiceCopy();

      setBubble({
        actor: "room",
        name: copy.microphoneName,
        text: copy.holdLonger,
      });
    }
  }

  function restartQuest() {
    wantsListeningRef.current = false;
    pendingStopAfterStartRef.current = false;
    listenAttemptRef.current += 1;
    recordedRecognitionRef.current?.abort();
    recordedRecognitionRef.current = null;
    realtimeRecognitionRef.current?.abort();
    realtimeRecognitionRef.current = null;
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    stopActiveAudio();
    stopReplyAudioArm();
    window.speechSynthesis?.cancel();

    if (escapeTimerRef.current !== null) {
      window.clearTimeout(escapeTimerRef.current);
      escapeTimerRef.current = null;
    }

    turnIdRef.current += 1;
    questStateRef.current = initialQuestState;
    previousStateRef.current = "idle";
    setQuestState(initialQuestState);
    setRoomState("idle");
    setReadout("");
    setInterimTranscript("");
    setVoiceBusy(false);
    setBubble(null);
    setVisibleNameTags(createHiddenNameTags());
    setQuestSessionId(null);
    previousLanguageRef.current = null;
    browserFallbackLanguageRef.current = DEFAULT_QUEST_LANGUAGE;
    setVoiceLanguageSafely(DEFAULT_QUEST_LANGUAGE);
    leaderboardCompletionOpenedRef.current = false;
    setLeaderboardCompletionToken(null);
    setLeaderboardCompletionMetrics(null);
    setLeaderboardOpen(false);
    setLeaderboardEntries([]);
    setLeaderboardLoading(false);
    setLeaderboardMessage("");
    setDisplayName("");
    setLeaderboardSubmitting(false);
    setSubmittedLeaderboardEntryId(null);
  }

  async function applyTranscript(
    transcript: string,
    language?: QuestLanguageInput,
  ) {
    const cleanedTranscript = transcript.trim();

    if (!cleanedTranscript) {
      return;
    }

    if (
      isUnsupportedDetectedTranscript({
        transcript: cleanedTranscript,
        language,
      })
    ) {
      const copy = getCurrentVoiceCopy();

      setVoiceBusy(false);
      setRoomState(previousStateRef.current);
      setReadout(copy.notUnderstood);
      setBubble({
        actor: "room",
        name: copy.microphoneName,
        text: copy.notUnderstood,
      });
      return;
    }

    const turnId = turnIdRef.current + 1;
    const questStateBeforeTurn = questStateRef.current;

    turnIdRef.current = turnId;
    setVoiceBusy(true);
    observeNonverbalMarkers("voice-turn", "submitted", cleanedTranscript);
    setReadout(cleanedTranscript);
    setBubble({
      actor: "room",
      name: getCurrentVoiceCopy().playerName,
      text: cleanedTranscript,
    });

    try {
      const response = await requestVoiceTurn(
        cleanedTranscript,
        questStateBeforeTurn,
        questSessionIdRef.current,
        language,
        previousLanguageRef.current,
      );

      if (turnId !== turnIdRef.current) {
        return;
      }

      if (response.questSessionId) {
        questSessionIdRef.current = response.questSessionId;
        setQuestSessionId(response.questSessionId);
      }

      previousLanguageRef.current = response.languageDecision.language;
      setVoiceLanguageSafely(response.languageDecision.language);

      if (isReliableLanguageDecision(response.languageDecision)) {
        browserFallbackLanguageRef.current = response.languageDecision.language;
      }

      if (response.leaderboardCompletion) {
        setLeaderboardCompletionToken(response.leaderboardCompletion.token);
        setLeaderboardCompletionMetrics(response.leaderboardCompletion.metrics);
        leaderboardCompletionOpenedRef.current = true;
        setLeaderboardOpen(true);
        void loadLeaderboard();
      }

      questStateRef.current = response.nextQuestState;
      setQuestState(response.nextQuestState);
      setVisibleNameTags((current) =>
        revealNameTags(current, response.nameTagActors),
      );
      const nextRoomState = getRoomStateForVoiceTurn(response);
      setRoomStateSafely(nextRoomState);

      const replyBubble = getBubbleForVoiceTurn(
        response.actor,
        response.reply,
        response.nextQuestState,
        response.languageDecision.language,
      );

      setReadout(response.reply);
      setBubble(replyBubble);
      const replyPlayback = playTurnReply(response);

      void replyPlayback.catch((error: unknown) => {
        console.info("[audio] Reply playback ended without audible output.", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
      await waitForReplyBusyGate(replyPlayback);

      if (turnId === turnIdRef.current && nextRoomState === "doorOpening") {
        scheduleEscapedState();
      }
    } catch {
      if (turnId !== turnIdRef.current) {
        return;
      }

      const copy = getCurrentVoiceCopy();
      const message = copy.questServerUnavailable;

      setRoomStateSafely(mapQuestStateToRoomState(questStateBeforeTurn));
      setReadout(message);
      setBubble({
        actor: "room",
        name: copy.roomName,
        text: message,
      });
      void speakWithBrowser(message, "system", voiceLanguageRef.current);
    } finally {
      if (turnId === turnIdRef.current) {
        setVoiceBusy(false);
      }
    }
  }

  const isListening = roomState === "listening";
  const questCompleted = roomState === "doorOpening" || roomState === "escaped";

  useEffect(() => {
    if (!questCompleted || leaderboardCompletionOpenedRef.current) {
      return;
    }

    leaderboardCompletionOpenedRef.current = true;
    setLeaderboardOpen(true);
    void loadLeaderboard();
  }, [questCompleted]);

  async function loadLeaderboard() {
    setLeaderboardLoading(true);
    setLeaderboardMessage("");

    try {
      const leaderboard = await requestLeaderboard();

      setLeaderboardEntries(leaderboard.entries);
      setLeaderboardMessage("");
    } catch (error) {
      setLeaderboardEntries([]);
      setLeaderboardMessage(
        getFriendlyLeaderboardError(error, voiceLanguageRef.current),
      );
    } finally {
      setLeaderboardLoading(false);
    }
  }

  async function submitLeaderboardEntry() {
    if (!leaderboardCompletionToken || leaderboardSubmitting) {
      return;
    }

    setLeaderboardSubmitting(true);
    setLeaderboardMessage("");

    try {
      const result = await requestCreateLeaderboardEntry({
        displayName,
        completionToken: leaderboardCompletionToken,
      });

      setSubmittedLeaderboardEntryId(result.entry.entryId);
      setLeaderboardEntries(result.leaderboard.entries);
      setLeaderboardMessage(getCurrentVoiceCopy().leaderboardSubmitted);
    } catch (error) {
      setLeaderboardMessage(
        getFriendlyLeaderboardError(error, voiceLanguageRef.current),
      );
    } finally {
      setLeaderboardSubmitting(false);
    }
  }

  function openLeaderboardScreen() {
    if (SERVICE_PAUSED) {
      setLeaderboardOpen(true);
      setLeaderboardEntries([]);
      setLeaderboardMessage(
        "Функціонал тимчасово не працює, тому таблиця результатів зараз недоступна.",
      );
      return;
    }

    setLeaderboardOpen(true);
    void loadLeaderboard();
  }

  return (
    <main className={`quest-app quest-app--${roomState}`}>
      {SERVICE_PAUSED ? (
        <aside className="service-paused-banner" aria-live="polite">
          <strong>Тимчасова пауза</strong>
          <span>
            Сайт лишається відкритим, але голосовий квест, рейтинг і серверні
            функції зараз не працюють.
          </span>
        </aside>
      ) : null}
      <RoomScene
        bubble={bubble}
        leaderboard={{
          completed: questCompleted,
          completionMetrics: leaderboardCompletionMetrics,
          displayName,
          entries: leaderboardEntries,
          isLoading: leaderboardLoading,
          isOpen: leaderboardOpen,
          isSubmitting: leaderboardSubmitting,
          message: leaderboardMessage,
          onChangeDisplayName: setDisplayName,
          onClose: () => setLeaderboardOpen(false),
          onOpen: openLeaderboardScreen,
          onSubmit: () => void submitLeaderboardEntry(),
          submittedEntryId: submittedLeaderboardEntryId,
          tokenAvailable: leaderboardCompletionToken !== null,
        }}
        questState={questState}
        roomState={roomState}
        visibleNameTags={visibleNameTags}
        voiceLanguage={voiceLanguage}
      />
      <AmbientHint
        questState={questState}
        roomState={roomState}
        voiceLanguage={voiceLanguage}
      />
      <SceneMic
        isListening={isListening}
        isBusy={voiceBusy}
        speechAvailable={!SERVICE_PAUSED && speechAvailable}
        voiceLanguage={voiceLanguage}
        onStart={startListening}
        onStop={stopListening}
      />
      <RestartButton
        disabled={isListening || voiceBusy}
        voiceLanguage={voiceLanguage}
        onRestart={restartQuest}
      />
    </main>
  );
}
