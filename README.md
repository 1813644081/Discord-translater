# AiTranslate — AI 实时翻译为中文（Vencord 插件）

一个 Vencord 用户插件，通过 **OpenAI 兼容接口** 调用 AI，把 Discord 上的其他语言消息**实时翻译成中文**。

> 核心原则：**绝不改动任何原始数据**。翻译内容以独立浮层形式显示在原文**下方**，原文保持不变；翻译缓存也只保存在本机内存中。

## 功能

- 🔤 **实时自动翻译**：收到非中文（非目标语言）消息时自动翻译，刷新即显示。
- 🖱️ **右键手动翻译**：右键任意消息 → `翻译成中文`。
- 🧠 **AI 驱动**：走 OpenAI Chat Completions 协议，兼容 OpenAI / DeepSeek / 通义千问 / 智谱 / OpenRouter / 本地 Ollama 等。
- 🔑 **用户自备 API Key**：Key 只保存在你本机的 Vencord 设置中，插件不会上传到任何第三方服务器。
- 🚫 **零改动原文**：翻译是 `renderMessageAccessory` 追加的独立元素，不触碰消息 DOM 与数据。
- ⚡ **内存缓存 + 节流**：相同文本不重复计费；同一消息在节流窗口内不重复请求。

## 目录结构

```
AiTranslate/
├── index.tsx      # 插件主逻辑（设置、翻译、浮层、右键菜单、自动翻译）
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
| **Target Language** | 翻译目标语言 | `中文` |
| **自动翻译收到的消息** | 打开后无需手动点击 | `开` |
| **自动检测源语言** | 已是目标语言则跳过 | `开` |

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
