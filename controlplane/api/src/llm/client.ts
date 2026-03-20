import { env } from '../config/env.js'

export type LlmProvider = 'gemini'

interface LlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface LlmRequest {
  messages: LlmMessage[]
  temperature?: number
  maxTokens?: number
  responseMimeType?: 'text/plain' | 'application/json'
}

interface LlmResponse {
  content: string | null
  provider: LlmProvider
  finishReason?: string
}

interface GeminiErrorPayload {
  error?: {
    code?: number
    message?: string
    status?: string
    details?: Array<{
      '@type'?: string
      retryDelay?: string
    }>
  }
}

function normalizeGeminiModelName(rawModel: string) {
  const trimmed = rawModel.trim()
  const withoutPrefix = trimmed.replace(/^models\//i, '')

  if (!withoutPrefix || /^gemini$/i.test(withoutPrefix)) {
    return 'gemini-2.5-flash-lite'
  }

  if (/^gemini-pro$/i.test(withoutPrefix)) {
    return 'gemini-2.5-pro'
  }

  if (/^gemini-flash$/i.test(withoutPrefix)) {
    return 'gemini-2.5-flash-lite'
  }

  if (
    /^gemini-1\.5-flash$/i.test(withoutPrefix) ||
    /^gemini-2\.0-flash$/i.test(withoutPrefix) ||
    /^gemini-2\.5-flash$/i.test(withoutPrefix)
  ) {
    return 'gemini-2.5-flash-lite'
  }

  return withoutPrefix
}

export function resolveProvider(): LlmProvider {
  void env.llmProvider
  return 'gemini'
}

function collectSystemInstruction(messages: LlmMessage[]) {
  return messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join('\n\n')
}

function toGeminiContents(messages: LlmMessage[]) {
  return messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    }))
}

function simplifyGeminiError(status: number, modelName: string, payloadText: string) {
  let parsed: GeminiErrorPayload | null = null

  try {
    parsed = JSON.parse(payloadText) as GeminiErrorPayload
  } catch {
    parsed = null
  }

  const message = parsed?.error?.message?.trim()
  const retryDelay = parsed?.error?.details?.find((detail) => detail['@type']?.includes('RetryInfo'))?.retryDelay

  if (status === 429) {
    const retryHint = retryDelay ? ` Retry after ${retryDelay}.` : ''
    return `Gemini quota exhausted for model ${modelName}. Billing or quota is unavailable for this project.${retryHint}`
  }

  if (status === 404) {
    return `Gemini model ${modelName} was not found for generateContent.`
  }

  return `Gemini API returned HTTP ${status}${message ? `: ${message}` : ''}`
}

async function callGemini(input: LlmRequest): Promise<LlmResponse> {
  const systemInstruction = collectSystemInstruction(input.messages)
  const contents = toGeminiContents(input.messages)
  const modelName = normalizeGeminiModelName(env.llmModel)

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(env.llmApiKey)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
        contents,
        generationConfig: {
          temperature: input.temperature ?? 0.2,
          maxOutputTokens: input.maxTokens ?? 1000,
          responseMimeType: input.responseMimeType ?? 'text/plain',
        },
      }),
    },
  )

  if (!response.ok) {
    const detail = (await response.text()).trim()
    throw new Error(simplifyGeminiError(response.status, modelName, detail))
  }

  const data = (await response.json()) as {
    promptFeedback?: {
      blockReason?: string
    }
    candidates?: Array<{
      finishReason?: string
      content?: {
        parts?: Array<{ text?: string }>
      }
    }>
  }

  const firstCandidate = data.candidates?.[0]
  const finishReason = firstCandidate?.finishReason
  const content =
    firstCandidate?.content?.parts
      ?.map((part) => part.text || '')
      .join('')
      .trim() || null

  if (!content) {
    const blockReason = data.promptFeedback?.blockReason
    const reason = blockReason || finishReason || 'EMPTY_RESPONSE'
    throw new Error(`Gemini returned no usable content (${reason}).`)
  }

  return {
    content,
    provider: 'gemini',
    finishReason,
  }
}

export async function callConfiguredLlm(input: LlmRequest): Promise<LlmResponse | null> {
  if (!env.llmApiKey) {
    return null
  }

  return callGemini(input)
}
