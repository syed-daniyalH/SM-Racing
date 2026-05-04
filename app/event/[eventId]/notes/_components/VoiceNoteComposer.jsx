"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import MicRoundedIcon from "@mui/icons-material/MicRounded";
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import StopRoundedIcon from "@mui/icons-material/StopRounded";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import TextSnippetOutlinedIcon from "@mui/icons-material/TextSnippetOutlined";

import StatusBadge from "../../../../components/Common/StatusBadge";
import { generateUUID } from "../../../../utils/uuid";
import {
  archiveVoiceSession,
  buildVoiceNoteTranscript,
  createVoiceSession,
  getVoiceSession,
  normalizeVoiceSession,
  retryVoiceTranscription,
  saveVoiceTranscript,
  transcribeVoiceSession,
  uploadVoiceAudio,
} from "../../../../utils/voiceNotesApi";

const STATE_COPY = {
  idle: {
    label: "Ready",
    tone: "neutral",
    title: "Ready to record",
    message: "Record a short voice note and the transcript will be prepared for review.",
  },
  recording: {
    label: "Recording",
    tone: "accent",
    title: "Recording in progress",
    message: "Speak naturally. Stop when you are finished.",
  },
  uploading: {
    label: "Uploading",
    tone: "info",
    title: "Uploading audio",
    message: "Sending the audio to the backend so it can be stored and transcribed.",
  },
  transcribing: {
    label: "Transcribing",
    tone: "warning",
    title: "Transcription in progress",
    message: "Deepgram is converting the recording into text.",
  },
  ready: {
    label: "Ready for review",
    tone: "success",
    title: "Transcript ready",
    message: "Review and edit the transcript before it is saved into the note.",
  },
  confirmed: {
    label: "Confirmed",
    tone: "success",
    title: "Transcript confirmed",
    message: "The transcript is confirmed and ready to be submitted with the note.",
  },
  failed: {
    label: "Failed",
    tone: "danger",
    title: "Voice capture failed",
    message: "The voice note could not be processed. You can retry transcription or re-record.",
  },
  denied: {
    label: "Permission denied",
    tone: "danger",
    title: "Microphone permission denied",
    message: "Allow microphone access in your browser settings and try again.",
  },
  unsupported: {
    label: "Unsupported",
    tone: "danger",
    title: "Voice capture unsupported",
    message: "This browser cannot capture audio with the built-in recorder.",
  },
  archived: {
    label: "Archived",
    tone: "neutral",
    title: "Archived",
    message: "This voice note has been archived.",
  },
};

const PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/mp4",
  "audio/m4a",
];

const normalizeText = (value) => String(value ?? "").trim().replace(/\s+/g, " ");

