"use client"

import StatusBadge from "../../../components/Common/StatusBadge"
import { compactList, getFieldValue, normalizeText } from "./responseRecordUtils"

const renderFieldGroup = (title, items = []) => {
  const visibleItems = items.filter((item) => normalizeText(item?.value))
  if (!visibleItems.length) {
    return null
  }

  return (
    <section className="chatbot-detail-group" key={title}>
      <h4>{title}</h4>
      <div className="chatbot-detail-grid">
        {visibleItems.map((item) => (
          <article className="chatbot-detail-stat" key={`${title}-${item.label}`}>
            <span className="chatbot-detail-stat-label">{item.label}</span>
            <span className="chatbot-detail-stat-value">{item.value}</span>
          </article>
        ))}
      </div>
    </section>
  )
}

export default function SubmissionDetailPanel({ item }) {
  if (!item) {
    return null
  }

  const lookup = item.lookup || {}
  const summaryText =
    getFieldValue(lookup, "note") ||
    getFieldValue(lookup, "error") ||
    normalizeText(item.subtitle)

  const sessionInfo = [
    { label: "Session", value: getFieldValue(lookup, "session") },
    { label: "Session window", value: getFieldValue(lookup, "session window") },
    { label: "Track", value: getFieldValue(lookup, "track") },
    { label: "Event", value: getFieldValue(lookup, "event") },
    { label: "Run group", value: getFieldValue(lookup, "run group") },
  ]

  const metadata = [
    { label: "Submission type", value: getFieldValue(lookup, "submission type") },
    { label: "Structured ingest", value: getFieldValue(lookup, "structured ingest") },
    { label: "Image review", value: getFieldValue(lookup, "image review") },
    { label: "Created", value: getFieldValue(lookup, "created") },
    { label: "Submission ref", value: getFieldValue(lookup, "submission ref") || item.title },
  ]

  const relatedDetails = compactList(
    [
      getFieldValue(lookup, "driver"),
      getFieldValue(lookup, "vehicle"),
      getFieldValue(lookup, "image"),
      getFieldValue(lookup, "error"),
    ],
    4,
  )

  return (
    <div className="chatbot-detail-panel">
      <header className="chatbot-detail-hero">
        <div className="chatbot-detail-hero-copy">
          <div className="chatbot-detail-eyebrow">Submission summary</div>
          <h3>{item.title}</h3>
          {item.subtitle ? <p>{item.subtitle}</p> : null}
        </div>
        {item.badge ? <StatusBadge label={item.badge} tone={item.badgeTone} /> : null}
      </header>

      {summaryText ? (
        <section className="chatbot-detail-summary">
          <h4>Notes</h4>
          <p>{summaryText}</p>
        </section>
      ) : null}

      {renderFieldGroup("Session info", sessionInfo)}
      {renderFieldGroup("Metadata", metadata)}

      {relatedDetails.length ? (
        <section className="chatbot-detail-group">
          <h4>Related detail</h4>
          <div className="chatbot-detail-pill-row">
            {relatedDetails.map((value) => (
              <span className="chatbot-detail-pill" key={value}>
                {value}
              </span>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
