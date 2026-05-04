"use client";

import { useEffect, useRef, useState } from "react";
import MicRoundedIcon from "@mui/icons-material/MicRounded";
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded";
import StopRoundedIcon from "@mui/icons-material/StopRounded";
import StatusBadge from "./StatusBadge";

const VOICE_COPY_PRESETS = {
  notes: {
    eyebrow: "Voice Input",
    listeningMessage: "Speak naturally. The mic will capture your note.",
    processingMessage: "Processing voice input...",
    successMessage: "Voice note added to raw text.",
    errorMessage: "Could not capture speech.",
    unsupportedMessage: "Voice input is not supported in this browser. Use Chrome or Edge.",
    supportMessage: "Voice dictation is currently available in Chrome or Edge.",
    startButtonLabel: "Start Voice Note",
    listeningButtonLabel: "Stop Recording",
    processingButtonLabel: "Processing",
    successButtonLabel: "Voice Added",
    errorButtonLabel: "Retry Voice",
    successBadgeLabel: "Inserted",
    previewLabel: "Heard",
  },
  assistant: {
    eyebrow: "Voice Agent",
    listeningMessage: "Speak naturally. The mic will capture your prompt.",
    processingMessage: "Processing voice input...",
    successMessage: "Voice prompt added to the assistant composer.",
    errorMessage: "Could not capture speech.",
    unsupportedMessage: "Voice input is not supported in this browser. Use Chrome or Edge.",
    supportMessage: "Voice dictation is currently available in Chrome or Edge.",
    startButtonLabel: "Start Voice Query",
    listeningButtonLabel: "Stop Recording",
    processingButtonLabel: "Processing",
    successButtonLabel: "Voice Ready",
    errorButtonLabel: "Retry Voice",
    successBadgeLabel: "Ready",
    previewLabel: "Heard",
  },
};

const ERROR_MESSAGES = {
  "not-allowed":
    "Microphone access was denied. Allow permission and try again.",
  "service-not-allowed":
    "Microphone access was blocked by the browser. Allow permission and try again.",
  "audio-capture":
    "No microphone was detected. Check your input device and try again.",
  "no-speech":
    "No speech was detected. Speak a little louder and try again.",
  network: "Speech recognition could not reach the service. Try again.",
  aborted: "Voice capture stopped before any text was captured.",
};

