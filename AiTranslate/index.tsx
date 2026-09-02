/*
 * AiTranslate - Real-time AI translation for Discord (Vencord plugin)
 *
 * Translates messages into Chinese (or any target language) using an
 * OpenAI-compatible Chat Completions API (OpenAI, DeepSeek, Qwen/Tongyi,
 * Zhipu, OpenRouter, local LLMs, etc.). The user supplies their own API key.
 *
 * IMPORTANT: This plugin NEVER modifies the original message. Translations are
 * rendered as a separate accessory element BELOW the original message, so the
 * source message stays byte-for-byte intact.
 *
 * License: MIT
 */

import "./styles.css";

import { definePluginSettings } from "@api/Settings";
import { findGroupChildrenByChildId } from "@api/ContextMenu";
import { Devs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import definePlugin, { OptionType } from "@utils/types";
import { Message } from "@vencord/discord-types";
import { Menu, Parser, UserStore, useEffect, useState } from "@webpack/common";

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const settings = definePluginSettings({
    apiKey: {
        type: OptionType.STRING,
        displayName: "API Key",
        description:
            "你的 AI 服务商 API Key。仅保存在你本机（Vencord 设置）中，不会上传到任何第三方服务器。",
        default: "",
        placeholder: "sk-...",
    },
    baseUrl: {
        type: OptionType.STRING,
        displayName: "API Base URL",
        description:
            "OpenAI 兼容接口地址。留空则使用 OpenAI 官方。例如：" +
            "DeepSeek: https://api.deepseek.com/v1；" +
            "通义千问: https://dashscope.aliyuncs.com/compatible-mode/v1；" +
            "本地: http://localhost:11434/v1",
        default: "",
        placeholder: "https://api.deepseek.com/v1",
    },
    model: {
        type: OptionType.STRING,
        displayName: "Model",
        description: "模型名称，例如 gpt-4o-mini / deepseek-chat / qwen-plus。",
        default: "gpt-4o-mini",
        placeholder: "gpt-4o-mini",
    },
    targetLang: {
        type: OptionType.STRING,
        displayName: "Target Language",
        description: "翻译目标语言（写入提示词，建议用「中文」）。",
        default: "中文",
        placeholder: "中文",
    },
    autoTranslate: {
        type: OptionType.BOOLEAN,
        description: "自动翻译收到的消息（无需手动点击）。",
        default: true,
    },
    autoDetect: {
        type: OptionType.BOOLEAN,
        description:
            "自动检测源语言；若原文已经是目标语言则跳过翻译。关闭后始终请求 AI 翻译。",
        default: true,
    },
}, {
    baseUrl: {
        isValid: v => typeof v === "string" && (v === "" || /^https?:\/\//i.test(v)),
    },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const cl = classNameFactory("vc-aitrans-");

// Simple FIFO cache keyed by <sourceText> -> translated text, so identical
// messages (e.g. repeated phrases) are not re-billed.
const cache = new Map<string, string>();
const CACHE_MAX = 500;

const isCjk = (text: string) => /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/u.test(text);

function cacheSet(text: string, translated: string) {
    if (cache.size >= CACHE_MAX) {
        const firstKey = cache.keys().next().value;
        if (firstKey !== undefined) cache.delete(firstKey);
    }
    cache.set(text, translated);
}

interface TranslationResult {
    text: string;
}

interface NativeTranslate {
    makeChatRequest(req: {
        url: string;
        apiKey: string;
        model: string;
        system: string;
        user: string;
    }): Promise<{ status: number; data: string }>;
}

/**
 * Access the main-process helper. This is only bridged when Vencord's build
 * found a native.ts for this plugin (always true after a proper pnpm build).
 * On web or if unavailable it stays undefined and we fall back to fetch().
 */
function getNative(): NativeTranslate | undefined {
    try {
        return (window as any).VencordNative?.pluginHelpers?.AiTranslate as NativeTranslate | undefined;
    } catch {
        return undefined;
    }
}

async function translate(text: string): Promise<TranslationResult> {
    const key = settings.store.apiKey?.trim();
    if (!key) {
        throw new Error("未设置 API Key，请在 AiTranslate 插件设置里填写。");
    }

    const base = settings.store.baseUrl?.trim() || "https://api.openai.com/v1";
    const model = settings.store.model?.trim() || "gpt-4o-mini";
    const target = settings.store.targetLang?.trim() || "中文";

    const system =
        `You are a natural, fluent translator. Translate the user's message into ${target}. ` +
        `Output ONLY the translation with no extra text, quotes, explanations, or formatting. ` +
        `Preserve the original meaning, tone, and line breaks. Keep emoji, @mentions, <emoji> tags, ` +
        `discord markdown and URLs exactly as they are. Never translate code blocks, commands, or URLs.`;

    const url = base.replace(/\/+$/, "") + "/chat/completions";

    let raw: string;
    let status: number;

    const native = getNative();

    if (native) {
        // Desktop: go through the Electron main process to bypass CORS/CSP.
        const res = await native.makeChatRequest({
            url,
            apiKey: key,
            model,
            system,
            user: text,
        });
        status = res.status;
        raw = res.data;
    } else {
        // Web / no native bridge: plain fetch (CORS permitting).
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${key}`,
            },
            body: JSON.stringify({
                model,
                temperature: 0.2,
                messages: [
                    { role: "system", content: system },
                    { role: "user", content: text },
                ],
            }),
        });
        status = res.status;
        raw = await res.text().catch(() => "");
    }

    if (status === -1) {
        throw new Error(`网络请求失败（无法连接 ${base}）：${raw || "请检查网络或 Base URL"}`);
    }

    if (status < 200 || status >= 300) {
        let detail = raw;
        try {
            const j = JSON.parse(raw);
            detail = j?.error?.message || detail;
        } catch { /* keep raw */ }
        throw new Error(`翻译请求失败 (HTTP ${status})：${detail || "未知错误"}`);
    }

    let data: any;
    try {
        data = JSON.parse(raw);
    } catch {
        throw new Error("AI 返回了无法解析的数据。");
    }

    const translated: string | undefined = data?.choices?.[0]?.message?.content;

    if (typeof translated !== "string" || !translated.trim()) {
        throw new Error("AI 未返回有效翻译内容。");
    }

    return { text: translated.trim() };
}

// ---------------------------------------------------------------------------
// Message accessory (the translation overlay)
// ---------------------------------------------------------------------------

// Map from message id -> setter, mirroring Vencord's Translate plugin approach.
const TranslationSetters = new Map<string, (v: string | undefined) => void>();

// ---------------------------------------------------------------------------
// Auto-translation state machine
//
// Discord's message list is a *virtualized* list: the MESSAGE_CREATE Flux event
// fires when the store updates, but the message's React component (and thus
// this accessory) is only mounted once the message actually scrolls into view.
// If we tried to translate inside the Flux handler we'd often find no setter
// yet and silently skip the message — which is why "manual only" happened.
//
// Fix: MESSAGE_CREATE only *flags* a message as pending. The translation is
// actually started from the accessory's mount effect (when it is visible and a
// setter exists). Results are cached per message id so scrolling away and back
// shows them instantly without re-billing the API.
// ---------------------------------------------------------------------------

// New incoming messages awaiting translation (messageId -> content).
const pendingAuto = new Map<string, string>();
const PENDING_MAX = 300;
// Completed translations (messageId -> translated text), survives re-mounts.
const translatedCache = new Map<string, string>();
const CACHE_IDS_MAX = 300;
// Messages the user explicitly dismissed.
const dismissed = new Set<string>();

const inFlight = new Set<string>();
// Serial queue so a burst of messages cannot spam the API (max 3 parallel).
const requestQueue: { id: string; content: string }[] = [];
const queuedIds = new Set<string>();
let activeRequests = 0;
const MAX_CONCURRENT = 3;
// Small delay so consecutive messages coalesce and the component is mounted.
const QUEUE_DELAY_MS = 350;

function dropOldest(map: Map<string, unknown>, max: number) {
    while (map.size > max) {
        const firstKey = map.keys().next().value;
        if (firstKey === undefined) break;
        map.delete(firstKey);
    }
}

function getMessageContent(message: Message): string {
    return message.content
        || message.messageSnapshots?.[0]?.message?.content
        || message.embeds?.find(embed => embed.type === "auto_moderation_message")?.rawDescription
        || "";
}

function TranslationAccessory({ message }: { message: Message }) {
    const [translation, setTranslation] = useState<string>();

    useEffect(() => {
        // Ignore messages embedded by other Vencord plugins.
        if ((message as any).vencordEmbeddedBy) return;

        const id = message.id;
        TranslationSetters.set(id, setTranslation);

        // 1. Re-show a translation we already did for this message.
        const cached = translatedCache.get(id);
        if (cached) {
            setTranslation(cached);
            return () => void TranslationSetters.delete(id);
        }

        // 2. New incoming message flagged by MESSAGE_CREATE -> translate now
        //    that the accessory is actually mounted and visible.
        if (settings.store.autoTranslate && !dismissed.has(id)) {
            const content = pendingAuto.get(id);
            if (content !== undefined) {
                pendingAuto.delete(id);
                scheduleTranslate(id, content);
            }
        }

        return () => void TranslationSetters.delete(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [message.id]);

    if (!translation) return null;

    return (
        <span className={cl("accessory")}>
            <span className={cl("badge")}>AI 翻译</span>
            {Parser.parse(translation)}
            <span
                className={cl("dismiss")}
                onClick={() => {
                    setTranslation(undefined);
                    dismissed.add(message.id);
                    translatedCache.delete(message.id);
                }}
                role="button"
                aria-label="关闭翻译"
                tabIndex={0}
            >
                ✕
            </span>
        </span>
    );
}

function applyResult(messageId: string, text: string) {
    translatedCache.set(messageId, text);
    dropOldest(translatedCache, CACHE_IDS_MAX);
    const setter = TranslationSetters.get(messageId);
    if (setter) setter(text);
}

async function doTranslateCore(id: string, content: string) {
    try {
        const cachedText = cache.get(content);
        const text = cachedText ?? (await translate(content)).text;
        if (!cachedText) cacheSet(content, text);
        applyResult(id, text);
    } catch (e) {
        console.error("[AiTranslate]", e);
        // Show the error inline so the user sees it without opening the console.
        const setter = TranslationSetters.get(id);
        if (setter) setter("⚠️ " + (e instanceof Error ? e.message : String(e)));
    }
}

function pumpQueue() {
    while (activeRequests < MAX_CONCURRENT && requestQueue.length > 0) {
        const { id, content } = requestQueue.shift()!;
        activeRequests++;
        inFlight.add(id);
        void doTranslateCore(id, content).finally(() => {
            activeRequests--;
            inFlight.delete(id);
            pumpQueue();
        });
    }
}

function scheduleTranslate(id: string, content: string) {
    // Already translated / in-flight / queued / dismissed -> skip.
    if (translatedCache.has(id) || inFlight.has(id) || queuedIds.has(id)) return;
    if (dismissed.has(id)) return;

    queuedIds.add(id);
    setTimeout(() => {
        queuedIds.delete(id);
        if (translatedCache.has(id) || inFlight.has(id)) return;
        requestQueue.push({ id, content });
        pumpQueue();
    }, QUEUE_DELAY_MS);
}

/** Manual translate (context menu / right-click). Always allowed. */
function handleTranslate(message: Message) {
    const content = getMessageContent(message);
    if (!content) return;

    dismissed.delete(message.id);
    translatedCache.delete(message.id);
    pendingAuto.delete(message.id);
    scheduleTranslate(message.id, content);
}

// ---------------------------------------------------------------------------
// Plugin definition
// ---------------------------------------------------------------------------

export default definePlugin({
    name: "AiTranslate",
    description:
        "使用 AI（OpenAI 兼容接口，需自备 API Key）将收到的消息实时翻译成中文，" +
        "翻译以浮层形式显示在原文下方，绝不改动原始消息。",
    authors: [Devs.Ven, {
        name: "AiTranslate",
        id: 0n,
    }],
    tags: ["Chat", "Translate", "AI", "Translation"],

    settings,

    // Right-click a message -> "翻译成中文"
    contextMenus: {
        "message": (children, { message }: { message: Message }) => {
            const content = getMessageContent(message);
            if (!content) return;

            const group = findGroupChildrenByChildId("copy-text", children);
            if (!group) return;

            const idx = group.findIndex(c => c?.props?.id === "copy-text");
            if (idx === -1) return;

            group.splice(idx + 1, 0, (
                <Menu.MenuItem
                    id="vc-aitrans-translate"
                    label="翻译成中文"
                    action={() => void handleTranslate(message)}
                />
            ));
        },
    },

    // Render the translation overlay below every message.
    renderMessageAccessory: props => <TranslationAccessory message={props.message} />,

    // Auto-translate incoming messages when enabled.
    // NOTE: this only FLAGS messages. Actual translation starts in the
    // accessory mount effect, once the message is visible on screen.
    flux: {
        MESSAGE_CREATE({ message }: { message: Message }) {
            if (!settings.store.autoTranslate) return;
            if (!message) return;

            const content = getMessageContent(message);
            if (!content) return;

            // Skip our own outgoing messages.
            const selfId = UserStore?.getCurrentUser()?.id;
            if (selfId && message.author?.id === selfId) return;

            // Auto-detect: skip if the text already looks like the target language.
            if (settings.store.autoDetect) {
                if (settings.store.targetLang?.trim() === "中文" && isCjk(content)) return;
            }

            if (translatedCache.has(message.id) || inFlight.has(message.id)) return;

            // Flag it; the mounted accessory will pick it up.
            pendingAuto.set(message.id, content);
            dropOldest(pendingAuto, PENDING_MAX);

            // If the accessory is somehow already mounted (e.g. store replay
            // after switching back to this channel), translate right away.
            if (TranslationSetters.has(message.id)) {
                pendingAuto.delete(message.id);
                scheduleTranslate(message.id, content);
            }
        },
    },
});
