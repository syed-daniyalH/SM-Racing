"use client"

import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined"
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined"
import StatusBadge from "../../../components/Common/StatusBadge"
import AssistantIcon from "./AssistantIcon"

const RESPONSE_STATUS_TONES = {
  success: "success",
  not_found: "warning",
  error: "danger",
  unsupported: "neutral",
  loading: "info",
  empty: "neutral",
}

const RESPONSE_STATUS_LABELS = {
  success: "Ready",
  not_found: "No match",
  error: "Error",
  unsupported: "Needs detail",
  loading: "Thinking",
  empty: "Empty",
}

const RESPONSE_KIND_LABELS = {
  message: "Response",
  empty: "No data",
  events: "Events",
  sessions: "Sessions",
  setup: "Setup sheet",
  compare: "Comparison",
  fleet: "Fleet",
  submissions: "Submissions",
}

const humanizeLabel = (value) => {
  if (!value) {
    return ""
  }

  const text = String(value)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  if (!text) {
    return ""
  }

  return text.charAt(0).toUpperCase() + text.slice(1)
}

const normalizeWhitespace = (value) => String(value || "").replace(/\s+/g, " ").trim()

const polishAssistantText = (value) => {
  const text = normalizeWhitespace(value)
  if (!text) {
    return ""
  }

  return text
    .replace(/session\(s\)/gi, "sessions")
    .replace(/record\(s\)/gi, "records")
    .replace(/\bFound\s+/g, "I found ")
}

const readScopeValue = (scope, keys) => {
  for (const key of keys) {
    const value = scope?.[key]
    if (value && String(value).trim()) {
      return String(value).trim()
    }
  }
  return ""
}

const getRecordCount = (response) => {
  if (!response) {
    return 0
  }

  if (Array.isArray(response.records_used)) {
    return response.records_used.length
  }

  const count = response.data?.records_used_count
  const normalizedCount = Number(count)
  if (Number.isFinite(normalizedCount)) {
    return normalizedCount
  }

  return 0
}

export const formatAssistantTimestamp = (value) => {
  if (!value) {
    return "Just now"
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return "Just now"
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed)
}

export const getResponseState = (response, loading = false) => {
  if (loading) {
    return "loading"
  }

  return response?.status || "empty"
}

export const getResponseStateLabel = (state) => RESPONSE_STATUS_LABELS[state] || humanizeLabel(state)

export const getResponseStateTone = (state) => RESPONSE_STATUS_TONES[state] || "neutral"

export const getResponseTypeLabel = (response) => {
  if (!response) {
    return ""
  }

  return RESPONSE_KIND_LABELS[response.kind] || humanizeLabel(response.kind)
}

export const buildAssistantSummary = (response, fallbackText = "") => {
  if (!response) {
    return normalizeWhitespace(fallbackText)
  }

  const rawSummary =
    response.status === "error"
      ? response.error_message || response.error || response.summary || response.answer || fallbackText
      : response.status === "not_found"
        ? response.no_data_message || response.summary || response.answer || fallbackText
        : response.summary || response.answer || fallbackText

  const summary = polishAssistantText(rawSummary)
  if (summary) {
    return summary
  }

  if (response.status === "loading") {
    return "Working through the live database now."
  }

  if (response.status === "not_found") {
    return "No matching data was found in the SM2 Racing database."
  }

  if (response.status === "unsupported") {
    return "I can help with events, sessions, setup sheets, tire data, submissions, and driver or vehicle records."
  }

  if (response.status === "error") {
    return "The assistant could not reach the live database."
  }

  return normalizeWhitespace(fallbackText) || "Response received."
}

const buildScopeLabel = (scope) => {
  const session = readScopeValue(scope, ["session_label", "sessionLabel"])
  if (session) {
    return `Session: ${session}`
  }

  const event = readScopeValue(scope, ["event_label", "eventLabel"])
  if (event) {
    return `Event: ${event}`
  }

  const driver = readScopeValue(scope, ["driver_label", "driverLabel"])
  if (driver) {
    return `Driver: ${driver}`
  }

  const vehicle = readScopeValue(scope, ["vehicle_label", "vehicleLabel"])
  if (vehicle) {
    return `Vehicle: ${vehicle}`
  }

  return ""
}

export const buildResponseMetaItems = ({ response, scope = {}, recordCount }) => {
  const items = []
  const state = getResponseState(response)
  const statusLabel = getResponseStateLabel(state)
  const dataSource = response?.data_source || response?.source_label || "SM2 Racing Database"
  const scopeLabel = buildScopeLabel(scope)
  const intentLabel = response?.intent ? humanizeLabel(response.intent) : ""

  items.push({ label: "Data source", value: dataSource, tone: "accent" })
  items.push({ label: "Records", value: String(recordCount ?? getRecordCount(response)), tone: recordCount > 0 ? "success" : "neutral" })
  items.push({ label: "Status", value: statusLabel, tone: getResponseStateTone(state) })

  if (scopeLabel) {
    items.push({ label: "Scope", value: scopeLabel, tone: "info" })
  } else if (intentLabel) {
    items.push({ label: "Intent", value: intentLabel, tone: "neutral" })
  }

  return items.slice(0, 4)
}