export default function VoiceInputControl({
  textareaRef,
  onValueChange,
  onTranscriptInserted,
  disabled = false,
  className = "",
  mode = "notes",
}) {
  const voiceCopy = VOICE_COPY_PRESETS[mode] || VOICE_COPY_PRESETS.notes;
  const STATUS_META = {
    idle: {
      tone: "neutral",
      label: "Ready",
      message: "",
    },
    listening: {
      tone: "accent",
      label: "Listening",
      message: voiceCopy.listeningMessage,
    },
    processing: {
      tone: "warning",
      label: "Processing",
      message: voiceCopy.processingMessage,
    },
    success: {
      tone: "success",
      label: voiceCopy.successBadgeLabel,
      message: voiceCopy.successMessage,
    },
    error: {
      tone: "danger",
      label: "Error",
      message: voiceCopy.errorMessage,
    },
  };

  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState(STATUS_META.idle.message);
  const [preview, setPreview] = useState("");
  const [isSupported, setIsSupported] = useState(true);

  const recognitionRef = useRef(null);
  const finalTranscriptRef = useRef("");
  const timeoutRef = useRef(null);
  const mountedRef = useRef(false);
  const statusRef = useRef("idle");

  const updateStatus = (nextStatus, nextMessage) => {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
    setMessage(nextMessage);
  };

  const clearTimer = () => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const cleanupRecognition = () => {
    clearTimer();

    const recognition = recognitionRef.current;
    recognitionRef.current = null;

    if (!recognition) {
      return;
    }

    try {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.onstart = null;
      recognition.abort();
    } catch (error) {
      // Ignore cleanup failures in browsers that tear down recognition early.
    }
  };

  const insertTranscript = (transcript) => {
    const cleanedTranscript = transcript.trim().replace(/\s+/g, " ");
    if (!cleanedTranscript) {
      return;
    }

    if (typeof onTranscriptInserted === "function") {
      onTranscriptInserted(cleanedTranscript);
    }

    if (typeof onValueChange !== "function") {
      return;
    }

    onValueChange((currentValue = "") => {
      const sourceValue = typeof currentValue === "string" ? currentValue : "";
      const target = textareaRef?.current;

      if (
        target &&
        typeof document !== "undefined" &&
        document.activeElement === target &&
        typeof target.selectionStart === "number" &&
        typeof target.selectionEnd === "number"
      ) {
        const start = target.selectionStart;
        const end = target.selectionEnd;
        const before = sourceValue.slice(0, start);
        const after = sourceValue.slice(end);
        const needsPrefixSpace = before.length > 0 && !/\s$/.test(before);
        const needsSuffixSpace = after.length > 0 && !/^\s/.test(after);

        const nextValue = `${before}${
          needsPrefixSpace ? " " : ""
        }${cleanedTranscript}${needsSuffixSpace ? " " : ""}${after}`;

        window.requestAnimationFrame(() => {
          const currentTarget = textareaRef?.current;
          if (!currentTarget) {
            return;
          }

          currentTarget.focus();
          const cursorPosition =
            before.length +
            (needsPrefixSpace ? 1 : 0) +
            cleanedTranscript.length +
            (needsSuffixSpace ? 1 : 0);

          try {
            currentTarget.setSelectionRange(cursorPosition, cursorPosition);
          } catch (error) {
            // Some browsers may not support programmatic selection in all cases.
          }
        });

        return nextValue;
      }

      const needsPrefixSpace = sourceValue.length > 0 && !/\s$/.test(sourceValue);
      const nextValue = `${sourceValue}${
        needsPrefixSpace ? " " : ""
      }${cleanedTranscript}`;

      window.requestAnimationFrame(() => {
        const currentTarget = textareaRef?.current;
        if (!currentTarget) {
          return;
        }

        currentTarget.focus();
        try {
          currentTarget.setSelectionRange(nextValue.length, nextValue.length);
        } catch (error) {
          // No-op if the browser refuses selection updates.
        }
      });

      return nextValue;
    });
  };

  const finishSuccess = (transcript) => {
    updateStatus("processing", STATUS_META.processing.message);
    setPreview(transcript);

    timeoutRef.current = window.setTimeout(() => {
      if (!mountedRef.current) {
        return;
      }

      insertTranscript(transcript);
      updateStatus("success", STATUS_META.success.message);
      setPreview(transcript);

      timeoutRef.current = window.setTimeout(() => {
        if (!mountedRef.current) {
          return;
        }

        setPreview("");
        updateStatus("idle", STATUS_META.idle.message);
      }, 2200);
    }, 120);
  };

  const startRecognition = () => {
    if (disabled) {
      return;
    }

    if (!isSupported) {
      updateStatus(
        "error",
        voiceCopy.unsupportedMessage,
      );
      return;
    }

    clearTimer();
    setPreview("");
    finalTranscriptRef.current = "";

    const Recognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!Recognition) {
      updateStatus(
        "error",
        voiceCopy.unsupportedMessage,
      );
      return;
    }

    cleanupRecognition();

    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onstart = () => {
      updateStatus("listening", STATUS_META.listening.message);
    };

    recognition.onresult = (event) => {
      let interimTranscript = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript || "";

        if (result.isFinal) {
          finalTranscriptRef.current = `${finalTranscriptRef.current} ${transcript}`
            .trim()
            .replace(/\s+/g, " ");
        } else {
          interimTranscript += transcript;
        }
      }

      const livePreview = `${finalTranscriptRef.current} ${interimTranscript}`
        .trim()
        .replace(/\s+/g, " ");
      setPreview(livePreview);
    };

    recognition.onerror = (event) => {
      const errorMessage =
        ERROR_MESSAGES[event.error] ||
        "Could not capture speech. Please try again.";
      updateStatus("error", errorMessage);
      setPreview("");
      cleanupRecognition();
    };

    recognition.onend = () => {
      const transcript = finalTranscriptRef.current.trim();
      recognitionRef.current = null;

      if (statusRef.current === "error") {
        return;
      }

      if (transcript) {
        finishSuccess(transcript);
        return;
      }

      updateStatus("error", ERROR_MESSAGES.no_speech);
      setPreview("");
    };

    try {
      recognition.start();
    } catch (error) {
      updateStatus(
        "error",
        "Could not start voice input. Please try again.",
      );
      cleanupRecognition();
    }
  };

  const stopRecognition = () => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      return;
    }

    updateStatus("processing", STATUS_META.processing.message);

    try {
      recognition.stop();
    } catch (error) {
      updateStatus(
        "error",
        "Voice capture could not be stopped cleanly. Please retry.",
      );
      cleanupRecognition();
    }
  };

  const handleToggle = () => {
    if (status === "listening") {
      stopRecognition();
      return;
    }

    startRecognition();
  };

  useEffect(() => {
    mountedRef.current = true;

    const supported =
      typeof window !== "undefined" &&
      (window.SpeechRecognition || window.webkitSpeechRecognition);

    setIsSupported(Boolean(supported));

    if (!supported) {
      updateStatus(
        "error",
        voiceCopy.unsupportedMessage,
      );
      setPreview("");
    }

    return () => {
      mountedRef.current = false;
      cleanupRecognition();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const meta = STATUS_META[status] || STATUS_META.idle;
  const badgeLabel = !isSupported ? "Unsupported" : meta.label;
  const badgeTone = !isSupported ? "danger" : meta.tone;
  const badgeMessage = !isSupported
    ? voiceCopy.unsupportedMessage
    : meta.message;
  const displayMessage = isSupported ? message : badgeMessage;
  const buttonLabel = !isSupported
    ? "Unavailable"
    : status === "listening"
      ? voiceCopy.listeningButtonLabel
      : status === "processing"
        ? voiceCopy.processingButtonLabel
        : status === "success"
          ? voiceCopy.successButtonLabel
      : status === "error"
        ? voiceCopy.errorButtonLabel
        : voiceCopy.startButtonLabel;

  return (
    <div className={`voice-input-control ${className}`.trim()}>
      <div className={`voice-input-card voice-input-card-${status}`}>
        <div className="voice-input-header">
          <div className="voice-input-copy">
            <span className="voice-input-eyebrow">{voiceCopy.eyebrow}</span>
            {displayMessage ? (
              <p className="voice-input-message" aria-live="polite">
                {displayMessage}
              </p>
            ) : null}
          </div>

          <div className="voice-input-status-wrap">
            <StatusBadge
              label={badgeLabel}
              tone={badgeTone}
              title={badgeMessage}
            />
          </div>
        </div>

        <div className="voice-input-actions">
          <button
            type="button"
            className={`voice-input-button voice-input-button-${status}`}
            onClick={handleToggle}
            disabled={disabled || !isSupported || status === "processing" || status === "success"}
            aria-pressed={status === "listening"}
            aria-label={buttonLabel}
            title={meta.message}
          >
            <span className="voice-input-icon">
              {status === "listening" ? (
                <StopRoundedIcon fontSize="inherit" />
              ) : (
                <MicRoundedIcon fontSize="inherit" />
              )}
            </span>
            <span>{buttonLabel}</span>
          </button>

          {status === "error" && isSupported && (
            <button
              type="button"
              className="voice-input-retry"
              onClick={startRecognition}
              disabled={disabled}
              aria-label="Retry voice input"
              title="Retry"
            >
              <ReplayRoundedIcon fontSize="inherit" />
              <span>Retry</span>
            </button>
          )}
        </div>

      </div>

      {preview ? (
        <p className="voice-input-preview">
          {voiceCopy.previewLabel}: &quot;{preview}&quot;
        </p>
      ) : null}

      {!isSupported ? (
        <p className="voice-input-support">
          {voiceCopy.supportMessage}
        </p>
      ) : null}
    </div>
  );
}
