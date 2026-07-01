import "dotenv/config";

import express from "express";
import type { AppStatus } from "../shared/status.js";
import type {
  QuestState,
  QuestActor,
  QuestLanguage,
  QuestLanguageInput,
  QuestLanguageSource,
  RealtimeSttCapabilityResponse,
  RealtimeSttSessionResponse,
  RecordedSttResponse,
  VoiceTurnRequest,
  VoiceTurnResponse,
} from "../shared/voice.js";
import {
  getElevenLabsRealtimeSttConfig,
  isElevenLabsRealtimeSttConfigured,
  ProviderConfigurationError,
} from "./providers/config.js";
import { createProviderRegistry } from "./providers/registry.js";
import { createQuestBrainTurn } from "./quest/engine/brain.js";
import { decideQuestLanguage, normalizeQuestState } from "./quest/index.js";
import {
  canSynthesizeActorSpeech,
  getElevenLabsVoiceRole,
  getElevenLabsVoiceSettings,
} from "./quest/engine/voice-adapter.js";
import { getQuestSoundEffect } from "./quest/engine/sound-effects.js";
import {
  createElevenLabsRealtimeSttSession,
  transcribeElevenLabsAudio,
} from "./providers/elevenlabs.js";
import {
  getLeaderboardConfigFromEnv,
  handleCreateLeaderboardEntry,
  handleListLeaderboard,
  isQuestCompleted,
  registerQuestSessionTurn,
  sendLeaderboardResult,
  type LeaderboardStore,
} from "./leaderboard.js";
import { createDynamoLeaderboardStore } from "./leaderboard-dynamodb.js";

export const app = express();
const port = Number(process.env.SERVER_PORT || process.env.PORT || 8787);
const providerRegistry = createProviderRegistry();
const leaderboardConfig = getLeaderboardConfigFromEnv();
const leaderboardStore = createLeaderboardStore();
const MAX_TRANSCRIPT_LENGTH = 600;
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const cloudfrontOriginSecret = process.env.CLOUDFRONT_ORIGIN_SECRET;

app.use((request, response, next) => {
  if (
    cloudfrontOriginSecret &&
    request.get("x-cloudfront-origin-secret") !== cloudfrontOriginSecret
  ) {
    response.status(403).json({ error: "Forbidden." });
    return;
  }

  next();
});
app.use(express.json({ limit: "64kb", strict: true }));
app.use("/api/stt/elevenlabs/recorded", express.raw({
  limit: MAX_AUDIO_BYTES,
  type: ["audio/*", "video/webm", "application/octet-stream"],
}));

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

app.get("/api/status", (_request, response) => {
  const providers = providerRegistry.getReadiness();
  const providerConfigured = (provider: "claude" | "gemini" | "elevenlabs") =>
    providers.find((status) => status.provider === provider)?.configured ??
    false;
  const status: AppStatus = {
    app: "Vibecoding Collective",
    mode: "live-demo",
    serverTime: new Date().toISOString(),
    environment: {
      claudeApiKeyConfigured: providerConfigured("claude"),
      geminiApiKeyConfigured: providerConfigured("gemini"),
      elevenLabsApiKeyConfigured: isElevenLabsRealtimeSttConfigured(),
      elevenLabsMcpServerUrlConfigured: Boolean(
        process.env.ELEVENLABS_MCP_SERVER_URL,
      ),
      port,
    },
    providers,
  };

  response.json(status);
});

app.get("/api/leaderboard", async (request, response) => {
  const result = await handleListLeaderboard({
    request,
    store: leaderboardStore,
    config: leaderboardConfig,
  });

  sendLeaderboardResult(response, result);
});

app.post("/api/leaderboard", async (request, response) => {
  const result = await handleCreateLeaderboardEntry({
    request,
    store: leaderboardStore,
    config: leaderboardConfig,
  });

  sendLeaderboardResult(response, result);
});

