# Pixel Role Phone MVP

手机式角色扮演 AI Web/PWA MVP，核心能力：

- 手机壳交互 + 应用容器
- 角色列表、聊天、人设编辑、API 设置四个页面
- 用户自定义 `Base URL / API Key / Model`（后端加密保存 Key）
- 可插拔 OpenAI-Compatible 适配层（`/chat/completions`）
- 会话短期上下文 + 长期摘要/事实记忆注入
- 数据导出（JSON）

## 启动方式

### 1) 启动后端 API

```bash
cd services/api
npm install
cp .env.example .env
npm run dev
```

### 2) 启动前端 Web

```bash
cd ../../
npm install
cp .env.example .env
npm run dev
```

默认：

- Web: `http://localhost:5173`
- API: `http://localhost:8787`

## 环境变量

### 前端 `.env`

```bash
VITE_API_BASE_URL=http://localhost:8787
```

### 后端 `services/api/.env`

```bash
PORT=8787
APP_SECRET=replace_with_at_least_32_chars_secret
DEFAULT_API_BASE_URL=https://api.openai.com/v1
DEFAULT_API_MODEL=gpt-4o-mini
```

## 目录概览

- `src/simulator`: 手机壳、桌面、应用运行时
- `src/apps/ChatApp`: Role Phone 主应用（四页一体）
- `src/api`: BFF 调用客户端
- `services/api/src`: 后端路由、适配层、记忆与安全模块
- `packages/shared/src`: 共享类型与 schema

## 构建

```bash
npm run build
```

## 公网发布（Netlify）

### 1) 首次登录与部署（免费）

```bash
npx netlify-cli login
npx netlify-cli deploy --create-site <site-name> --prod --dir dist --functions netlify/functions
```

部署成功后会返回一个公网 URL（可直接分享给他人访问）。

### 2) 生产环境变量

在 Netlify 项目环境变量中添加：

- `APP_SECRET`：至少 32 位随机字符串（用于服务端密钥加密）
- `AWS_LAMBDA_JS_RUNTIME=nodejs22.x`：避免 Node 24 对 callback 处理器的兼容问题
- `DEFAULT_API_BASE_URL`：默认上游 API 地址（如 `https://api.openai.com/v1`）
- `DEFAULT_API_MODEL`：默认模型名（如 `gpt-4o-mini`）

可选：

- `VITE_API_BASE_URL`：前端 API 基址。默认可留空，生产环境会走同域 `/api`。

### 3) 后续重部署

```bash
npx netlify-cli deploy --prod --dir dist --functions netlify/functions
```

### 4) 部署说明

- 前端静态资源由 Netlify 托管。
- 后端接口由 `netlify/functions/api.js` 转发到 `services/api/src/server.js`。
- Serverless 环境下数据文件写入临时目录（无持久化保证），适合演示与快速共享；正式生产建议接入持久化数据库。

## 公网发布（GitHub Pages + 独立 API）

如果前端放在 GitHub Pages（`https://<user>.github.io/<repo>/`），你必须额外部署后端 API，然后把 API 地址注入前端构建。

### 1) 先部署后端 API（推荐 Netlify）

- 在 Netlify 新建站点并连接本仓库（或 CLI 部署）。
- 构建设置可使用仓库内 `netlify.toml` 默认值（发布目录 `dist`，函数目录 `netlify/functions`）。
- 在 Netlify 环境变量中至少设置：
  - `APP_SECRET`（>=32 位随机字符串）
  - `DEFAULT_API_BASE_URL`（如 `https://api.openai.com/v1`）
  - `DEFAULT_API_MODEL`（如 `gpt-4o-mini`）
  - `ACTIVATION_CODE`（你的激活码）

部署成功后，确认 `https://<your-netlify-site>.netlify.app/api/health` 可访问。

### 2) 配置 GitHub 仓库变量

在 GitHub 仓库 `Settings -> Secrets and variables -> Actions -> Variables` 新增：

- `VITE_API_BASE_URL` = `https://<your-netlify-site>.netlify.app`

### 3) 触发 Pages 发布

推送到 `main`（或手动运行 `Deploy to GitHub Pages` workflow）后，前端会使用上面的 API 地址。

> 注意：若未设置 `VITE_API_BASE_URL`，Pages workflow 会直接失败，避免发布一个必然 404 的版本。
