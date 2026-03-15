import {
  RoleContactsApp,
  RoleDiaryApp,
  RoleMessagesApp,
  RoleMomentsApp,
  RolePersonaApp,
  RoleSettingsApp,
  RoleWalletApp,
  RoleWorldBookApp,
} from '../apps/RolePhoneApps'
import type { AppDefinition } from './types'

export const appRegistry: AppDefinition[] = [
  {
    id: 'role-messages',
    name: '消息',
    icon: '聊',
    description: '查看会话列表并与角色聊天',
    component: RoleMessagesApp,
  },
  {
    id: 'role-contacts',
    name: '通讯录',
    icon: '录',
    description: '管理角色联系人与进入会话',
    component: RoleContactsApp,
  },
  {
    id: 'role-worldbook',
    name: '世界书',
    icon: '书',
    description: '管理世界书并绑定到联系人',
    component: RoleWorldBookApp,
  },
  {
    id: 'role-persona',
    name: '人设',
    icon: '设',
    description: '编辑角色设定与绑定世界书',
    component: RolePersonaApp,
  },
  {
    id: 'role-settings',
    name: '设置',
    icon: '配',
    description: '配置 API、世界书与聊天样式',
    component: RoleSettingsApp,
  },
  {
    id: 'role-moments',
    name: '朋友圈',
    icon: '圈',
    description: '发布动态并查看好友圈内容',
    component: RoleMomentsApp,
  },
  {
    id: 'role-diary',
    name: '日记',
    icon: '记',
    description: '记录每天的心情与事件',
    component: RoleDiaryApp,
  },
  {
    id: 'role-wallet',
    name: '钱包',
    icon: '包',
    description: '管理余额和账单明细',
    component: RoleWalletApp,
  },
]

export function getRegisteredAppById(appId: string) {
  return appRegistry.find((app) => app.id === appId)
}

export function isRegisteredApp(appId: string) {
  return Boolean(getRegisteredAppById(appId))
}
