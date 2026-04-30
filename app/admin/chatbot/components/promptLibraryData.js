const cleanText = (value) => String(value || "").replace(/\s+/g, " ").trim()

export const normalizePromptItem = (item) => {
  if (typeof item === "string") {
    const text = cleanText(item)
    return text ? { label: text, text } : null
  }

  const source = item || {}
  const text = cleanText(source.text || source.label)
  const label = cleanText(source.label || text)
  if (!text && !label) {
    return null
  }

  const mode = source.mode === "fill" ? "fill" : source.mode === "send" ? "send" : undefined

  return {
    label: label || text,
    text: text || label,
    mode,
    hint: cleanText(source.hint),
    category: cleanText(source.category),
    tone: cleanText(source.tone),
  }
}

export const normalizePromptItems = (items = []) =>
  items.map(normalizePromptItem).filter(Boolean)

export const dedupePromptItems = (items = []) => {
  const seen = new Set()
  return normalizePromptItems(items).filter((item) => {
    const key = `${item.label || item.text}`.toLowerCase()
    if (!key || seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

const createPrompt = (label, options = {}) =>
  normalizePromptItem({
    label,
    text: options.text || label,
    mode: options.mode,
    hint: options.hint,
    category: options.category,
    tone: options.tone,
  })

export const PROMPT_LIBRARY_SECTIONS = [
  {
    key: "events",
    title: "Events",
    description: "Event schedules, details, and quick summaries.",
    iconKey: "events",
    prompts: [
      createPrompt("Show all upcoming events", { mode: "send" }),
      createPrompt("Show active events only", { mode: "send" }),
      createPrompt("Show upcoming events for Sebring", { mode: "fill" }),
      createPrompt("Summarize upcoming events in 3 short points", { mode: "fill" }),
      createPrompt("Show event details for Sebring", { mode: "fill" }),
    ],
  },
  {
    key: "sessions",
    title: "Sessions",
    description: "Recent runs, session lists, and scoped session views.",
    iconKey: "sessions",
    prompts: [
      createPrompt("Show latest 5 sessions", { mode: "send" }),
      createPrompt("Show sessions for this event", { mode: "send" }),
      createPrompt("Show sessions for driver Alex", { mode: "fill" }),
      createPrompt("Show sessions for Porsche GT4 RS", { mode: "fill" }),
      createPrompt("Show only practice sessions", { mode: "send" }),
      createPrompt("Show latest session for this vehicle", { mode: "fill" }),
    ],
  },
  {
    key: "setup",
    title: "Setup",
    description: "Pressures, suspension, alignment, temperatures, and tire history.",
    iconKey: "setup",
    prompts: [
      createPrompt("Show setup for the latest session", { mode: "send" }),
      createPrompt("Show only tire pressures for the latest session", { mode: "send" }),
      createPrompt("Show only suspension for Session 2", { mode: "fill" }),
      createPrompt("Show only alignment for Car 12", { mode: "fill" }),
      createPrompt("Show tire temperatures for the latest session", { mode: "send" }),
      createPrompt("Show tire history for the selected session", { mode: "fill" }),
    ],
  },
  {
    key: "comparison",
    title: "Comparison",
    description: "Session deltas, baseline checks, and setup change reviews.",
    iconKey: "comparison",
    prompts: [
      createPrompt("Compare Session 1 vs Session 2", { mode: "fill" }),
      createPrompt("Compare latest session with previous session", { mode: "send" }),
      createPrompt("Show changes from baseline", { mode: "send" }),
      createPrompt("Compare only tire pressures between Session 2 and Session 3", {
        mode: "fill",
      }),
      createPrompt("Compare only suspension for the latest two sessions", { mode: "send" }),
      createPrompt("Show alignment changes from the previous session", { mode: "send" }),
    ],
  },
  {
    key: "summaries",
    title: "Summaries",
    description: "Short race-weekend summaries and quick takeaways.",
    iconKey: "summaries",
    prompts: [
      createPrompt("Summarize this session in 3 short points", { mode: "fill" }),
      createPrompt("Summarize the latest session for driver Alex", { mode: "fill" }),
      createPrompt("Summarize this run group", { mode: "send" }),
      createPrompt("Summarize only the key setup changes", { mode: "send" }),
      createPrompt("Give me a short race summary for this event", { mode: "send" }),
      createPrompt("Summarize the latest submissions briefly", { mode: "send" }),
    ],
  },
  {
    key: "submissions",
    title: "Submissions",
    description: "Recent notes, lists, and submission lookups.",
    iconKey: "submissions",
    prompts: [
      createPrompt("Show latest submissions", { mode: "send" }),
      createPrompt("Show latest submissions in list form", { mode: "send" }),
      createPrompt("Show submissions for this event", { mode: "send" }),
      createPrompt("Show submissions for driver Alex", { mode: "fill" }),
      createPrompt("Open details for the latest submission", { mode: "send" }),
      createPrompt("Summarize the latest submissions in short points", { mode: "send" }),
    ],
  },
  {
    key: "fleet",
    title: "Drivers & Vehicles",
    description: "Driver and vehicle records with scoped lookups.",
    iconKey: "fleet",
    prompts: [
      createPrompt("Show driver and vehicle data", { mode: "send" }),
      createPrompt("Show all drivers", { mode: "send" }),
      createPrompt("Show all vehicles", { mode: "send" }),
      createPrompt("Show vehicles for Nicolas", { mode: "fill" }),
      createPrompt("Show drivers in this run group", { mode: "send" }),
      createPrompt("Show vehicle details for Car 12", { mode: "fill" }),
    ],
  },
]

export const buildFeaturedPrompts = (scope = {}) => {
  const eventLabel = cleanText(scope.eventLabel || scope.event_label || scope.selectedEventLabel)
  const sessionLabel = cleanText(
    scope.sessionLabel || scope.session_label || scope.selectedSessionLabel,
  )
  const driverLabel = cleanText(scope.driverLabel || scope.driver_label || scope.selectedDriverLabel)
  const vehicleLabel = cleanText(
    scope.vehicleLabel || scope.vehicle_label || scope.selectedVehicleLabel,
  )

  const prompts = [
    eventLabel
      ? createPrompt(`Show sessions for ${eventLabel}`, { mode: "send" })
      : createPrompt("Show all upcoming events", { mode: "send" }),
    createPrompt("Show latest 5 sessions", { mode: "send" }),
    sessionLabel
      ? createPrompt(`Show setup for ${sessionLabel}`, { mode: "send" })
      : createPrompt("Show setup for the latest session", { mode: "send" }),
    createPrompt("Compare latest session with previous session", { mode: "send" }),
    driverLabel
      ? createPrompt(`Show sessions for ${driverLabel}`, { mode: "send" })
      : vehicleLabel
        ? createPrompt(`Show latest session for ${vehicleLabel}`, { mode: "send" })
        : createPrompt("Show driver and vehicle data", { mode: "send" }),
  ]

  return dedupePromptItems(prompts).slice(0, 5)
}

const isPromptVague = (queryText) =>
  /recent|latest|today|more|tell me more|show data|show me|summary|anything|help/i.test(queryText)

const hasKeyword = (queryText, pattern) => pattern.test(queryText)

const EVENT_REFINE_PROMPTS = [
  createPrompt("Show all upcoming events", { mode: "send" }),
  createPrompt("Show active events only", { mode: "send" }),
  createPrompt("Summarize upcoming events in 3 short points", { mode: "fill" }),
]

const SESSION_REFINE_PROMPTS = [
  createPrompt("Show latest 5 sessions", { mode: "send" }),
  createPrompt("Show sessions for this event", { mode: "send" }),
  createPrompt("Summarize this session in 3 short points", { mode: "fill" }),
]

const SETUP_REFINE_PROMPTS = [
  createPrompt("Show setup for the latest session", { mode: "send" }),
  createPrompt("Show only tire pressures for the latest session", { mode: "send" }),
  createPrompt("Show only alignment for Car 12", { mode: "fill" }),
]

const COMPARISON_REFINE_PROMPTS = [
  createPrompt("Compare Session 1 vs Session 2", { mode: "fill" }),
  createPrompt("Compare latest session with previous session", { mode: "send" }),
  createPrompt("Show changes from baseline", { mode: "send" }),
]

const SUBMISSION_REFINE_PROMPTS = [
  createPrompt("Show latest submissions", { mode: "send" }),
  createPrompt("Show latest submissions in list form", { mode: "send" }),
  createPrompt("Open details for the latest submission", { mode: "send" }),
]

const FLEET_REFINE_PROMPTS = [
  createPrompt("Show driver and vehicle data", { mode: "send" }),
  createPrompt("Show all drivers", { mode: "send" }),
  createPrompt("Show all vehicles", { mode: "send" }),
]

const DEFAULT_SUPPORT_PROMPTS = [
  createPrompt("Show latest 5 sessions", { mode: "send" }),
  createPrompt("Show all upcoming events", { mode: "send" }),
  createPrompt("Show driver and vehicle data", { mode: "send" }),
]

export const buildSupportPromptSuggestions = ({
  kind = "",
  queryText = "",
  scope = {},
  response = null,
  limit = 3,
}) => {
  const query = cleanText(queryText).toLowerCase()
  const prompts = []
  const add = (items) => {
    prompts.push(...items)
  }

  const hasEvent = hasKeyword(query, /event/)
  const hasSession = hasKeyword(query, /session|run group|rungroup/)
  const hasSetup = hasKeyword(query, /setup|pressure|suspension|alignment|temperature|history|corner/)
  const hasComparison = hasKeyword(query, /compare|difference|delta/)
  const hasSubmission = hasKeyword(query, /submission/)
  const hasFleet = hasKeyword(query, /driver|vehicle|car/)
  const vague = isPromptVague(query)
  const needsGeneralFallback =
    kind === "not_found" || kind === "unsupported" || kind === "needs_context" || kind === "error"

  if (hasComparison || kind === "compare") {
    add(COMPARISON_REFINE_PROMPTS)
  } else if (hasSetup || kind === "setup") {
    add(SETUP_REFINE_PROMPTS)
  } else if (hasSubmission || kind === "submissions") {
    add(SUBMISSION_REFINE_PROMPTS)
  } else if (hasFleet || kind === "fleet") {
    add(FLEET_REFINE_PROMPTS)
  } else if (hasEvent || kind === "events") {
    add(EVENT_REFINE_PROMPTS)
  } else if (hasSession || kind === "sessions") {
    add(SESSION_REFINE_PROMPTS)
  } else if (vague) {
    add(scope.eventLabel ? EVENT_REFINE_PROMPTS : EVENT_REFINE_PROMPTS.slice(0, 2))
    add(SESSION_REFINE_PROMPTS)
    add(SUBMISSION_REFINE_PROMPTS.slice(0, 2))
  } else {
    add(buildFeaturedPrompts(scope))
  }

  if (needsGeneralFallback) {
    add(DEFAULT_SUPPORT_PROMPTS)
  }

  if (response?.kind === "compare") {
    add(COMPARISON_REFINE_PROMPTS)
  }

  return dedupePromptItems(prompts).slice(0, limit)
}

export const buildFollowUpPrompts = ({
  response = null,
  messageText = "",
  scope = {},
  limit = 4,
}) => {
  const prompts = []
  const add = (items) => {
    prompts.push(...items)
  }

  add(normalizePromptItems(response?.follow_up || []))

  if (response?.kind === "compare") {
    add([
      createPrompt("Show only the important differences", { mode: "send" }),
      createPrompt("Compare with the previous session", { mode: "send" }),
      createPrompt("Show baseline changes", { mode: "send" }),
      createPrompt("Compare only tire pressures", { mode: "fill" }),
    ])
  } else if (response?.kind === "setup") {
    add([
      createPrompt("Show only tire pressures", { mode: "send" }),
      createPrompt("Show alignment only", { mode: "send" }),
      createPrompt("Show suspension only", { mode: "send" }),
      createPrompt("Compare with the previous session", { mode: "send" }),
    ])
  } else if (response?.kind === "sessions") {
    add([
      createPrompt("Show only the important ones", { mode: "send" }),
      createPrompt("Show this in short form", { mode: "send" }),
      createPrompt("Open full details", { mode: "send" }),
      createPrompt("Compare this with the previous session", { mode: "send" }),
    ])
  } else if (response?.kind === "events") {
    add([
      createPrompt("Show active events only", { mode: "send" }),
      createPrompt("Show event details for this event", { mode: "send" }),
      createPrompt("Summarize upcoming events", { mode: "send" }),
    ])
  } else if (response?.kind === "submissions") {
    add([
      createPrompt("Show latest submissions in list form", { mode: "send" }),
      createPrompt("Open the latest submission", { mode: "send" }),
      createPrompt("Summarize the latest submissions", { mode: "send" }),
    ])
  } else if (response?.kind === "fleet") {
    add([
      createPrompt("Show all drivers", { mode: "send" }),
      createPrompt("Show all vehicles", { mode: "send" }),
      createPrompt("Show vehicle details for Car 12", { mode: "fill" }),
    ])
  } else if (/compare|difference|delta/.test(cleanText(messageText).toLowerCase())) {
    add(COMPARISON_REFINE_PROMPTS)
  } else if (/setup|pressure|suspension|alignment|temperature|history/.test(cleanText(messageText).toLowerCase())) {
    add(SETUP_REFINE_PROMPTS)
  } else if (/submission/.test(cleanText(messageText).toLowerCase())) {
    add(SUBMISSION_REFINE_PROMPTS)
  } else if (/driver|vehicle|car/.test(cleanText(messageText).toLowerCase())) {
    add(FLEET_REFINE_PROMPTS)
  } else if (/event/.test(cleanText(messageText).toLowerCase())) {
    add(EVENT_REFINE_PROMPTS)
  }

  if (scope?.eventLabel && prompts.length < limit) {
    add([createPrompt("Show sessions for this event", { mode: "send" })])
  }

  if (scope?.driverLabel && prompts.length < limit) {
    add([createPrompt(`Show sessions for ${scope.driverLabel}`, { mode: "fill" })])
  }

  if (scope?.vehicleLabel && prompts.length < limit) {
    add([createPrompt(`Show latest session for ${scope.vehicleLabel}`, { mode: "fill" })])
  }

  return dedupePromptItems(prompts).slice(0, limit)
}