app.get("/api/stt/capability", (_request, response) => {
  const config = getElevenLabsRealtimeSttConfigIfAvailable();
  const payload: RealtimeSttCapabilityResponse = {
    provider: "elevenlabs",
    realtimeAvailable: config !== undefined,
    modelId: config?.model ?? "scribe_v2_realtime",
    reason:
      config === undefined
        ? "ELEVENLABS_API_KEY is not configured; browser speech recognition fallback should be used."
        : undefined,
  };

  response.json(payload);
});

app.post("/api/stt/elevenlabs/session", async (_request, response) => {
  if (!isElevenLabsRealtimeSttConfigured()) {
    response.status(503).json({
      error:
        "ElevenLabs realtime STT is not configured; browser speech recognition fallback should be used.",
    });
    return;
  }

  try {
    const session = await createElevenLabsRealtimeSttSession(
      getElevenLabsRealtimeSttConfig(),
    );
    const payload: RealtimeSttSessionResponse = session;

    response.json(payload);
  } catch (error) {
    response.status(502).json({
      error:
        error instanceof Error
          ? error.message
          : "Unknown ElevenLabs realtime STT session error.",
    });
  }
});

app.post("/api/stt/elevenlabs/recorded", async (request, response) => {
  if (!isElevenLabsRealtimeSttConfigured()) {
    response.status(503).json({
      error:
        "ElevenLabs STT is not configured; browser speech recognition fallback should be used.",
    });
    return;
  }

  const audio = Buffer.isBuffer(request.body) ? request.body : undefined;

  if (!audio || audio.byteLength === 0) {
    response.status(400).json({ error: "Audio body is required." });
    return;
  }

  try {
    const transcription = await transcribeElevenLabsAudio({
      config: getElevenLabsRealtimeSttConfig(),
      audio,
      contentType: request.headers["content-type"] ?? "audio/webm",
    });
    const payload: RecordedSttResponse = {
      provider: "elevenlabs",
      text: transcription.text,
      language: transcription.language,
    };

    response.json(payload);
  } catch (error) {
    console.info("[elevenlabs-stt] Recorded transcription request failed.", {
      error: error instanceof Error ? error.message : String(error),
      bytes: audio.byteLength,
      contentType: request.headers["content-type"] ?? "unknown",
    });
    response.status(502).json({
      error:
        error instanceof Error
          ? error.message
          : "Unknown ElevenLabs speech-to-text error.",
    });
  }
});

app.post("/api/voice-turn", async (request, response) => {
  const parsed = parseVoiceTurnRequest(request.body);

  if (!parsed.ok) {
    response.status(400).json({ error: parsed.error });
    return;
  }

  const languageDecision = decideQuestLanguage({
    transcript: parsed.transcript,
    language: parsed.language,
    previousLanguage: parsed.previousLanguage,
  });
  const turn = await createQuestBrainTurn({
    transcript: parsed.transcript,
    questState: parsed.questState,
    replyLanguage: languageDecision.language,
    getClaudeProvider: () => providerRegistry.getTextProvider("claude"),
  });
  const session = registerQuestSessionTurn({
    sessionId: parsed.questSessionId,
    completed: isQuestCompleted(turn.nextQuestState),
    config: leaderboardConfig,
  });
  const reply = turn.reply;
  const payload: VoiceTurnResponse = {
    transcript: parsed.transcript,
    languageDecision,
    reply,
    nameTagActors: turn.nameTagActors,
    action: turn.action,
    actor: turn.actor,
    event: turn.event,
    previousQuestState: turn.previousQuestState,
    nextQuestState: turn.nextQuestState,
    questSessionId: session.sessionId,
    leaderboardCompletion: session.completion,
  };
  const soundEffect = getQuestSoundEffect({
    actor: turn.actor,
    eventType: turn.event.type,
    language: languageDecision.language,
  });

  if (soundEffect) {
    payload.soundEffect = soundEffect;
    response.json(payload);
    return;
  }

  if (!canSynthesizeActorSpeech(turn.actor)) {
    payload.audioError = "Fixel is nonverbal and has no ElevenLabs TTS voice.";
    response.json(payload);
    return;
  }

  try {
    const tts = providerRegistry.getTextToSpeechProvider("elevenlabs");
    const voiceRole = getElevenLabsVoiceRole(turn.actor);
    const audio = await tts.synthesizeSpeech({
      text: reply,
      voiceId:
        voiceRole === "sofia" && turn.replyLanguage === "en"
          ? tts.voiceIds.sofiaEnglish
          : tts.voiceIds[voiceRole],
      voiceSettings: getElevenLabsVoiceSettings(turn.actor),
    });

    payload.audio = {
      contentType: audio.contentType,
      base64: Buffer.from(audio.audio).toString("base64"),
      provider: "elevenlabs",
    };
  } catch (error) {
    payload.audioError =
      error instanceof ProviderConfigurationError
        ? "ElevenLabs is not configured; browser speech fallback can answer this turn."
        : error instanceof Error
          ? error.message
          : "Unknown ElevenLabs text-to-speech error.";
  }

  response.json(payload);
});

