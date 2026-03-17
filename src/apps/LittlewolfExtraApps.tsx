import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import {
  fetchMusicState,
  removeMusicTrack,
  renameMusicTrack,
  setNowPlayingTrack as setMusicNowPlayingTrack,
  uploadMusicLyricsFile,
  uploadMusicSongFile,
} from '../api/unifiedClient'
import type { MusicLyricsFile, MusicRecentPlay, MusicSongFile, MusicTrack } from '../api/types'
import { PixelButton, PixelWindow } from '../components/ui'
import type { AppRuntimeProps } from '../simulator/types'

type PlaceholderSection = {
  title: string
  items: string[]
}

type PlaceholderAppProps = AppRuntimeProps & {
  title: string
  subtitle: string
  sections: PlaceholderSection[]
}

function PlaceholderApp({ onExit, title, subtitle, sections }: PlaceholderAppProps) {
  return (
    <PixelWindow title={title} subtitle={subtitle} actions={<PixelButton onClick={onExit}>返回</PixelButton>}>
      <div className="worldbook-editor">
        {sections.map((section) => (
          <section key={section.title} className="worldbook-item">
            <div className="worldbook-item-head">
              <strong>{section.title}</strong>
            </div>
            <div className="chat-toolbar">
              {section.items.map((item) => (
                <PixelButton key={item} size="sm" variant="ghost">
                  {item}
                </PixelButton>
              ))}
            </div>
          </section>
        ))}
      </div>
    </PixelWindow>
  )
}