export const buildResponseInsights = ({ response, scope = {}, recordCount }) => {
  const insights = []
  const scopeItems = [
    {
      label: "Event",
      value: readScopeValue(scope, ["event_label", "eventLabel"]),
      tone: "accent",
    },
    {
      label: "Session",
      value: readScopeValue(scope, ["session_label", "sessionLabel"]),
      tone: "accent",
    },
    {
      label: "Driver",
      value: readScopeValue(scope, ["driver_label", "driverLabel"]),
      tone: "accent",
    },
    {
      label: "Vehicle",
      value: readScopeValue(scope, ["vehicle_label", "vehicleLabel"]),
      tone: "accent",
    },
  ].filter((item) => item.value)

  scopeItems.slice(0, 4).forEach((item) => {
    insights.push(item)
  })

  const sectionsCount = Array.isArray(response?.sections) ? response.sections.length : 0
  const referencedRecords = recordCount ?? getRecordCount(response)

  if (sectionsCount) {
    insights.push({ label: "Sections", value: String(sectionsCount), tone: "neutral" })
  }

  if (referencedRecords) {
    insights.push({ label: "Records used", value: String(referencedRecords), tone: "success" })
  }

  const intentLabel = response?.intent ? humanizeLabel(response.intent) : ""
  if (intentLabel && insights.length < 5) {
    insights.push({ label: "Intent", value: intentLabel, tone: "info" })
  }

  if (response?.data?.missing_sections_count && insights.length < 5) {
    insights.push({
      label: "Missing sections",
      value: String(response.data.missing_sections_count),
      tone: "warning",
    })
  }

  return insights.slice(0, 5)
}

export const getSuggestedNextSteps = (response, limit = 5) =>
  (Array.isArray(response?.follow_up) ? response.follow_up : []).slice(0, limit)

export const serializeAssistantResponse = (response, scope = {}) => {
  if (!response) {
    return ""
  }

  const summary = buildAssistantSummary(response)
  const responseTypeLabel = getResponseTypeLabel(response)
  const metaItems = buildResponseMetaItems({ response, scope })
  const insights = buildResponseInsights({ response, scope })
  const sections = Array.isArray(response.sections) ? response.sections : []

  const lines = []

  if (responseTypeLabel) {
    lines.push(`AI Race Assistant - ${responseTypeLabel}`)
  }

  if (summary) {
    lines.push(summary)
  }

  if (metaItems.length) {
    lines.push("")
    lines.push("Response details")
    metaItems.forEach((item) => {
      lines.push(`- ${item.label}: ${item.value}`)
    })
  }

  if (insights.length) {
    lines.push("")
    lines.push("Key insights")
    insights.forEach((item) => {
      lines.push(`- ${item.label}${item.value ? `: ${item.value}` : ""}`)
    })
  }

  if (sections.length) {
    lines.push("")
    lines.push("Details")
    sections.slice(0, 8).forEach((section) => {
      lines.push(section.title)
      if (section.subtitle) {
        lines.push(section.subtitle)
      }

      if (section.variant === "fields" && Array.isArray(section.fields)) {
        section.fields.slice(0, 12).forEach((field) => {
          lines.push(`- ${field.label}: ${field.value}`)
        })
      }

      if (section.variant === "cards" && Array.isArray(section.cards)) {
        section.cards.slice(0, 8).forEach((card) => {
          lines.push(`- ${card.title}${card.subtitle ? ` | ${card.subtitle}` : ""}`)
          if (Array.isArray(card.fields)) {
            card.fields.slice(0, 8).forEach((field) => {
              lines.push(`  - ${field.label}: ${field.value}`)
            })
          }
        })
      }

      if (section.variant === "table" && Array.isArray(section.table_rows)) {
        if (Array.isArray(section.table_headers) && section.table_headers.length) {
          lines.push(section.table_headers.join(" | "))
        }
        section.table_rows.slice(0, 10).forEach((row) => {
          lines.push(row.join(" | "))
        })
      }
    })
  }

  return lines.join("\n")
}

function ResponseStateBadge({ status, label, tone, className = "", title }) {
  const state = status || "empty"
  const resolvedLabel = label || getResponseStateLabel(state)
  const resolvedTone = tone || getResponseStateTone(state)

  return (
    <StatusBadge
      label={resolvedLabel}
      tone={resolvedTone}
      className={className}
      title={title || resolvedLabel}
    />
  )
}

function ResponseCompactChip({ label, value, tone = "neutral", className = "", title }) {
  return (
    <div
      className={`chatbot-response-chip chatbot-response-chip-${tone} ${className}`.trim()}
      title={title || (value ? `${label}: ${value}` : label)}
    >
      <span className="chatbot-response-chip-label">{label}</span>
      {value ? <span className="chatbot-response-chip-value">{value}</span> : null}
    </div>
  )
}

