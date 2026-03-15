import { useMemo, useState } from 'react'
import { PixelButton, PixelInput } from '../components/ui'
import type { AppRuntimeProps } from '../simulator/types'

type MomentVisibility = '全部' | '好友' | 'NPC'

type MomentPost = {
  id: string
  content: string
  visibility: MomentVisibility
  createdAt: string
}

type DiaryEntry = {
  id: string
  title: string
  content: string
  mood: string
  createdAt: string
}

type WalletAction = '充值' | '提现' | '转账' | '消费'

type WalletRecord = {
  id: string
  action: WalletAction
  amount: number
  note: string
  createdAt: string
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
}

function formatTime(isoText: string) {
  const date = new Date(isoText)
  if (Number.isNaN(date.getTime())) return isoText
  return date.toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function readJson<T>(storageKey: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson<T>(storageKey: string, value: T) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(storageKey, JSON.stringify(value))
}

const MOMENTS_STORAGE_KEY = 'pixel-extra-moments-v1'
const DIARY_STORAGE_KEY = 'pixel-extra-diary-v1'
const WALLET_STORAGE_KEY = 'pixel-extra-wallet-v1'

export function MomentsApp({ onExit }: AppRuntimeProps) {
  const [draftText, setDraftText] = useState('')
  const [visibility, setVisibility] = useState<MomentVisibility>('全部')
  const [filter, setFilter] = useState<MomentVisibility>('全部')
  const [posts, setPosts] = useState<MomentPost[]>(() => readJson<MomentPost[]>(MOMENTS_STORAGE_KEY, []))

  const filteredPosts = useMemo(() => {
    if (filter === '全部') return posts
    return posts.filter((item) => item.visibility === filter)
  }, [posts, filter])

  const publishPost = () => {
    const content = draftText.trim()
    if (!content) return
    const next: MomentPost = {
      id: createId('moment'),
      content,
      visibility,
      createdAt: new Date().toISOString(),
    }
    setPosts((prev) => {
      const updated = [next, ...prev]
      writeJson(MOMENTS_STORAGE_KEY, updated)
      return updated
    })
    setDraftText('')
  }

  const createAutoPost = () => {
    const seeds = [
      '今天剧情推进 +1，和 TA 的好感度又提高了。',
      '新的一天也要继续写设定，世界书更新完毕。',
      '刚刚一起听歌，氛围感直接拉满。',
      '正在存档：今天的互动比昨天更甜一点。',
    ]
    const randomContent = seeds[Math.floor(Math.random() * seeds.length)] || seeds[0]
    const next: MomentPost = {
      id: createId('moment'),
      content: randomContent,
      visibility: '好友',
      createdAt: new Date().toISOString(),
    }
    setPosts((prev) => {
      const updated = [next, ...prev]
      writeJson(MOMENTS_STORAGE_KEY, updated)
      return updated
    })
  }

  const removePost = (postId: string) => {
    setPosts((prev) => {
      const updated = prev.filter((item) => item.id !== postId)
      writeJson(MOMENTS_STORAGE_KEY, updated)
      return updated
    })
  }

  return (
    <div className="editor-panel">
      <div className="worldbook-editor">
        <div className="chat-toolbar">
          <h4>朋友圈</h4>
          <PixelButton size="sm" className="ml-auto" onClick={onExit}>
            返回
          </PixelButton>
        </div>
        <PixelInput
          as="textarea"
          rows={3}
          placeholder="分享今天的动态..."
          value={draftText}
          onChange={(event) => setDraftText(event.target.value)}
        />
        <label className="text-pixel-text-muted">可见范围</label>
        <select
          className="pixel-select"
          value={visibility}
          onChange={(event) => setVisibility(event.target.value as MomentVisibility)}
        >
          <option value="全部">全部</option>
          <option value="好友">好友</option>
          <option value="NPC">NPC</option>
        </select>
        <div className="chat-toolbar">
          <PixelButton size="sm" onClick={publishPost} disabled={!draftText.trim()}>
            发布动态
          </PixelButton>
          <PixelButton size="sm" variant="ghost" onClick={createAutoPost}>
            角色自动发朋友圈
          </PixelButton>
        </div>
      </div>

      <div className="worldbook-editor">
        <div className="chat-toolbar">
          <h4>动态列表（{posts.length}）</h4>
          <select
            className="pixel-select ml-auto"
            value={filter}
            onChange={(event) => setFilter(event.target.value as MomentVisibility)}
          >
            <option value="全部">全部</option>
            <option value="好友">好友</option>
            <option value="NPC">NPC</option>
          </select>
        </div>
        {filteredPosts.length === 0 ? <p className="text-pixel-text-muted">暂无动态</p> : null}
        <div className="worldbook-list">
          {filteredPosts.map((post) => (
            <article key={post.id} className="worldbook-item">
              <div className="worldbook-item-head">
                <strong>{post.visibility}</strong>
                <small className="text-pixel-text-muted">{formatTime(post.createdAt)}</small>
              </div>
              <p>{post.content}</p>
              <div className="chat-toolbar">
                <PixelButton size="sm" variant="danger" onClick={() => removePost(post.id)}>
                  删除
                </PixelButton>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}

export function DiaryApp({ onExit }: AppRuntimeProps) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [mood, setMood] = useState('开心')
  const [entries, setEntries] = useState<DiaryEntry[]>(() => readJson<DiaryEntry[]>(DIARY_STORAGE_KEY, []))

  const saveDiary = () => {
    const normalizedTitle = title.trim() || '未命名日记'
    const normalizedContent = content.trim()
    if (!normalizedContent) return
    const next: DiaryEntry = {
      id: createId('diary'),
      title: normalizedTitle,
      content: normalizedContent,
      mood,
      createdAt: new Date().toISOString(),
    }
    setEntries((prev) => {
      const updated = [next, ...prev]
      writeJson(DIARY_STORAGE_KEY, updated)
      return updated
    })
    setTitle('')
    setContent('')
  }

  const deleteDiary = (id: string) => {
    setEntries((prev) => {
      const updated = prev.filter((item) => item.id !== id)
      writeJson(DIARY_STORAGE_KEY, updated)
      return updated
    })
  }

  return (
    <div className="editor-panel">
      <div className="worldbook-editor">
        <div className="chat-toolbar">
          <h4>写日记</h4>
          <PixelButton size="sm" className="ml-auto" onClick={onExit}>
            返回
          </PixelButton>
        </div>
        <PixelInput
          placeholder="标题（可选）"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <label className="text-pixel-text-muted">今日心情</label>
        <select className="pixel-select" value={mood} onChange={(event) => setMood(event.target.value)}>
          <option value="开心">开心</option>
          <option value="平静">平静</option>
          <option value="紧张">紧张</option>
          <option value="低落">低落</option>
        </select>
        <PixelInput
          as="textarea"
          rows={6}
          placeholder="记录今天发生的事..."
          value={content}
          onChange={(event) => setContent(event.target.value)}
        />
        <div className="chat-toolbar">
          <PixelButton size="sm" onClick={saveDiary} disabled={!content.trim()}>
            完成
          </PixelButton>
          <small className="text-pixel-text-muted ml-auto">{content.length} 字</small>
        </div>
      </div>

      <div className="worldbook-editor">
        <h4>我的日记（{entries.length}）</h4>
        {entries.length === 0 ? <p className="text-pixel-text-muted">还没有日记内容</p> : null}
        <div className="worldbook-list">
          {entries.map((entry) => (
            <article key={entry.id} className="worldbook-item">
              <div className="worldbook-item-head">
                <strong>{entry.title}</strong>
                <small className="text-pixel-text-muted">
                  {entry.mood} · {formatTime(entry.createdAt)}
                </small>
              </div>
              <p>{entry.content}</p>
              <div className="chat-toolbar">
                <PixelButton size="sm" variant="danger" onClick={() => deleteDiary(entry.id)}>
                  删除
                </PixelButton>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}

function getWalletDelta(action: WalletAction, amount: number) {
  if (action === '充值') return amount
  return -amount
}

export function WalletApp({ onExit }: AppRuntimeProps) {
  const [action, setAction] = useState<WalletAction>('充值')
  const [amountText, setAmountText] = useState('0')
  const [note, setNote] = useState('')
  const [records, setRecords] = useState<WalletRecord[]>(() => readJson<WalletRecord[]>(WALLET_STORAGE_KEY, []))

  const balance = useMemo(
    () => records.reduce((sum, item) => sum + getWalletDelta(item.action, item.amount), 0),
    [records],
  )

  const createRecord = () => {
    const amount = Number(amountText)
    if (!Number.isFinite(amount) || amount <= 0) return
    const next: WalletRecord = {
      id: createId('wallet'),
      action,
      amount,
      note: note.trim(),
      createdAt: new Date().toISOString(),
    }
    setRecords((prev) => {
      const updated = [next, ...prev]
      writeJson(WALLET_STORAGE_KEY, updated)
      return updated
    })
    setAmountText('0')
    setNote('')
  }

  const clearRecords = () => {
    setRecords([])
    writeJson(WALLET_STORAGE_KEY, [])
  }

  return (
    <div className="editor-panel">
      <div className="worldbook-editor">
        <div className="chat-toolbar">
          <h4>钱包</h4>
          <PixelButton size="sm" className="ml-auto" onClick={onExit}>
            返回
          </PixelButton>
        </div>
        <p className="text-pixel-text-muted">我的余额</p>
        <h4>￥ {balance.toFixed(2)}</h4>
        <label className="text-pixel-text-muted">账单类型</label>
        <select
          className="pixel-select"
          value={action}
          onChange={(event) => setAction(event.target.value as WalletAction)}
        >
          <option value="充值">充值</option>
          <option value="提现">提现</option>
          <option value="转账">转账</option>
          <option value="消费">消费</option>
        </select>
        <label className="text-pixel-text-muted">金额（元）</label>
        <PixelInput
          type="number"
          min={0}
          step={0.01}
          value={amountText}
          onChange={(event) => setAmountText(event.target.value)}
        />
        <PixelInput
          placeholder="备注（可选）"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        <div className="chat-toolbar">
          <PixelButton size="sm" onClick={createRecord}>
            记一笔
          </PixelButton>
          <PixelButton size="sm" variant="danger" onClick={clearRecords}>
            清空账单
          </PixelButton>
        </div>
      </div>

      <div className="worldbook-editor">
        <h4>消费明细（{records.length}）</h4>
        {records.length === 0 ? <p className="text-pixel-text-muted">暂无账单记录</p> : null}
        <div className="worldbook-list">
          {records.map((record) => {
            const delta = getWalletDelta(record.action, record.amount)
            return (
              <article key={record.id} className="worldbook-item">
                <div className="worldbook-item-head">
                  <strong>{record.action}</strong>
                  <small className="text-pixel-text-muted">{formatTime(record.createdAt)}</small>
                </div>
                <p>{record.note || '无备注'}</p>
                <small className="text-pixel-text-muted">
                  {delta >= 0 ? '+' : '-'}￥ {Math.abs(delta).toFixed(2)}
                </small>
              </article>
            )
          })}
        </div>
      </div>
    </div>
  )
}