function formatPlayTimeLabel(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '--:--'
  return date.toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function RoleForumApp(props: AppRuntimeProps) {
  return (
    <PlaceholderApp
      {...props}
      title="同人论坛"
      subtitle="推荐 / 关注 / 私信"
      sections={[
        { title: '内容广场', items: ['推荐', '八卦', '当前趋势', '热搜详情'] },
        { title: '创作入口', items: ['发帖', '发布作品', '草稿箱'] },
        { title: '角色互动', items: ['角色主页', '私信', '关注'] },
      ]}
    />
  )
}

export function RoleGameCenterApp(props: AppRuntimeProps) {
  return (
    <PlaceholderApp
      {...props}
      title="游戏中心"
      subtitle="你演我猜 / 谁是卧底 / 海龟汤"
      sections={[
        { title: '小游戏', items: ['你演我猜', '谁是卧底', '海龟汤', '真心话大冒险'] },
        { title: '对战房间', items: ['创建房间', '快速匹配', '邀请好友'] },
        { title: '语音模式', items: ['语音房', '视频房', '战绩回顾'] },
      ]}
    />
  )
}

export function RoleMomentsApp(props: AppRuntimeProps) {
  return (
    <PlaceholderApp
      {...props}
      title="朋友圈"
      subtitle="角色动态 / 自动化"
      sections={[
        { title: '动态管理', items: ['发朋友圈', '评论', '点赞', '删除'] },
        { title: '自动化', items: ['自动评论我的动态', '角色自动发朋友圈', '角色间自动互动'] },
        { title: '分组与筛选', items: ['好友分组', '角色筛选', '只看某分组'] },
      ]}
    />
  )
}

export function RoleMusicApp(props: AppRuntimeProps) {
  const [showAddSongPanel, setShowAddSongPanel] = useState(false)
  const [showPlaylistPanel, setShowPlaylistPanel] = useState(false)
  const [showRecentPanel, setShowRecentPanel] = useState(false)
  const [nowPlayingTrackId, setNowPlayingTrackId] = useState('')
  const [pausedTrackId, setPausedTrackId] = useState('')
  const [playlist, setPlaylist] = useState<MusicTrack[]>([])
  const [uploadedSongs, setUploadedSongs] = useState<MusicSongFile[]>([])
  const [uploadedLyrics, setUploadedLyrics] = useState<MusicLyricsFile[]>([])
  const [recentPlayed, setRecentPlayed] = useState<MusicRecentPlay[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [loopEnabled, setLoopEnabled] = useState(false)
  const [shuffleEnabled, setShuffleEnabled] = useState(false)
  const [singleLoopEnabled, setSingleLoopEnabled] = useState(false)
  const [sleepMinutes, setSleepMinutes] = useState(0)
  const [errorText, setErrorText] = useState('')
  const [successText, setSuccessText] = useState('')
  const songUploadRef = useRef<HTMLInputElement | null>(null)
  const lyricsUploadRef = useRef<HTMLInputElement | null>(null)
  const addSongEntryRef = useRef<HTMLDivElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const sleepTimerRef = useRef<number | null>(null)

  async function refreshMusic() {
    setLoading(true)
    setErrorText('')
    try {
      const result = await fetchMusicState()
      setNowPlayingTrackId(result.nowPlayingTrackId || '')
      if (result.nowPlayingTrackId) {
        setPausedTrackId('')
      }
      setPlaylist(Array.isArray(result.playlist) ? result.playlist : [])
      setUploadedSongs(Array.isArray(result.uploadedSongs) ? result.uploadedSongs : [])
      setUploadedLyrics(Array.isArray(result.uploadedLyrics) ? result.uploadedLyrics : [])
      setRecentPlayed(Array.isArray(result.recentPlayed) ? result.recentPlayed : [])
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : '加载音乐数据失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refreshMusic()
  }, [])

  useEffect(() => {
    if (!showAddSongPanel) return

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (addSongEntryRef.current?.contains(target)) return
      setShowAddSongPanel(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [showAddSongPanel])

  useEffect(() => {
    return () => {
      if (sleepTimerRef.current) {
        window.clearTimeout(sleepTimerRef.current)
        sleepTimerRef.current = null
      }
      if (audioRef.current) {
        audioRef.current.pause()
      }
    }
  }, [])

  useEffect(() => {
    if (sleepTimerRef.current) {
      window.clearTimeout(sleepTimerRef.current)
      sleepTimerRef.current = null
    }
    if (!sleepMinutes || !nowPlayingTrackId) return
    sleepTimerRef.current = window.setTimeout(() => {
      const currentTrackId = nowPlayingTrackId
      if (audioRef.current) {
        audioRef.current.pause()
      }
      void setMusicNowPlayingTrack('')
      setNowPlayingTrackId('')
      setPausedTrackId(currentTrackId)
      setSuccessText(`已定时暂停（${sleepMinutes} 分钟）`)
      sleepTimerRef.current = null
    }, sleepMinutes * 60 * 1000)
    return () => {
      if (sleepTimerRef.current) {
        window.clearTimeout(sleepTimerRef.current)
        sleepTimerRef.current = null
      }
    }
  }, [sleepMinutes, nowPlayingTrackId])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onEnded = () => {
      const current = nowPlayingTrackId
      if (!current) return
      const currentSong = uploadedSongs.find((item) => item.trackId === current)
      if (singleLoopEnabled && currentSong) {
        void handleReplayUploadedSong(currentSong)
        return
      }
      if (shuffleEnabled && uploadedSongs.length > 0) {
        const pool = uploadedSongs.filter((item) => item.trackId !== current)
        const target = (pool.length > 0 ? pool : uploadedSongs)[Math.floor(Math.random() * (pool.length > 0 ? pool.length : uploadedSongs.length))]
        if (target) {
          void handleReplayUploadedSong(target)
          return
        }
      }
      if (loopEnabled && uploadedSongs.length > 0) {
        const currentIndex = uploadedSongs.findIndex((item) => item.trackId === current)
        const fallbackIndex = 0
        const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % uploadedSongs.length : fallbackIndex
        const nextSong = uploadedSongs[nextIndex]
        if (nextSong) {
          void handleReplayUploadedSong(nextSong)
          return
        }
      }
      void setMusicNowPlayingTrack('')
      setNowPlayingTrackId('')
      setPausedTrackId('')
      setSuccessText('播放结束')
    }
    audio.addEventListener('ended', onEnded)
    return () => {
      audio.removeEventListener('ended', onEnded)
    }
  }, [loopEnabled, shuffleEnabled, singleLoopEnabled, nowPlayingTrackId, uploadedSongs])

  async function playSongByTrackId(
    trackId: string,
    fileName: string,
    sourceSongs: MusicSongFile[],
    options?: { resume?: boolean },
  ) {
    const target = sourceSongs.find((item) => item.trackId === trackId)
    if (!target?.dataUrl) {
      setErrorText('歌曲缺少音频数据，请重新上传后再试')
      return false
    }
    const audio = audioRef.current
    if (!audio) {
      setErrorText('播放器初始化失败，请刷新页面后重试')
      return false
    }
    try {
      const shouldResume = Boolean(options?.resume)
      const hasSameSource = audio.src === target.dataUrl
      if (!hasSameSource) {
        audio.src = target.dataUrl
      }
      if (!shouldResume || !hasSameSource) {
        audio.currentTime = 0
      }
      await audio.play()
      setNowPlayingTrackId(trackId)
      setPausedTrackId('')
      setSuccessText(`正在播放：${fileName}`)
      return true
    } catch {
      setErrorText('播放失败，请确认浏览器允许音频播放')
      return false
    }
  }

  async function handlePlayUploadedSong(trackId: string, fileName: string) {
    setBusy(true)
    setErrorText('')
    setSuccessText('')
    try {
      const audio = audioRef.current
      const isCurrentTrackPlaying = nowPlayingTrackId === trackId && Boolean(audio && !audio.paused)
      if (isCurrentTrackPlaying) {
        audio?.pause()
        const pausedResult = await setMusicNowPlayingTrack('')
        setNowPlayingTrackId(pausedResult.music.nowPlayingTrackId || '')
        setPlaylist(Array.isArray(pausedResult.music.playlist) ? pausedResult.music.playlist : [])
        setUploadedSongs(Array.isArray(pausedResult.music.uploadedSongs) ? pausedResult.music.uploadedSongs : [])
        setUploadedLyrics(Array.isArray(pausedResult.music.uploadedLyrics) ? pausedResult.music.uploadedLyrics : [])
        setRecentPlayed(Array.isArray(pausedResult.music.recentPlayed) ? pausedResult.music.recentPlayed : [])
        setPausedTrackId(trackId)
        setSuccessText(`已暂停：${fileName}`)
        return
      }
      const result = await setMusicNowPlayingTrack(trackId)
      const nextNowPlayingTrackId = result.music.nowPlayingTrackId || ''
      const nextPlaylist = Array.isArray(result.music.playlist) ? result.music.playlist : []
      const nextUploadedSongs = Array.isArray(result.music.uploadedSongs) ? result.music.uploadedSongs : []
      const nextUploadedLyrics = Array.isArray(result.music.uploadedLyrics) ? result.music.uploadedLyrics : []
      const nextRecentPlayed = Array.isArray(result.music.recentPlayed) ? result.music.recentPlayed : []
      const shouldResume = pausedTrackId === trackId
      setNowPlayingTrackId(nextNowPlayingTrackId)
      setPlaylist(nextPlaylist)
      setUploadedSongs(nextUploadedSongs)
      setUploadedLyrics(nextUploadedLyrics)
      setRecentPlayed(nextRecentPlayed)
      await playSongByTrackId(trackId, fileName, nextUploadedSongs, { resume: shouldResume })
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : '切换播放失败')
    } finally {
      setBusy(false)
    }
  }

  async function handleReplayUploadedSong(song: MusicSongFile, mode: 'replay' | 'navigate' = 'replay') {
    setBusy(true)
    setErrorText('')
    setSuccessText('')
    try {
      const result = await setMusicNowPlayingTrack(song.trackId)
      const nextNowPlayingTrackId = result.music.nowPlayingTrackId || ''
      const nextPlaylist = Array.isArray(result.music.playlist) ? result.music.playlist : []
      const nextUploadedSongs = Array.isArray(result.music.uploadedSongs) ? result.music.uploadedSongs : []
      const nextUploadedLyrics = Array.isArray(result.music.uploadedLyrics) ? result.music.uploadedLyrics : []
      const nextRecentPlayed = Array.isArray(result.music.recentPlayed) ? result.music.recentPlayed : []
      setNowPlayingTrackId(nextNowPlayingTrackId)
      setPlaylist(nextPlaylist)
      setUploadedSongs(nextUploadedSongs)
      setUploadedLyrics(nextUploadedLyrics)
      setRecentPlayed(nextRecentPlayed)
      await playSongByTrackId(song.trackId, song.fileName, nextUploadedSongs, { resume: false })
      setSuccessText(mode === 'replay' ? `已重播：${song.fileName}` : `正在播放：${song.fileName}`)
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : '重播失败')
    } finally {
      setBusy(false)
    }
  }

  async function handleRenameUploadedSong(song: MusicSongFile) {
    const nextName = window.prompt('改歌名', song.fileName)?.trim() || ''
    if (!nextName || nextName === song.fileName) return
    setBusy(true)
    setErrorText('')
    setSuccessText('')
    try {
      const result = await renameMusicTrack(song.trackId, nextName)
      setNowPlayingTrackId(result.music.nowPlayingTrackId || '')
      setPlaylist(Array.isArray(result.music.playlist) ? result.music.playlist : [])
      setUploadedSongs(Array.isArray(result.music.uploadedSongs) ? result.music.uploadedSongs : [])
      setUploadedLyrics(Array.isArray(result.music.uploadedLyrics) ? result.music.uploadedLyrics : [])
      setRecentPlayed(Array.isArray(result.music.recentPlayed) ? result.music.recentPlayed : [])
      setSuccessText(`已改歌名：${nextName}`)
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : '改歌名失败')
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteUploadedSong(song: MusicSongFile) {
    const confirmed = window.confirm(`确定删除「${song.fileName}」吗？`)
    if (!confirmed) return
    setBusy(true)
    setErrorText('')
    setSuccessText('')
    try {
      const result = await removeMusicTrack(song.trackId)
      setNowPlayingTrackId(result.music.nowPlayingTrackId || '')
      setPlaylist(Array.isArray(result.music.playlist) ? result.music.playlist : [])
      setUploadedSongs(Array.isArray(result.music.uploadedSongs) ? result.music.uploadedSongs : [])
      setUploadedLyrics(Array.isArray(result.music.uploadedLyrics) ? result.music.uploadedLyrics : [])
      setRecentPlayed(Array.isArray(result.music.recentPlayed) ? result.music.recentPlayed : [])
      if (audioRef.current && nowPlayingTrackId === song.trackId) {
        audioRef.current.pause()
        audioRef.current.src = ''
      }
      if (pausedTrackId === song.trackId) {
        setPausedTrackId('')
      }
      setSuccessText(`已删除：${song.fileName}`)
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : '删除歌曲失败')
    } finally {
      setBusy(false)
    }
  }

  async function handlePlayAdjacentSong(direction: 'prev' | 'next') {
    if (uploadedSongs.length === 0) {
      setErrorText('暂无可播放歌曲')
      return
    }
    const currentIndex = uploadedSongs.findIndex((item) => item.trackId === nowPlayingTrackId)
    const baseIndex = currentIndex >= 0 ? currentIndex : 0
    const nextIndex =
      direction === 'prev'
        ? (baseIndex - 1 + uploadedSongs.length) % uploadedSongs.length
        : (baseIndex + 1) % uploadedSongs.length
    const target = uploadedSongs[nextIndex]
    if (!target) return
    await handleReplayUploadedSong(target, 'navigate')
  }

  function getActiveSongForControl() {
    if (uploadedSongs.length === 0) return null
    return uploadedSongs.find((item) => item.trackId === nowPlayingTrackId) || uploadedSongs[0]
  }

  async function handleSongFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true)
    setErrorText('')
    setSuccessText('')
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = () => reject(new Error('读取歌曲文件失败'))
        reader.readAsDataURL(file)
      })
      const result = await uploadMusicSongFile({
        fileName: file.name,
        mimeType: file.type || 'audio/mpeg',
        size: file.size,
        dataUrl,
      })
      setNowPlayingTrackId(result.music.nowPlayingTrackId || '')
      setPlaylist(Array.isArray(result.music.playlist) ? result.music.playlist : [])
      setUploadedSongs(Array.isArray(result.music.uploadedSongs) ? result.music.uploadedSongs : [])
      setUploadedLyrics(Array.isArray(result.music.uploadedLyrics) ? result.music.uploadedLyrics : [])
      setRecentPlayed(Array.isArray(result.music.recentPlayed) ? result.music.recentPlayed : [])
      setSuccessText(`已上传歌曲：${file.name}`)
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : '上传歌曲失败')
    } finally {
      setBusy(false)
    }
  }

  async function handleLyricsFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true)
    setErrorText('')
    setSuccessText('')
    try {
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = () => reject(new Error('读取歌词文件失败'))
        reader.readAsText(file, 'utf-8')
      })
      const result = await uploadMusicLyricsFile({
        fileName: file.name,
        size: file.size,
        content: text,
      })
      setNowPlayingTrackId(result.music.nowPlayingTrackId || '')
      setPlaylist(Array.isArray(result.music.playlist) ? result.music.playlist : [])
      setUploadedSongs(Array.isArray(result.music.uploadedSongs) ? result.music.uploadedSongs : [])
      setUploadedLyrics(Array.isArray(result.music.uploadedLyrics) ? result.music.uploadedLyrics : [])
      setRecentPlayed(Array.isArray(result.music.recentPlayed) ? result.music.recentPlayed : [])
      setSuccessText(`已上传歌词：${file.name}`)
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : '上传歌词失败')
    } finally {
      setBusy(false)
    }
  }

  const recentSongs = [...recentPlayed]
    .sort((a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime())
    .map((item) => {
      const song = uploadedSongs.find((entry) => entry.trackId === item.trackId)
      const track = playlist.find((entry) => entry.id === item.trackId)
      return {
        trackId: item.trackId,
        playedAt: item.playedAt,
        name: song?.fileName || track?.name || '未知歌曲',
      }
    })

  return (
    <PixelWindow title="音乐" subtitle="播放列表 / 一起听" actions={<PixelButton onClick={props.onExit}>返回</PixelButton>}>
      <div className="worldbook-editor">
        <audio ref={audioRef} preload="metadata" />
        <section className="worldbook-item">
          <div className="worldbook-item-head">
            <strong>音乐入口</strong>
          </div>
          <div className="chat-toolbar">
            <div className="music-add-song-entry" ref={addSongEntryRef}>
              <PixelButton size="sm" variant="ghost" onClick={() => setShowAddSongPanel((prev) => !prev)}>
                添加歌曲
              </PixelButton>
              {showAddSongPanel ? (
                <div className="music-add-song-panel">
                  <PixelButton size="sm" variant="ghost" onClick={() => songUploadRef.current?.click()} disabled={busy}>
                    添加歌曲文件
                  </PixelButton>
                  <PixelButton size="sm" variant="ghost" onClick={() => lyricsUploadRef.current?.click()} disabled={busy}>
                    添加歌词文件
                  </PixelButton>
                  <PixelButton size="sm" variant="ghost" onClick={() => setShowAddSongPanel(false)}>
                    完成
                  </PixelButton>
                </div>
              ) : null}
            </div>
            <PixelButton
              size="sm"
              variant="ghost"
              onClick={() => {
                setShowPlaylistPanel((prev) => !prev)
                setShowRecentPanel(false)
              }}
            >
              播放列表
            </PixelButton>
            <PixelButton
              size="sm"
              variant="ghost"
              onClick={() => {
                setShowRecentPanel((prev) => !prev)
                setShowPlaylistPanel(false)
              }}
            >
              最近播放
            </PixelButton>
          </div>
          {showPlaylistPanel ? (
            <div className="music-playlist-panel">
              <div className="worldbook-item-head">
                <strong>已添加歌曲文件</strong>
              </div>
              {loading ? <p>加载中...</p> : null}
              {!loading && uploadedSongs.length === 0 ? <p>暂无已添加歌曲文件</p> : null}
              {!loading && uploadedSongs.length > 0 ? (
                <ul className="music-song-file-list">
                  {uploadedSongs.map((song) => (
                    <li key={song.id}>
                      <PixelButton
                        size="sm"
                        variant="ghost"
                        className="music-song-rename-btn"
                        onClick={() => void handleRenameUploadedSong(song)}
                        disabled={busy}
                      >
                        改歌名
                      </PixelButton>
                      <PixelButton
                        size="sm"
                        variant="ghost"
                        className="music-song-delete-btn"
                        onClick={() => void handleDeleteUploadedSong(song)}
                        disabled={busy}
                      >
                        删除
                      </PixelButton>
                      <span>{song.fileName}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          {showRecentPanel ? (
            <div className="music-playlist-panel">
              <div className="worldbook-item-head">
                <strong>最近播放</strong>
              </div>
              {loading ? <p>加载中...</p> : null}
              {!loading && recentSongs.length === 0 ? <p>暂无最近播放记录</p> : null}
              {!loading && recentSongs.length > 0 ? (
                <ul className="music-song-file-list">
                  {recentSongs.map((song) => (
                    <li key={`${song.trackId}-${song.playedAt}`}>
                      <PixelButton
                        size="sm"
                        variant="ghost"
                        className="music-song-play-btn"
                        onClick={() => void handlePlayUploadedSong(song.trackId, song.name)}
                        disabled={busy}
                      >
                        {nowPlayingTrackId === song.trackId
                          ? '暂停'
                          : pausedTrackId === song.trackId
                            ? '继续播放'
                            : '播放'}
                      </PixelButton>
                      <span>{song.name}</span>
                      <small className="music-played-time">{formatPlayTimeLabel(song.playedAt)}</small>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          <input
            ref={songUploadRef}
            type="file"
            accept="audio/*,.mp3,.m4a,.wav,.ogg"
            className="hidden-file-input"
            onChange={(event) => void handleSongFileChange(event)}
          />
          <input
            ref={lyricsUploadRef}
            type="file"
            accept=".lrc,.txt,text/plain"
            className="hidden-file-input"
            onChange={(event) => void handleLyricsFileChange(event)}
          />
        </section>
        <section className="worldbook-item">
          <div className="worldbook-item-head">
            <strong>互动功能</strong>
          </div>
          <div className="chat-toolbar">
            <PixelButton size="sm" variant="ghost">
              一起听
            </PixelButton>
            <PixelButton size="sm" variant="ghost">
              分享歌曲
            </PixelButton>
            <PixelButton size="sm" variant="ghost">
              评论
            </PixelButton>
          </div>
        </section>
        <section className="worldbook-item">
          <div className="worldbook-item-head">
            <strong>播放控制</strong>
          </div>
          <div className="chat-toolbar">
            <PixelButton
              size="sm"
              variant="ghost"
              onClick={() => {
                setLoopEnabled((prev) => {
                  const next = !prev
                  setSuccessText(next ? '已开启循环播放' : '已关闭循环播放')
                  return next
                })
              }}
            >
              {`循环 ${loopEnabled ? '开' : '关'}`}
            </PixelButton>
            <PixelButton
              size="sm"
              variant="ghost"
              onClick={() => {
                setShuffleEnabled((prev) => {
                  const next = !prev
                  setSuccessText(next ? '已开启随机播放' : '已关闭随机播放')
                  return next
                })
              }}
            >
              {`随机 ${shuffleEnabled ? '开' : '关'}`}
            </PixelButton>
            <PixelButton
              size="sm"
              variant="ghost"
              onClick={() => {
                setSingleLoopEnabled((prev) => {
                  const next = !prev
                  setSuccessText(next ? '已开启单曲循环' : '已关闭单曲循环')
                  return next
                })
              }}
            >
              {`单曲循环 ${singleLoopEnabled ? '开' : '关'}`}
            </PixelButton>
            <PixelButton
              size="sm"
              variant="ghost"
              onClick={() => {
                const next = sleepMinutes === 0 ? 10 : sleepMinutes === 10 ? 30 : 0
                setSleepMinutes(next)
                setSuccessText(next ? `已设置定时关闭：${next} 分钟` : '已关闭定时关闭')
              }}
            >
              {sleepMinutes > 0 ? `定时 ${sleepMinutes}m` : '定时 关'}
            </PixelButton>
          </div>
          <div className="chat-toolbar">
            <PixelButton size="sm" variant="ghost" onClick={() => void handlePlayAdjacentSong('prev')} disabled={busy}>
              上一首
            </PixelButton>
            <PixelButton
              size="sm"
              variant="ghost"
              onClick={() => {
                const target = getActiveSongForControl()
                if (!target) {
                  setErrorText('暂无可播放歌曲')
                  return
                }
                void handlePlayUploadedSong(target.trackId, target.fileName)
              }}
              disabled={busy}
            >
              播放
            </PixelButton>
            <PixelButton size="sm" variant="ghost" onClick={() => void handlePlayAdjacentSong('next')} disabled={busy}>
              下一首
            </PixelButton>
            <PixelButton
              size="sm"
              variant="ghost"
              onClick={() => {
                const target = getActiveSongForControl()
                if (!target) {
                  setErrorText('暂无可播放歌曲')
                  return
                }
                void handleReplayUploadedSong(target, 'replay')
              }}
              disabled={busy}
            >
              重播
            </PixelButton>
          </div>
        </section>
        <section className="worldbook-item">
          <div className="worldbook-item-head">
            <strong>已上传文件</strong>
          </div>
          {loading ? <p>加载中...</p> : null}
          {!loading ? <p>歌曲文件：{uploadedSongs.length}，歌词文件：{uploadedLyrics.length}</p> : null}
          {!loading ? <p>播放列表条目：{playlist.length}</p> : null}
          <div className="chat-toolbar">
            <PixelButton size="sm" variant="ghost" onClick={() => void refreshMusic()} disabled={busy}>
              刷新
            </PixelButton>
          </div>
        </section>
        {errorText ? <p className="form-error">{errorText}</p> : null}
        {successText ? <p className="form-success">{successText}</p> : null}
      </div>
    </PixelWindow>
  )
}

export function RoleAlbumApp(props: AppRuntimeProps) {
  return (
    <PlaceholderApp
      {...props}
      title="相册"
      subtitle="图片收藏 / 回忆管理"
      sections={[
        { title: '相册分组', items: ['全部照片', '收藏', '回忆日历'] },
        { title: '管理操作', items: ['上传', '删除', '批量整理'] },
        { title: '互动功能', items: ['配文', '评论', '分享'] },
      ]}
    />
  )
}

export function RoleWalletApp(props: AppRuntimeProps) {
  return (
    <PlaceholderApp
      {...props}
      title="钱包"
      subtitle="余额 / 账单 / 收支"
      sections={[
        { title: '资金操作', items: ['充值', '提现', '转账'] },
        { title: '账单管理', items: ['收支明细', '筛选', '导出'] },
        { title: '安全设置', items: ['支付密码', '风控提醒', '额度'] },
      ]}
    />
  )
}

export function RoleCoupleApp(props: AppRuntimeProps) {
  return (
    <PlaceholderApp
      {...props}
      title="情侣空间"
      subtitle="纪念日 / 悄悄话 / 互动"
      sections={[
        { title: '纪念功能', items: ['纪念日', '在一起天数', '提醒'] },
        { title: '互动内容', items: ['悄悄话', '留言墙', '心情记录'] },
        { title: '共同玩法', items: ['愿望清单', '打卡', '情侣任务'] },
      ]}
    />
  )
}