const formatDuration = (durationMs) => {
  const totalSeconds = Math.max(0, Math.round((durationMs || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

const pickRecorderMimeType = () => {
  if (typeof window === "undefined" || !window.MediaRecorder?.isTypeSupported) {
    return "";
  }

  return PREFERRED_MIME_TYPES.find((mimeType) => window.MediaRecorder.isTypeSupported(mimeType)) || "";
};

const makeAudioFile = (blob, mimeType) => {
  const extension =
    mimeType === "audio/mp4" || mimeType === "audio/m4a"
      ? "m4a"
      : mimeType === "audio/ogg" || mimeType === "audio/ogg;codecs=opus"
        ? "ogg"
        : "webm";
  return new File([blob], `voice-note-${Date.now()}.${extension}`, {
    type: mimeType || blob.type || "audio/webm",
  });
};

export default function VoiceNoteComposer({
  eventId,
  runGroupId,
  eventOpen = true,
  disabled = false,
  rawText = "",
  onRawTextChange,
  onVoiceSessionChange,
  onVoiceStateChange,
  onTranscriptApplied,
  className = "",
}) {
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState(STATE_COPY.idle.message);
  const [session, setSession] = useState(null);
  const [transcriptDraft, setTranscriptDraft] = useState("");
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0);
  const [isSupported, setIsSupported] = useState(true);
  const [isSecureContext, setIsSecureContext] = useState(true);
  const [error, setError] = useState("");

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const mountedRef = useRef(false);
  const pollTimerRef = useRef(null);
  const durationTimerRef = useRef(null);
  const recordingStartedAtRef = useRef(null);
  const currentSessionIdRef = useRef(null);
  const userEditedTranscriptRef = useRef(false);
  const autoAppliedTranscriptRef = useRef(false);
  const transcriptRef = useRef("");

  const stateMeta = useMemo(() => STATE_COPY[status] || STATE_COPY.idle, [status]);
  const isBusy = ["recording", "uploading", "transcribing"].includes(status);
  const isTranscriptReady =
    Boolean(session?.id) &&
    ["ready", "confirmed"].includes(status) &&
    Boolean(buildVoiceNoteTranscript(session) || transcriptDraft);

  const clearTimers = () => {
    if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (durationTimerRef.current) {
      window.clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
  };

  const cleanupRecorder = () => {
    clearTimers();

    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder) {
      try {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        recorder.onerror = null;
        if (recorder.state !== "inactive") {
          recorder.stop();
        }
      } catch (error) {
        // Ignore recorder shutdown failures.
      }
    }

    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
  };

  const publishState = (nextStatus, nextMessage, nextError = "") => {
    setStatus(nextStatus);
    setMessage(nextMessage);
    setError(nextError);
  };

  const publishSession = (nextSession) => {
    const normalized = normalizeVoiceSession(nextSession);
    setSession(normalized);
    if (typeof onVoiceSessionChange === "function") {
      onVoiceSessionChange(normalized);
    }
    return normalized;
  };

  const applyTranscriptToNote = (transcript, mode = "replace") => {
    const cleanedTranscript = normalizeText(transcript);
    if (!cleanedTranscript || typeof onRawTextChange !== "function") {
      return;
    }

    if (mode === "append") {
      onRawTextChange((currentValue = "") => {
        const currentText = normalizeText(currentValue);
        return currentText ? `${currentText} ${cleanedTranscript}` : cleanedTranscript;
      });
    } else {
      onRawTextChange(cleanedTranscript);
    }

    if (typeof onTranscriptApplied === "function") {
      onTranscriptApplied(cleanedTranscript);
    }
    autoAppliedTranscriptRef.current = true;
  };

  const syncTranscriptDraft = (nextTranscript, { allowAutoApply = false } = {}) => {
    const cleanedTranscript = normalizeText(nextTranscript);
    transcriptRef.current = cleanedTranscript;
    setTranscriptDraft(cleanedTranscript);

    if (allowAutoApply && cleanedTranscript && !normalizeText(rawText)) {
      applyTranscriptToNote(cleanedTranscript, "replace");
    }
  };

  const stopPolling = () => {
    if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  const startPolling = (voiceSessionId) => {
    stopPolling();
    pollTimerRef.current = window.setInterval(async () => {
      if (!mountedRef.current) {
        return;
      }

      try {
        const latest = await getVoiceSession(voiceSessionId);
        const normalized = publishSession(latest);
        const nextTranscript = buildVoiceNoteTranscript(normalized);
        if (nextTranscript && (!userEditedTranscriptRef.current || !normalizeText(transcriptRef.current))) {
          syncTranscriptDraft(nextTranscript, { allowAutoApply: true });
        }

        if (
          !["PENDING_TRANSCRIPTION", "TRANSCRIBING"].includes(String(normalized.status || "").toUpperCase())
        ) {
          stopPolling();
          if (normalized.status === "TRANSCRIPTION_FAILED") {
            publishState(
              "failed",
              normalized.lastErrorMessage || STATE_COPY.failed.message,
              normalized.lastErrorMessage || STATE_COPY.failed.message,
            );
            return;
          }

          if (normalized.status === "ARCHIVED") {
            publishState("archived", STATE_COPY.archived.message);
            return;
          }

          publishState(
            normalized.validationStatus === "VALIDATED" ? "confirmed" : "ready",
            normalized.validationMessage || STATE_COPY.ready.message,
          );
        }
      } catch (pollError) {
        console.warn("Voice session polling failed:", pollError);
      }
    }, 1800);
  };

  const stopRecording = async () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      return;
    }

    try {
      recorder.stop();
    } catch (error) {
      publishState("failed", "Voice capture could not be stopped cleanly.", "Voice capture could not be stopped cleanly.");
      cleanupRecorder();
    }
  };

  const uploadAndTranscribe = async (audioBlob, mimeType) => {
    if (!currentSessionIdRef.current) {
      throw new Error("Voice session is missing.");
    }

    publishState("uploading", STATE_COPY.uploading.message);
    const file = makeAudioFile(audioBlob, mimeType);
    const uploadedSession = await uploadVoiceAudio({
      voiceSessionId: currentSessionIdRef.current,
      audioFile: file,
      audioDurationMs: recordingElapsedMs,
    });
    publishSession(uploadedSession);

    publishState("transcribing", STATE_COPY.transcribing.message);
    const queuedSession = await transcribeVoiceSession(currentSessionIdRef.current);
    publishSession(queuedSession);
    startPolling(currentSessionIdRef.current);
    return queuedSession;
  };

  const startRecording = async () => {
    if (disabled || !eventOpen) {
      return;
    }

    if (!isSupported) {
      publishState("unsupported", STATE_COPY.unsupported.message, STATE_COPY.unsupported.message);
      return;
    }

    if (!isSecureContext) {
      publishState(
        "failed",
        "Microphone access requires a secure context.",
        "Microphone access requires HTTPS or localhost.",
      );
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      publishState("unsupported", STATE_COPY.unsupported.message, STATE_COPY.unsupported.message);
      return;
    }

    cleanupRecorder();
    autoAppliedTranscriptRef.current = false;
    userEditedTranscriptRef.current = false;
    chunksRef.current = [];
    setTranscriptDraft("");
    setError("");
    setMessage(STATE_COPY.recording.message);
    setRecordingElapsedMs(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickRecorderMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      currentSessionIdRef.current = generateUUID();

      const sessionPayload = await createVoiceSession({
        eventId,
        runGroupId,
        clientSessionId: currentSessionIdRef.current,
      });
      publishSession(sessionPayload);

      recordingStartedAtRef.current = Date.now();
      durationTimerRef.current = window.setInterval(() => {
        if (!recordingStartedAtRef.current) {
          return;
        }
        setRecordingElapsedMs(Date.now() - recordingStartedAtRef.current);
      }, 250);

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = (event) => {
        const errorMessage = event?.error?.message || "Voice capture failed.";
        publishState("failed", errorMessage, errorMessage);
        cleanupRecorder();
      };

      recorder.onstart = () => {
        publishState("recording", STATE_COPY.recording.message);
      };

      recorder.onstop = async () => {
        clearTimers();
        recordingStartedAtRef.current = null;

        const recordedMimeType = recorder.mimeType || mimeType || "audio/webm";
        const audioBlob = new Blob(chunksRef.current, { type: recordedMimeType });
        chunksRef.current = [];
        cleanupRecorder();

        if (!audioBlob.size) {
          publishState("failed", "No voice was captured. Please re-record.", "No voice was captured.");
          return;
        }

        try {
          const updatedSession = await uploadAndTranscribe(audioBlob, recordedMimeType);
          const transcript = buildVoiceNoteTranscript(updatedSession);
          if (transcript) {
            syncTranscriptDraft(transcript, { allowAutoApply: true });
            if (normalizeText(rawText)) {
              publishState("ready", updatedSession.validationMessage || STATE_COPY.ready.message);
            } else {
              publishState("ready", "Transcript loaded into the note field.");
            }
          }
        } catch (uploadError) {
          console.error("Voice upload failed:", uploadError);
          publishState(
            "failed",
            uploadError?.message || "Voice audio upload failed.",
            uploadError?.message || "Voice audio upload failed.",
          );
        }
      };

      recorder.start();
    } catch (captureError) {
      console.error("Voice recording failed:", captureError);
      const errorName = captureError?.name || "";
      if (errorName === "NotAllowedError" || errorName === "SecurityError") {
        publishState("denied", STATE_COPY.denied.message, STATE_COPY.denied.message);
      } else {
        publishState("failed", "Unable to access the microphone.", captureError?.message || "Unable to access the microphone.");
      }
      cleanupRecorder();
    }
  };

  const handleConfirmTranscript = async () => {
    if (disabled || !eventOpen || !session?.id) {
      return;
    }

    const transcript = normalizeText(transcriptDraft || session.transcriptEditedText || session.transcriptText);
    if (!transcript) {
      publishState("failed", "Transcript cannot be empty.", "Transcript cannot be empty.");
      return;
    }

    try {
      const updatedSession = await saveVoiceTranscript(session.id, {
        transcript_edited_text: transcript,
        status: "CONFIRMED",
        validation_status: "VALIDATED",
      });
      publishSession(updatedSession);
      syncTranscriptDraft(transcript, { allowAutoApply: false });
      publishState("confirmed", STATE_COPY.confirmed.message);
    } catch (saveError) {
      console.error("Saving transcript failed:", saveError);
      publishState("failed", saveError?.message || "Unable to save the transcript.", saveError?.message || "Unable to save the transcript.");
    }
  };

  const handleRetry = async () => {
    if (disabled || !eventOpen || !session?.id) {
      return;
    }

    try {
      publishState("transcribing", STATE_COPY.transcribing.message);
      const updatedSession = await retryVoiceTranscription(session.id);
      publishSession(updatedSession);
      startPolling(updatedSession.id);
    } catch (retryError) {
      publishState("failed", retryError?.message || "Unable to retry transcription.", retryError?.message || "Unable to retry transcription.");
    }
  };

  const handleDiscard = async () => {
    if (disabled || !eventOpen) {
      return;
    }

    try {
      if (session?.id) {
        await archiveVoiceSession(session.id);
      }
    } catch (archiveError) {
      console.warn("Voice archive failed:", archiveError);
    } finally {
      cleanupRecorder();
      publishSession(null);
      setTranscriptDraft("");
      setRecordingElapsedMs(0);
      currentSessionIdRef.current = null;
      userEditedTranscriptRef.current = false;
      autoAppliedTranscriptRef.current = false;
      publishState("idle", STATE_COPY.idle.message);
    }
  };

  useEffect(() => {
    mountedRef.current = true;

    setIsSupported(Boolean(typeof window !== "undefined" && window.MediaRecorder && navigator?.mediaDevices?.getUserMedia));
    setIsSecureContext(Boolean(typeof window === "undefined" ? true : window.isSecureContext));

    return () => {
      mountedRef.current = false;
      cleanupRecorder();
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (session?.id) {
      const transcript = buildVoiceNoteTranscript(session);
      if (transcript && !transcriptDraft) {
        syncTranscriptDraft(transcript, { allowAutoApply: true });
      }
    }
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (typeof onVoiceStateChange === "function") {
      onVoiceStateChange({
        status,
        isBlocking: isBusy,
        isTranscriptReady,
        sessionId: session?.id || null,
        transcript: transcriptDraft,
        hasError: status === "failed" || status === "denied" || status === "unsupported",
      });
    }
  }, [isBusy, isTranscriptReady, onVoiceStateChange, session?.id, status, transcriptDraft]);

  const handleTranscriptChange = (value) => {
    userEditedTranscriptRef.current = true;
    syncTranscriptDraft(value, { allowAutoApply: false });
  };

  const handleApplyReplace = () => {
    applyTranscriptToNote(transcriptDraft, "replace");
  };

  const handleApplyAppend = () => {
    applyTranscriptToNote(transcriptDraft, "append");
  };

  const statusTone = stateMeta.tone || "neutral";
  const transcriptConfidence =
    session?.transcriptConfidence !== null && session?.transcriptConfidence !== undefined
      ? `${Math.round((session.transcriptConfidence <= 1 ? session.transcriptConfidence * 100 : session.transcriptConfidence) * 10) / 10}%`
      : null;
  const confidenceLabel =
    transcriptConfidence && transcriptConfidence !== "0%"
      ? `Confidence ${transcriptConfidence}`
      : "Confidence unavailable";
  const sessionLabel = session?.clientSessionId ? "Session active" : "No active session";

  return (
    <section className={`voice-note-composer ${className}`.trim()}>
      <div className="voice-note-header">
        <div>
          <p className="voice-note-eyebrow">Voice Notes</p>
          <h4>Capture a mechanic note with audio and transcript review</h4>
          <p className="voice-note-copy">
            Record a short voice note, let Deepgram convert it to text, then review or edit the transcript before it is submitted.
          </p>
        </div>

        <StatusBadge label={stateMeta.label} tone={statusTone} title={stateMeta.title} />
      </div>

      <div className={`voice-note-status voice-note-status-${statusTone}`}>
        <div className="voice-note-status-title">
          <CloudUploadOutlinedIcon fontSize="inherit" />
          {stateMeta.title}
        </div>
        <p>{message || stateMeta.message}</p>
      </div>

      {error ? (
        <div className="voice-note-error">
          <ErrorOutlineOutlinedIcon fontSize="inherit" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="voice-note-controls">
        <button
          type="button"
          className="btn btn-primary"
          onClick={status === "recording" ? stopRecording : startRecording}
          disabled={disabled || !eventOpen || ["uploading", "transcribing", "confirmed", "archived", "unsupported"].includes(status)}
        >
          {status === "recording" ? <StopRoundedIcon fontSize="inherit" /> : <MicRoundedIcon fontSize="inherit" />}
          {status === "recording" ? "Stop Recording" : "Start Recording"}
        </button>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleRetry}
          disabled={
            disabled ||
            !eventOpen ||
            !session?.id ||
            (!["failed", "ready", "confirmed"].includes(status) && !session?.audioStorageKey)
          }
        >
          <ReplayRoundedIcon fontSize="inherit" />
          Retry Transcription
        </button>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleDiscard}
          disabled={disabled || !eventOpen || (!session?.id && !transcriptDraft)}
        >
          <DeleteOutlineOutlinedIcon fontSize="inherit" />
          Discard
        </button>
      </div>

      <div className="voice-note-meta-row">
        <StatusBadge label={sessionLabel} tone={session?.id ? "info" : "neutral"} />
        <StatusBadge label={confidenceLabel} tone={statusTone === "success" ? "success" : statusTone === "warning" ? "warning" : "neutral"} />
        {recordingElapsedMs ? <StatusBadge label={formatDuration(recordingElapsedMs)} tone="neutral" /> : null}
      </div>

      <div className="voice-note-transcript-card">
        <div className="voice-note-transcript-head">
          <div>
            <div className="voice-note-transcript-title">
              <TextSnippetOutlinedIcon fontSize="inherit" />
              Transcript Preview
            </div>
            <p className="voice-note-transcript-copy">
              Edit the transcript if Deepgram missed anything, then apply it to the note field.
            </p>
          </div>

          <div className="voice-note-transcript-actions">
            <button type="button" className="btn btn-secondary" onClick={handleApplyReplace} disabled={disabled || !eventOpen || !normalizeText(transcriptDraft)}>
              <EditOutlinedIcon fontSize="inherit" />
              Replace Note
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleApplyAppend} disabled={disabled || !eventOpen || !normalizeText(transcriptDraft)}>
              <CloudUploadOutlinedIcon fontSize="inherit" />
              Append Note
            </button>
            <button type="button" className="btn btn-primary" onClick={handleConfirmTranscript} disabled={disabled || !eventOpen || !normalizeText(transcriptDraft)}>
              <SaveOutlinedIcon fontSize="inherit" />
              Save Transcript
            </button>
          </div>
        </div>

        <textarea
          className="voice-note-textarea"
          rows={5}
          value={transcriptDraft}
          onChange={(event) => handleTranscriptChange(event.target.value)}
          placeholder="The transcript will appear here after recording."
          disabled={
            disabled ||
            !eventOpen ||
            ["uploading", "transcribing", "unsupported", "denied", "archived"].includes(status)
          }
        />

        <div className="voice-note-transcript-footer">
          <span>{normalizeText(transcriptDraft) ? `${normalizeText(transcriptDraft).split(" ").length} words` : "Waiting for transcript"}</span>
          <span>{session?.audioFileName || "No audio file stored yet"}</span>
        </div>
      </div>
    </section>
  );
}
