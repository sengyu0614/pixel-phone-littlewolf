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
        <p className="text-pixel-text-muted">该模块已接入桌面入口，当前提供常用功能导航。</p>
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