function parseVoiceTurnRequest(
  body: unknown,
):
  | {
      ok: true;
      transcript: string;
      questState: QuestState;
      questSessionId?: string;
      language?: QuestLanguageInput;
      previousLanguage?: QuestLanguage;
    }
  | { ok: false; error: string } {
  const candidate = body as Partial<VoiceTurnRequest> | undefined;
  const transcript =
    typeof candidate?.transcript === "string" ? candidate.transcript.trim() : "";

  if (!transcript) {
    return { ok: false, error: "Transcript is required." };
  }

  if (transcript.length > MAX_TRANSCRIPT_LENGTH) {
    return {
      ok: false,
      error: `Transcript is too long. Limit: ${MAX_TRANSCRIPT_LENGTH} characters.`,
    };
  }

  return {
    ok: true,
    transcript,
    questState: normalizeQuestState(candidate?.questState),
    questSessionId:
      typeof candidate?.questSessionId === "string"
        ? candidate.questSessionId.trim() || undefined
        : undefined,
    language: parseQuestLanguageInput(candidate?.language),
    previousLanguage: parseQuestLanguage(candidate?.previousLanguage),
  };
}

function parseQuestLanguageInput(value: unknown): QuestLanguageInput | undefined {
  const candidate = value as Partial<QuestLanguageInput> | undefined;
  const language = parseQuestLanguage(candidate?.language);
  const source = parseQuestLanguageSource(candidate?.source);
  const providerLanguageCode =
    typeof candidate?.providerLanguageCode === "string"
      ? candidate.providerLanguageCode.trim().slice(0, 32) || undefined
      : undefined;
  const confidence =
    typeof candidate?.confidence === "number" && Number.isFinite(candidate.confidence)
      ? Math.max(0, Math.min(1, candidate.confidence))
      : undefined;

  if (
    language === undefined &&
    source === undefined &&
    providerLanguageCode === undefined &&
    confidence === undefined
  ) {
    return undefined;
  }

  return {
    language,
    confidence,
    providerLanguageCode,
    source,
  };
}

function parseQuestLanguage(value: unknown): QuestLanguage | undefined {
  return value === "uk" || value === "en" ? value : undefined;
}

function parseQuestLanguageSource(value: unknown): QuestLanguageSource | undefined {
  switch (value) {
    case "elevenlabs":
    case "browser-speech":
    case "heuristic":
    case "sticky":
    case "default":
      return value;
    default:
      return undefined;
  }
}

function createLeaderboardStore(): LeaderboardStore {
  try {
    return createDynamoLeaderboardStore();
  } catch (error) {
    return {
      async list() {
        throw error;
      },
      async create() {
        throw error;
      },
    };
  }
}

function getElevenLabsRealtimeSttConfigIfAvailable() {
  try {
    return getElevenLabsRealtimeSttConfig();
  } catch (error) {
    if (error instanceof ProviderConfigurationError) {
      return undefined;
    }

    throw error;
  }
}
