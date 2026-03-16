import { ChatApp } from './ChatApp/ChatApp'
import type { AppRuntimeProps } from '../simulator/types'

export function RoleMessagesApp(props: AppRuntimeProps) {
  return <ChatApp {...props} defaultTab="chat" hideTabBar appTitle="消息" />
}

export function RoleContactsApp(props: AppRuntimeProps) {
  return <ChatApp {...props} defaultTab="roles" hideTabBar appTitle="通讯录" />
}

export function RoleWorldBookApp(props: AppRuntimeProps) {
  return <ChatApp {...props} defaultTab="worldbook" hideTabBar appTitle="世界书" />
}

export function RolePersonaApp(props: AppRuntimeProps) {
  return <ChatApp {...props} defaultTab="editor" hideTabBar appTitle="人设" />
}

export function RoleSettingsApp(props: AppRuntimeProps) {
  return <ChatApp {...props} defaultTab="settings" hideTabBar appTitle="设置" enableSettingsSubTabs />
}
