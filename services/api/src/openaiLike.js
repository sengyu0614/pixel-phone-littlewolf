const DEFAULT_TIMEOUT = 35000

function normalizeBaseUrl(baseUrl) {
  const value = (baseUrl || '').trim()
  if (!value) {
    throw new Error('请先配置 Base URL')
  }
  return value.endsWith('/') ? value.slice(0, -1) : value
}

function normalizeProviderError(status, message) {
  if (status === 400) return { code: 'invalid_request', message }
  if (status === 401) return { code: 'auth_failed', message: message || 'API Key 无效' }
  if (status === 403) return { code: 'forbidden', message }
  if (status === 429) return { code: 'rate_limited', message: message || '请求过于频繁' }
  if (status === 503) return { code: 'provider_unavailable', message }
  return { code: 'api_request_failed', message: message || `请求失败（HTTP ${status}）` }
}

export async function callOpenAiLikeChatCompletion(config, messages) {
  const baseUrl = normalizeBaseUrl(config.baseUrl)
  if (!config.model?.trim()) {
    throw new Error('请先配置 Model')
  }
  if (!config.apiKey?.trim()) {
    throw new Error('请先配置 API Key')
  }

  const endpoint = `${baseUrl}/chat/completions`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT)

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey.trim()}`,
        ...(config.headers || {}),
      },
      body: JSON.stringify({
        model: config.model.trim(),
        temperature: 0.75,
        messages,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      let message = ''
      try {
        const errorPayload = await response.json()
        message = errorPayload?.error?.message || errorPayload?.message || ''
      } catch {
        message = await response.text()
      }
      const normalized = normalizeProviderError(response.status, message?.trim())
      const error = new Error(normalized.message)
      error.code = normalized.code
      error.status = response.status
      throw error
    }

    const data = await response.json()
    const text = data?.choices?.[0]?.message?.content
    if (!text || typeof text !== 'string') {
      throw new Error('AI 返回为空或格式不支持')
    }
    return text
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error('请求超时，请稍后重试')
      timeoutError.code = 'timeout'
      timeoutError.status = 408
      throw timeoutError
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}
