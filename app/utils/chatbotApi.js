import axiosInstance from "./axiosInstance"

const HTML_ERROR_MARKERS = [
  "<!DOCTYPE html",
  "<html",
  "This page could not be found",
  "__next_f",
]

const isHtmlLikeError = (value) => {
  if (typeof value !== "string") {
    return false
  }

  const trimmed = value.trim()
  return HTML_ERROR_MARKERS.some((marker) =>
    trimmed.toLowerCase().includes(marker.toLowerCase()),
  )
}

const getErrorDetail = (error) =>
  error?.response?.data?.detail ||
  error?.response?.data?.message ||
  error?.response?.data?.error ||
  error?.data?.detail ||
  error?.data?.message ||
  error?.data?.error ||
  error?.message ||
  error?.error ||
  ""

const buildApiError = (error, fallbackMessage) => {
  const status = error?.response?.status ?? error?.status ?? null
  const detail = getErrorDetail(error)
  const message =
    typeof detail === "string" && detail.trim() && !isHtmlLikeError(detail)
      ? detail.trim()
      : fallbackMessage

  return {
    success: false,
    status,
    message,
    error: message,
    data: error?.response?.data ?? error?.data ?? null,
  }
}

export const getChatbotContext = async () => {
  try {
    const response = await axiosInstance.get("/admin/chatbot/context")
    return {
      success: true,
      context: response.data,
    }
  } catch (error) {
    throw buildApiError(error, "Failed to load AI Race Assistant context")
  }
}

export const sendChatbotQuery = async (payload) => {
  try {
    const response = await axiosInstance.post("/admin/chatbot/query", payload)
    return {
      success: true,
      response: response.data,
    }
  } catch (error) {
    throw buildApiError(error, "Failed to query the AI Race Assistant")
  }
}