export function ResponseHeader({
  response,
  createdAt,
  onCopy,
  loading = false,
}) {
  const state = getResponseState(response, loading)
  const responseTypeLabel = loading ? "" : getResponseTypeLabel(response)
  const timestamp = formatAssistantTimestamp(createdAt || response?.generated_at)

  return (
    <header className="chatbot-response-header">
      <div className="chatbot-response-header-main">
        <div className="chatbot-response-avatar chatbot-response-avatar-brand" aria-hidden="true">
          <AssistantIcon className="chatbot-response-avatar-image" decorative />
        </div>
        <div className="chatbot-response-heading">
          <div className="chatbot-response-label-row">
            <div className="chatbot-response-label">AI Race Assistant</div>
            {responseTypeLabel ? (
              <ResponseStateBadge label={responseTypeLabel} tone="accent" />
            ) : null}
          </div>
          <div className="chatbot-response-timestamp">{timestamp}</div>
        </div>
      </div>

      <div className="chatbot-response-header-actions">
        <ResponseStateBadge status={state} />
        {onCopy ? (
          <button
            type="button"
            className="chatbot-response-copy"
            onClick={onCopy}
            title="Copy answer"
            aria-label="Copy answer"
          >
            <ContentCopyOutlinedIcon fontSize="inherit" />
          </button>
        ) : null}
      </div>
    </header>
  )
}

export function ResponseSummary({ summary, state }) {
  return <p className={`chatbot-response-summary chatbot-response-summary-${state}`}>{summary}</p>
}

export function ResponseMetaRow({ items }) {
  if (!items.length) {
    return null
  }

  return (
    <div className="chatbot-response-meta-row">
      {items.map((item) => (
        <ResponseCompactChip
          key={`${item.label}-${item.value}`}
          label={item.label}
          value={item.value}
          tone={item.tone || "neutral"}
        />
      ))}
    </div>
  )
}

export function ResponseInsightsRow({ items }) {
  if (!items.length) {
    return null
  }

  return (
    <div className="chatbot-response-insights-row">
      <div className="chatbot-response-insights-label">Key insights</div>
      <div className="chatbot-response-insights-chips">
        {items.map((item) => (
          <ResponseCompactChip
            key={`${item.label}-${item.value || "insight"}`}
            label={item.label}
            value={item.value || ""}
            tone={item.tone || "neutral"}
          />
        ))}
      </div>
    </div>
  )
}

export function ResponseContentSlot({ children }) {
  if (!children) {
    return null
  }

  return <div className="chatbot-response-content-slot">{children}</div>
}

export function SuggestedNextSteps({ suggestions = [], onFollowUp, loading = false }) {
  const visibleSuggestions = suggestions.slice(0, 5)

  if (!visibleSuggestions.length) {
    return null
  }

  return (
    <div className="chatbot-response-next-steps">
      <div className="chatbot-response-next-steps-label">Suggested next steps</div>
      <div className="chatbot-response-next-steps-chips">
        {visibleSuggestions.map((item) => {
          const ActionIcon =
            AutoAwesomeOutlinedIcon

          return (
            <button
              key={item}
              type="button"
              className="chatbot-response-next-step-chip"
              onClick={() => onFollowUp?.(item)}
              disabled={loading}
            >
              <ActionIcon fontSize="inherit" />
              <span>{item}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function AssistantResponseShell({
  response,
  message,
  scope = {},
  onCopy,
  onFollowUp,
  children = null,
  loading = false,
}) {
  const state = getResponseState(response, loading)
  const summary = buildAssistantSummary(response, message?.text || "")
  const metaItems = buildResponseMetaItems({
    response,
    scope: scope || message?.scope || {},
    recordCount: getRecordCount(response),
  })
  const insights = buildResponseInsights({
    response,
    scope: scope || message?.scope || {},
    recordCount: getRecordCount(response),
  })
  const nextSteps = getSuggestedNextSteps(response)

  return (
    <div className={`chatbot-response-shell chatbot-response-shell-${state}`}>
      <ResponseHeader
        response={response}
        createdAt={message?.createdAt}
        onCopy={onCopy}
        loading={loading}
      />

      <div className="chatbot-response-shell-body">
        <ResponseSummary summary={summary} state={state} />
        <ResponseMetaRow items={metaItems} />
        <ResponseInsightsRow items={insights} />

        {loading ? (
          <div className="chatbot-response-loading" aria-live="polite">
            <span />
            <span />
            <span />
          </div>
        ) : (
          <ResponseContentSlot>{children}</ResponseContentSlot>
        )}

        <SuggestedNextSteps
          suggestions={nextSteps}
          onFollowUp={onFollowUp}
          loading={loading}
        />
      </div>
    </div>
  )
}
