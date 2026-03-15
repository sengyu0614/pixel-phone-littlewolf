# Pixel Backend MVP (Node)

这是一个面向你当前需求的后端最小实现，覆盖：

1. 激活码一次验证 + 长期授权  
2. 多业务统一账号域（先覆盖聊天）  
3. AI 对话平台配置层（地址/Key/模型/温度/记忆条数/预设）  
4. 自动化内容生成引擎（自动发动态/评论/互动/总结）  
5. 世界书/人设/关系图谱绑定  
6. 数据治理（导入/部分导出/全量导出/全量清空）  
7. 消息状态模型（撤回/已读/秒级时间戳/黑名单/线下模式）  

## 快速启动

```bash
cd backend-mvp
npm install
npm run dev
```

默认端口：`3030`  
健康检查：`GET /health`

## 环境变量

- `PORT`：服务端口（默认 3030）
- `JWT_SECRET`：JWT 秘钥
- `DATA_FILE`：数据文件路径（默认 `./data/db.json`）

## 首次激活

内置测试激活码：`PIXEL-2026`（不区分大小写）

```bash
curl -X POST http://localhost:3030/license/activate \
  -H "Content-Type: application/json" \
  -d "{\"code\":\"PIXEL-2026\",\"deviceId\":\"device-001\",\"nickname\":\"测试用户\"}"
```

返回 `token` 后，后续请求加：

`Authorization: Bearer <token>`

## 核心接口

### 1) 授权
- `POST /license/activate`

### 2) 聊天与消息状态
- `POST /chat/conversations`
- `POST /chat/messages`
- `POST /chat/messages/:id/recall`
- `POST /chat/messages/:id/read`
- `POST /chat/blacklist/:targetId`
- `POST /chat/offline-mode`

### 3) AI 配置层
- `GET /ai/providers`
- `POST /ai/providers`
- `GET /ai/models`
- `POST /ai/models`
- `GET /ai/presets`
- `POST /ai/presets`
- `POST /ai/bind`

### 4) 自动化
- `GET /automation/rules`
- `POST /automation/rules`
- `POST /automation/run-now/:ruleId`
- `GET /automation/jobs`

### 5) 世界书/人设/关系图谱
- `POST /knowledge/worldbooks`
- `POST /knowledge/personas`
- `POST /knowledge/relationships`
- `POST /knowledge/bind`
- `GET /knowledge/snapshot`

### 6) 数据治理
- `POST /data/import`
- `POST /data/export`
- `DELETE /data/purge`（Body: `{"confirmText":"PURGE_ALL"}`）

## 说明

- 当前是 MVP 骨架，存储层使用 JSON 文件，便于快速迭代。
- 生产环境建议升级为 PostgreSQL + Redis + 队列（BullMQ/RabbitMQ）。
- AI Provider 的 Key 目前是明文字段（仅示例），生产需接入 KMS/加密存储。
