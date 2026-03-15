import { type ChangeEvent, useEffect, useRef, useState } from 'react'
import { useSimulatorStore } from './store/simulatorStore'

type LauncherProps = {
  modernHome?: boolean
}

type HomeProfile = {
  avatar: string
  name: string
  signature: string
  location: string
}

type HomeWidget = {
  headerText: string
  text1: string
  text2: string
  image1: string
  image2: string
}

type HomeStorage = {
  profile?: Partial<HomeProfile>
  widget?: Partial<HomeWidget>
}

type EditableProfileKey = keyof Pick<HomeProfile, 'name' | 'signature' | 'location'>
type EditableWidgetTextKey = keyof Pick<HomeWidget, 'headerText' | 'text1' | 'text2'>
type EditableImageTarget = 'avatar' | 'image1' | 'image2' | null

const HOME_STORAGE_KEY = 'pixel-home-page-v1'

const defaultProfile: HomeProfile = {
  avatar: '可',
  name: '可点击编辑',
  signature: '可点击编辑',
  location: '可点击编辑',
}

const defaultWidget: HomeWidget = {
  headerText: '(:::[♡]:::)..?',
  text1: 'have a nice day',
  text2: '.o. HAPPY EVERYDAY',
  image1: '',
  image2: '',
}

const homeShortcuts = [
  { id: 'wechat', label: '微信', glyph: '微', appId: 'role-messages' },
  { id: 'settings', label: '设置', glyph: '设', appId: 'role-settings' },
  { id: 'worldbook', label: '世界书', glyph: '书', appId: 'role-worldbook' },
  { id: 'theme', label: '主题', glyph: '题', appId: null },
] as const

function mergeProfile(input?: Partial<HomeProfile>): HomeProfile {
  return {
    avatar: input?.avatar || defaultProfile.avatar,
    name: input?.name || defaultProfile.name,
    signature: input?.signature || defaultProfile.signature,
    location: input?.location || defaultProfile.location,
  }
}

function mergeWidget(input?: Partial<HomeWidget>): HomeWidget {
  return {
    headerText: input?.headerText || defaultWidget.headerText,
    text1: input?.text1 || defaultWidget.text1,
    text2: input?.text2 || defaultWidget.text2,
    image1: input?.image1 || defaultWidget.image1,
    image2: input?.image2 || defaultWidget.image2,
  }
}

function loadStoredHomeData() {
  if (typeof window === 'undefined') {
    return { profile: defaultProfile, widget: defaultWidget }
  }
  try {
    const raw = window.localStorage.getItem(HOME_STORAGE_KEY)
    if (!raw) {
      return { profile: defaultProfile, widget: defaultWidget }
    }
    const parsed = JSON.parse(raw) as HomeStorage
    return {
      profile: mergeProfile(parsed.profile),
      widget: mergeWidget(parsed.widget),
    }
  } catch {
    return { profile: defaultProfile, widget: defaultWidget }
  }
}

