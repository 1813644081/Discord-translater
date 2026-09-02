# AiTranslate — AI 实时翻译插件（Vencord）

一个 Vencord 用户插件，通过 **OpenAI 兼容接口** 调用 AI，把 Discord 上的外语消息**实时翻译成你的 Discord 界面语言**（默认跟随界面语言，如界面是中文则译成中文、英文则译成英文、日文则译成日文；也可手动指定目标语言）。

> 核心原则：**绝不改动任何原始数据**。翻译内容以独立浮层形式显示在原文**下方**，原文保持不变；翻译缓存也只保存在本机内存中。

## 功能

- 🌍 **多语言跟随**：自动读取你 Discord 客户端的界面语言（`LocaleStore`），把翻译目标语言和插件文案（浮层标签、右键菜单、设置说明）都切换成对应语言。
- 📜 **历史消息翻译**：屏幕上已经发送的消息（切频道、上翻聊天记录时可见的旧消息）也会被自动识别并翻译，滚动到哪翻到哪。
- 🔤 **实时自动翻译**：收到外语消息时自动翻译，刷新即显示。
- 🖱️ **右键手动翻译**：右键任意消息 → `翻译` / `翻译成{语言}`。
- 🧠 **AI 驱动**：走 OpenAI Chat Completions 协议，兼容 OpenAI / DeepSeek / 通义千问 / 智谱 / OpenRouter / 本地 Ollama 等。
- 🔑 **用户自备 API Key**：Key 只保存在你本机的 Vencord 设置中，插件不会上传到任何第三方服务器。
- 🚫 **零改动原文**：翻译是 `renderMessageAccessory` 追加的独立元素，不触碰消息 DOM 与数据。
- ⚡ **缓存 + 并发控制**：相同文本不重复计费；自动翻译最多 3 个并发请求，批量历史消息排队处理，不会瞬间刷爆接口。

## 目录结构

```
AiTranslate/
├── index.tsx      # 插件主逻辑（设置、翻译、浮层、右键菜单、自动翻译）
├── native.ts      # 主进程网络层（绕过 Discord 桌面端的 CORS 限制）
└── styles.css     # 浮层样式
```

## 安装（Vencord 用户插件）

1. 找到 Vencord 的 **userplugins** 目录：
   - Windows：`%appdata%\Vencord\src\userplugins\`
   - macOS：`~/Library/Application Support/Vencord/src/userplugins/`
   - Linux：`~/.config/Vencord/src/userplugins/`
2. 把整个 `AiTranslate` 文件夹复制进 `userplugins` 目录。
3. 运行 `pnpm build` 重新构建 Vencord（或使用开发方式 `pnpm dev`）。
4. 重启 Discord，在 **Vencord 设置 → 插件** 中找到并启用 **AiTranslate**。

> 提示：如果 `userplugins` 目录不存在，请先创建它，并在 Vencord 设置里确认 `pnpm build` 已成功。

## 配置

进入插件设置，填写：

| 设置 | 说明 | 示例 |
|------|------|------|
| **API Key** | 你的服务商密钥 | `sk-...` |
| **API Base URL** | OpenAI 兼容接口地址，留空默认 OpenAI | `https://api.deepseek.com/v1` |
| **Model** | 模型名 | `deepseek-chat` / `gpt-4o-mini` / `qwen-plus` |
| **跟随 Discord 界面语言** | 翻译目标 = Discord 界面语言（界面英文→English，日文→日本語…） | `开` |
| **目标语言（下拉菜单）** | 关闭上方开关后出现，从下拉菜单直接选择目标语言（37 种常用语言） | `简体中文` |
| **自动翻译消息** | 自动翻译屏幕上显示的外语消息 | `开` |
| **翻译历史消息** | 同时翻译屏幕上已发送的旧消息（上翻/切频道时） | `开` |
| **自动跳过目标语言** | 已是目标语言的消息不翻译（中文目标用本地检测，其余交 AI） | `开` |

### 常见服务商 Base URL

| 服务商 | Base URL | 模型示例 |
|--------|----------|----------|
| OpenAI | （留空即可） | `gpt-4o-mini` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| 通义千问 (Qwen) | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
| 智谱 GLM | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` |
| Moonshot (Kimi) | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` |
| OpenRouter | `https://openrouter.ai/api/v1` | `openai/gpt-4o-mini` |
| Ollama（本地） | `http://localhost:11434/v1` | `llama3` |

## 安全性说明

- 你的 API Key 存储在 Vencord 本地配置文件，**不会**被本插件上传或共享。
- 插件只把你选择翻译的消息文本发送到**你配置的 Base URL**。
- 原消息内容与 Discord 数据**完全不被修改**。

## 许可

MIT
