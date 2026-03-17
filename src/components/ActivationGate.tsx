import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { activateLicense, fetchLicenseStatus } from '../api/unifiedClient'
import { PixelButton, PixelInput, PixelWindow } from './ui'

const DEVICE_ID_KEY = 'pixel-license-device-id'

function getOrCreateDeviceId() {
  const current = window.localStorage.getItem(DEVICE_ID_KEY)
  if (current) {
    return current
  }
  const generated =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `device-${Date.now()}`
  window.localStorage.setItem(DEVICE_ID_KEY, generated)
  return generated
}

type ActivationGateProps = {
  children: ReactNode
}

export function ActivationGate({ children }: ActivationGateProps) {
  const [loading, setLoading] = useState(true)
  const [activated, setActivated] = useState(false)
  const [code, setCode] = useState('')
  const [nickname, setNickname] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorText, setErrorText] = useState('')
  const [successText, setSuccessText] = useState('')
  const [savedNickname, setSavedNickname] = useState('')
  const deviceId = useMemo(() => (loading ? '' : getOrCreateDeviceId()), [loading])

  useEffect(() => {
    async function bootstrapLicense() {
      setLoading(true)
      setErrorText('')
      try {
        const status = await fetchLicenseStatus()
        setActivated(Boolean(status.activated))
        setSavedNickname(status.nickname || '')
      } catch (error) {
        setErrorText(error instanceof Error ? error.message : '校验激活状态失败')
      } finally {
        setLoading(false)
      }
    }
    void bootstrapLicense()
  }, [])

  async function submitActivation() {
    const nextCode = code.trim()
    if (!nextCode) {
      setErrorText('请输入激活码')
      return
    }
    setSubmitting(true)
    setErrorText('')
    setSuccessText('')
    try {
      const result = await activateLicense({
        code: nextCode,
        deviceId: getOrCreateDeviceId(),
        nickname: nickname.trim(),
      })
      if (!result.activated) {
        setErrorText('激活失败，请重试')
        return
      }
      setActivated(true)
      setSavedNickname(result.nickname || nickname.trim())
      setSuccessText('激活成功，正在进入...')
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : '激活失败，请稍后再试')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <main className="simulator-page">
        <PixelWindow title="AI ASSISTANT" subtitle="正在检查授权">
          <p className="text-pixel-text-muted">请稍候，正在连接服务...</p>
        </PixelWindow>
      </main>
    )
  }

  if (activated) {
    return (
      <>
        <div className="license-badge" title="授权状态">
          已激活{savedNickname ? ` ${savedNickname}` : ''}
        </div>
        {children}
      </>
    )
  }

  return (
    <main className="simulator-page">
      <div className="activation-layout">
        <PixelWindow title="欢迎使用" subtitle="初次使用请验证激活码">
          <div className="activation-body">
            <label className="text-pixel-text-muted">激活码</label>
            <PixelInput
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="输入激活码"
              autoFocus
            />
            <label className="text-pixel-text-muted">昵称（可选）</label>
            <PixelInput
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="例如：小狼"
            />
            <p className="text-pixel-text-muted activation-tip">
              温馨提示：不分大小写
            </p>
            {deviceId ? (
              <p className="text-pixel-text-muted activation-device">设备 ID: {deviceId.slice(0, 12)}...</p>
            ) : null}
            {errorText ? <p className="form-error">{errorText}</p> : null}
            {successText ? <p className="form-success">{successText}</p> : null}
            <div className="chat-toolbar">
              <PixelButton onClick={() => void submitActivation()} disabled={submitting}>
                {submitting ? '激活中...' : '激活并进入'}
              </PixelButton>
            </div>
          </div>
        </PixelWindow>
      </div>
    </main>
  )
}