export function Launcher({ modernHome = false }: LauncherProps) {
  const openApp = useSimulatorStore((state) => state.openApp)
  const openedAppIds = useSimulatorStore((state) => state.openedAppIds)
  const [profile, setProfile] = useState<HomeProfile>(() => loadStoredHomeData().profile)
  const [widget, setWidget] = useState<HomeWidget>(() => loadStoredHomeData().widget)
  const [pendingImageTarget, setPendingImageTarget] = useState<EditableImageTarget>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const payload: HomeStorage = { profile, widget }
    window.localStorage.setItem(HOME_STORAGE_KEY, JSON.stringify(payload))
  }, [profile, widget])

  function editProfileText(key: EditableProfileKey, label: string) {
    const nextValue = window.prompt(`编辑${label}`, profile[key])
    if (nextValue === null) return
    const trimmed = nextValue.trim()
    setProfile((prev) => ({ ...prev, [key]: trimmed || defaultProfile[key] }))
  }

  function editWidgetText(key: EditableWidgetTextKey, label: string) {
    const nextValue = window.prompt(`编辑${label}`, widget[key])
    if (nextValue === null) return
    const trimmed = nextValue.trim()
    setWidget((prev) => ({ ...prev, [key]: trimmed || defaultWidget[key] }))
  }

  function requestImageEdit(target: Exclude<EditableImageTarget, null>) {
    setPendingImageTarget(target)
    imageInputRef.current?.click()
  }

  function handleImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file || !pendingImageTarget) {
      event.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = (readerEvent) => {
      const result = String(readerEvent.target?.result || '')
      if (!result) return
      if (pendingImageTarget === 'avatar') {
        setProfile((prev) => ({ ...prev, avatar: result }))
      } else if (pendingImageTarget === 'image1') {
        setWidget((prev) => ({ ...prev, image1: result }))
      } else {
        setWidget((prev) => ({ ...prev, image2: result }))
      }
      setPendingImageTarget(null)
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  function openHomeShortcut(appId: string | null, label: string) {
    if (!appId) {
      window.alert(`${label}正在开发中`)
      return
    }
    openApp(appId)
  }

  function renderImageOrFallback(src: string, fallbackText: string) {
    if (src) {
      return <img src={src} alt={fallbackText} className="pixel-home-inline-image" />
    }
    return <span className="pixel-home-inline-image-fallback">{fallbackText}</span>
  }

  return (
    <section className={`pixel-home-page ${modernHome ? 'pixel-home-page-modern' : ''}`}>
      <input
        ref={imageInputRef}
        className="pixel-home-upload-input"
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
      />

      <div className="pixel-home-profile-card">
        <button
          type="button"
          className="pixel-home-avatar-btn"
          onClick={() => requestImageEdit('avatar')}
          aria-label="编辑头像"
        >
          {profile.avatar.startsWith('data:image') ? (
            <img src={profile.avatar} alt={profile.name} className="pixel-home-avatar-image" />
          ) : (
            <span className="pixel-home-avatar-text">{profile.avatar}</span>
          )}
        </button>
        <div className="pixel-home-profile-info">
          <button type="button" className="pixel-home-edit-btn" onClick={() => editProfileText('name', '名称')}>
            {profile.name}
          </button>
          <button
            type="button"
            className="pixel-home-edit-btn"
            onClick={() => editProfileText('signature', '签名')}
          >
            {profile.signature}
          </button>
          <button
            type="button"
            className="pixel-home-edit-btn pixel-home-location-btn"
            onClick={() => editProfileText('location', '位置')}
          >
            <span className="pixel-home-location-icon" aria-hidden="true">
              ▣
            </span>
            <span>{profile.location}</span>
          </button>
        </div>
      </div>

      <div className="pixel-home-widget-card">
        <button
          type="button"
          className="pixel-home-widget-header"
          onClick={() => editWidgetText('headerText', '组件标题')}
        >
          {widget.headerText}
        </button>
        <div className="pixel-home-widget-bubble">
          <button type="button" className="pixel-home-image-btn" onClick={() => requestImageEdit('image1')}>
            {renderImageOrFallback(widget.image1, '图1')}
          </button>
          <button type="button" className="pixel-home-edit-btn" onClick={() => editWidgetText('text1', '第一段文案')}>
            {widget.text1}
          </button>
        </div>
        <div className="pixel-home-widget-bubble pixel-home-widget-bubble-reverse">
          <button type="button" className="pixel-home-edit-btn" onClick={() => editWidgetText('text2', '第二段文案')}>
            {widget.text2}
          </button>
          <button type="button" className="pixel-home-image-btn" onClick={() => requestImageEdit('image2')}>
            {renderImageOrFallback(widget.image2, '图2')}
          </button>
        </div>
      </div>

      <div className="pixel-home-app-grid">
        {homeShortcuts.map((shortcut) => {
          const isOpened = shortcut.appId ? openedAppIds.includes(shortcut.appId) : false
          return (
            <button
              key={shortcut.id}
              type="button"
              className={`pixel-home-app-btn ${shortcut.appId ? '' : 'is-placeholder'}`}
              onClick={() => openHomeShortcut(shortcut.appId, shortcut.label)}
              aria-label={`打开${shortcut.label}`}
            >
              <span className="pixel-home-app-icon" aria-hidden="true">
                {shortcut.glyph}
              </span>
              <span className="pixel-home-app-label">{shortcut.label}</span>
              <span className="pixel-home-app-meta">
                {shortcut.appId ? (isOpened ? '已打开' : '可打开') : '开发中'}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
