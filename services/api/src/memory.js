const SUMMARY_MAX_LENGTH = 220
const FACT_MAX_ITEMS = 10

function pickLatestMessages(messages, limit = 6) {
  return messages.slice(-limit)
}

export function updateMemoryFromConversation(memory, messages) {
  const latest = pickLatestMessages(messages)
  const summary = latest
    .map((item) => `${item.role === 'user' ? '用户' : '角色'}:${item.content}`)
    .join(' | ')
    .slice(0, SUMMARY_MAX_LENGTH)

  const factsSet = new Set(memory.facts ?? [])
  for (const message of latest) {
    if (message.role !== 'user') continue
    const cleaned = message.content.trim()
    if (!cleaned) continue
    if (cleaned.includes('我叫') || cleaned.includes('我喜欢') || cleaned.includes('我是')) {
      factsSet.add(cleaned.slice(0, 40))
    }
  }

  return {
    summary,
    facts: Array.from(factsSet).slice(-FACT_MAX_ITEMS),
  }
}

export function buildMemoryPrompt(memory) {
  if (!memory.summary && (!memory.facts || memory.facts.length === 0)) {
    return ''
  }

  const factsText =
    memory.facts && memory.facts.length
      ? memory.facts.map((item, index) => `${index + 1}. ${item}`).join('\n')
      : '暂无'

  return `长期记忆摘要:\n${memory.summary || '暂无'}\n\n关键事实:\n${factsText}`
}
