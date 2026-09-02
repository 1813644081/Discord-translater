<h1 align="center">AiTranslate — Real-time AI translation for Discord</h1>

<p align="center">
  🌐 <b>English</b> · <a href="#chinese">简体中文</a>
</p>

A Vencord user plugin that uses an **OpenAI-compatible API** to translate foreign messages in Discord into **your Discord UI language in real time** (follows your UI language by default — English UI → English, Japanese UI → 日本語… You can also pick a target language manually).

> **Core principle: original messages are never modified.** Translations are rendered as a separate overlay *below* the original message. All translation caches live in local memory only.

## Features

- **🌐 Real-time auto-translation** — foreign messages that appear on screen are translated automatically; no clicking needed;
- **📜 History translated too, newest first** — old messages already on screen (scroll up / channel switch) are auto-detected as well; translations are queued **from the newest message backwards to older ones**;
- **🎯 Target language follows your UI** — by default messages are translated into your Discord UI language; you can also pick one manually from a dropdown in the settings;
- **🧠 AI-powered, provider-agnostic** — speaks the OpenAI-compatible protocol: DeepSeek / Qwen (Tongyi) / Zhipu / OpenAI / local Ollama and more. You bring your own API key;
- **🚫 Never touches the original** — translations are a separate overlay under the message; source content stays byte-for-byte intact;
- **🖱️ Manual translate from the context menu** — right-click any message to translate (with an icon, matching Discord's menu style);
- **⚡ Cost-conscious** — identical texts are cached and requests are rate-limited/queued, so you are never double-billed or rate-limited into oblivion.

## Installation

> ⚠️ **Note:** Vencord **user plugins can only be loaded from a source build**. The official one-click installer cannot load your own plugins. So we install from source below.

### 1. Install Vencord (skip if you already have a source build)

1. Install the prerequisites if missing:
   - **Node.js** (v20+): <https://nodejs.org>
   - **pnpm**: after installing Node, run `npm install -g pnpm` in a terminal
   - **Git**: <https://git-scm.com>

2. Pick a folder (or create one, e.g. `D:\Vencord`), right-click the empty area → **Open in Terminal**, then clone:

   ```bash
   git clone https://github.com/Vendicated/Vencord.git
   cd Vencord
   ```

3. Install dependencies and do the first build:

   ```bash
   pnpm install
   pnpm build
   ```

4. **Inject into Discord** (auto-detects the install location, may ask you to pick):

   ```bash
   pnpm inject
   ```

   Use the arrow keys to select `Stable - ... [PATCHED]` and press Enter. On first install it may ask you to **fully quit Discord** and retry.

5. **Verify**: reopen Discord → the **Vencord** category should appear in your User Settings.

### 2. Install the AiTranslate plugin

1. Locate the `userplugins` folder inside the Vencord **source repo** (not `%appdata%\Vencord` — the `Vencord` folder you cloned):

   - Windows: `Vencord\src\userplugins\`
   - macOS / Linux: `Vencord/src/userplugins/`

   > If it doesn't exist, **create it manually** — the source repo has none by default.

2. Copy the whole `AiTranslate` folder into it, so the layout looks like this:

   ```
   Vencord\src\userplugins\AiTranslate\
   ├── index.tsx
   ├── native.ts
   └── styles.css
   ```

3. Rebuild and inject from the terminal:

   ```bash
   cd Vencord
   pnpm build
   pnpm inject
   ```

4. **Fully quit Discord** (right-click the tray icon → Quit), then open it again.

5. Open **User Settings → Vencord → Plugins**, find **AiTranslate** and enable it. Then fill in your API key in the plugin settings (see below).

## Configuration

Open the plugin settings and configure:

| Setting | Description | Example |
|---|---|---|
| **Translate to** | **Core setting** — target language. First option "Follow Discord UI language" auto-uses your client's UI language (English UI → English, 日本語 UI → 日本語…); pick any of the other 37 languages for a fixed target | `Follow UI (default)` |
| **API Key** | Your AI provider's key | `sk-...` |
| **API Base URL** | OpenAI-compatible endpoint; empty = OpenAI | `https://api.deepseek.com/v1` |
| **Model** | Model name | `deepseek-chat` / `gpt-4o-mini` / `qwen-plus` |
| **Auto-translate messages** | Auto-translate foreign messages shown on screen | `On` |
| **Translate history** | Also translate old messages already on screen (scroll up / channel switch) | `On` |
| **Skip target language** | Don't translate messages already in the target language (local check for Chinese; AI decides the rest) | `On` |

### Common provider Base URLs

| Provider | Base URL | Example model |
|---|---|---|
| OpenAI | (leave empty) | `gpt-4o-mini` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| Qwen (DashScope) | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
| Zhipu GLM | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` |
| Moonshot (Kimi) | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` |
| OpenRouter | `https://openrouter.ai/api/v1` | `openai/gpt-4o-mini` |
| Ollama (local) | `http://localhost:11434/v1` | `llama3` |

## Privacy & Security

- Your API key is stored in Vencord's **local** config file — this plugin never uploads or shares it.
- The plugin only sends the message text you choose to translate to the **Base URL you configured**.
- Original messages and Discord data are **never modified**.

---

<a id="chinese"></a>

<p align="center">
  <a href="#">English</a> · <b>简体中文</b>
</p>

# AiTranslate — Discord AI 实时翻译插件（Vencord）

一个 Vencord 用户插件，通过 **OpenAI 兼容接口** 调用 AI，把 Discord 上的外语消息**实时翻译成你的 Discord 界面语言**（默认跟随界面语言，如界面是中文则译成中文、英文则译成英文、日文则译成日文；也可手动指定目标语言）。

> 核心原则：**绝不改动任何原始数据**。翻译内容以独立浮层形式显示在原文**下方**，原文保持不变；翻译缓存也只保存在本机内存中。

## 功能特性

- **🌐 实时自动翻译**：屏幕上出现的外语消息自动翻译成你的语言，无需手动点击；
- **📜 历史消息也翻，最新优先**：上翻聊天记录、切换频道时，屏幕上的旧消息同样自动识别翻译；翻译按时间**从最新消息向更早的消息**排队处理；
- **🎯 目标语言跟随界面**：默认翻译成你 Discord 界面语言（界面英文→English，日文→日本語…），也可在设置里手动下拉选择；
- **🧠 AI 驱动，兼容多家**：走 OpenAI 兼容接口，支持 DeepSeek / 通义千问 / 智谱 / OpenAI / 本地 Ollama 等，API Key 由你自己提供；
- **🚫 不碰原文**：翻译以独立浮层显示在原文下方，原始消息内容零改动；
- **🖱️ 右键手动翻译**：右键任意消息即可翻译（带图标，与 Discord 菜单风格一致）；
- **⚡ 省额度设计**：相同文本自动缓存、翻译请求限流排队，不会重复计费或打爆接口。

## 安装方法

> ⚠️ **重要**：Vencord 的**用户插件（userplugins）只能从源码构建加载**，官方一键安装器装的 Vencord 无法加载自己的插件。所以下面用「克隆源码」的方式安装。

### 安装 Vencord（如果你已经装好源码版，直接跳到「安装 AiTranslate 插件」）

1. **先安装依赖工具**（没有的话）：
   - **Node.js**（v20 或更高）：<https://nodejs.org>
   - **pnpm**：装完 Node 后在终端执行 `npm install -g pnpm`
   - **Git**：<https://git-scm.com>

2. 选择一个文件夹（或新建一个，比如 `D:\Vencord`），右键空白处 → **在终端中打开**，克隆源码：

   ```bash
   git clone https://github.com/Vendicated/Vencord.git
   cd Vencord
   ```

3. 安装依赖并首次构建：

   ```bash
   pnpm install
   pnpm build
   ```

4. **注入到 Discord**（自动检测安装位置，也可能弹窗让你选）：

   ```bash
   pnpm inject
   ```

   出现选择列表时用方向键选到 `Stable - ... [PATCHED]` 再按回车；若首次安装可能提示你**完全退出 Discord** 后重试。

5. **验证**：重新打开 Discord → 用户设置里出现 **Vencord** 分类即成功。

### 安装 AiTranslate 插件

1. 找到 Vencord **源码仓库**里的 userplugins 目录（注意：**不是** `%appdata%\Vencord`，而是你刚才 clone 出来的 `Vencord` 文件夹）：

   - Windows：`Vencord\src\userplugins\`
   - macOS / Linux：`Vencord/src/userplugins/`

   > 如果这个目录不存在，**手动新建一个**即可（默认源码仓库里没有它）。

2. 把整个 `AiTranslate` 文件夹复制进去，最终结构如下：

   ```
   Vencord\src\userplugins\AiTranslate\
   ├── index.tsx
   ├── native.ts
   └── styles.css
   ```

3. 回到终端重新构建并注入：

   ```bash
   cd Vencord
   pnpm build
   pnpm inject
   ```

4. **完全退出 Discord**（托盘图标右键 → 退出），再重新打开。

5. 打开 **用户设置 → Vencord → 插件**，找到 **AiTranslate** 并开启，然后到插件设置里填入你的 API Key（见下方「配置」）。

## 配置

进入插件设置，填写：

| 设置 | 说明 | 示例 |
|------|------|------|
| **翻译目标语言** | **核心设置**。下拉第一项「跟随 Discord 界面语言（默认）」会自动使用你客户端的界面语言（界面英文→English，日文→日本語…）；也可选其余 37 种语言固定目标 | `跟随界面（默认）` |
| **API Key** | 你的服务商密钥 | `sk-...` |
| **API Base URL** | OpenAI 兼容接口地址，留空默认 OpenAI | `https://api.deepseek.com/v1` |
| **Model** | 模型名 | `deepseek-chat` / `gpt-4o-mini` / `qwen-plus` |
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
