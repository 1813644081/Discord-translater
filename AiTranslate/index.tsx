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
import { classNameFactory } from "@utils/css";
import { classes } from "@utils/misc";
import definePlugin, { IconComponent, OptionType } from "@utils/types";
import { Message } from "@vencord/discord-types";
import { LocaleStore, Menu, Parser, UserStore, useEffect, useState } from "@webpack/common";

// ---------------------------------------------------------------------------
// Translate icon (Material Symbols "translate", same as Vencord's Translate
// plugin). Rendered with currentColor so it matches the context menu theme.
// ---------------------------------------------------------------------------

export const TranslateIcon: IconComponent = ({ height = 16, width = 16, className }) => (
    <svg
        viewBox="0 96 960 960"
        height={height}
        width={width}
        className={classes(cl("icon"), className)}
        aria-hidden
    >
        <path
            fill="currentColor"
            d="m475 976 181-480h82l186 480h-87l-41-126H604l-47 126h-82Zm151-196h142l-70-194h-2l-70 194Zm-466 76-55-55 204-204q-38-44-67.5-88.5T190 416h87q17 33 37.5 62.5T361 539q45-47 75-97.5T487 336H40v-80h280v-80h80v80h280v80H567q-22 69-58.5 135.5T419 598l98 99-30 81-127-122-200 200Z"
        />
    </svg>
);

// ---------------------------------------------------------------------------
// i18n — follows the user's Discord client language (LocaleStore.locale)
// ---------------------------------------------------------------------------

/** Discord locale -> the natural-language name we hand to the AI model. */
const DISCORD_LOCALE_TO_LANG: Record<string, string> = {
    "en-US": "English",
    "en-GB": "English",
    "en-AU": "English",
    "en": "English",
    "zh-CN": "简体中文",
    "zh-SG": "简体中文",
    "zh-TW": "繁體中文",
    "zh-HK": "繁體中文",
    "zh": "简体中文",
    "ja": "日本語",
    "ko": "한국어",
    "fr": "Français",
    "de": "Deutsch",
    "es": "Español",
    "es-ES": "Español",
    "it": "Italiano",
    "pt": "Português",
    "pt-BR": "Português",
    "ru": "Русский",
    "nl": "Nederlands",
    "pl": "Polski",
    "tr": "Türkçe",
    "uk": "Українська",
    "vi": "Tiếng Việt",
    "th": "ไทย",
    "id": "Bahasa Indonesia",
    "ar": "العربية",
    "hi": "हिन्दी",
    "sv": "Svenska",
    "no": "Norsk",
    "da": "Dansk",
    "fi": "Suomi",
    "cs": "Čeština",
    "el": "Ελληνικά",
    "hu": "Magyar",
    "ro": "Română",
    "bg": "Български",
    "hr": "Hrvatski",
    "lt": "Lietuvių",
    "sl": "Slovenščina",
    "sk": "Slovenčina",
    "he": "עברית",
    "bn": "বাংলা",
    "ta": "தமிழ்",
    "fil": "Filipino",
};

function getDiscordLocale(): string {
    try {
        return LocaleStore?.locale ?? "en-US";
    } catch {
        return "en-US";
    }
}

/** e.g. "zh-CN" -> "zh"; "en-US" -> "en" */
function getBaseLang(): string {
    return (getDiscordLocale() || "en-US").split("-")[0].toLowerCase();
}

/** Human display language for plugin UI strings. */
type UiLang = "zh" | "en";
function uiLang(): UiLang {
    return getBaseLang() === "zh" ? "zh" : "en";
}

/** Pick a static string at module-load time for settings descriptions. */
function tr2(zh: string, en: string): string {
    return uiLang() === "zh" ? zh : en;
}

const uiStrings = {
    zh: {
        badge: "AI 翻译",
        dismiss: "关闭翻译",
        menuTranslate: "翻译",
        menuTranslateTo: "翻译成{lang}",
        ownMessage: "（不能翻译自己的消息）",
    },
    en: {
        badge: "AI Translate",
        dismiss: "Dismiss",
        menuTranslate: "Translate",
        menuTranslateTo: "Translate to {lang}",
        ownMessage: "(cannot translate your own message)",
    },
} as const;

function tr(key: keyof typeof uiStrings["zh"]): string {
    return uiStrings[uiLang()][key];
}

/** Sentinel value stored in targetLang: follow the Discord UI language. */
const AUTO_TARGET = "auto";

/**
 * The language to translate INTO.
 * - "auto" (the dropdown default) resolves to the Discord UI language.
 * - any other value is the fixed language picked from the dropdown.
 */
function resolveTargetLang(): string {
    const raw = String(settings.store.targetLang ?? "").trim();

    // Legacy: older versions stored a boolean followLocale. Honour it as "auto".
    const legacyFollow = (settings.store as any).followLocale;
    const isAuto = !raw || raw === AUTO_TARGET || legacyFollow === true;

    if (isAuto) {
        const locale = getDiscordLocale();
        // Exact match first, then base-language match (e.g. "en" matches "en-US").
        return DISCORD_LOCALE_TO_LANG[locale]
            ?? DISCORD_LOCALE_TO_LANG[locale.split("-")[0]]
            ?? "简体中文";
    }

    // Tolerate any leftover free-text value from older versions by normalising
    // it into one of the dropdown options. If it does not match, keep the raw
    // value — the model understands most language names ("Français", "法语"...).
    return normalizeTargetLang(raw) ?? raw;
}

// ---------------------------------------------------------------------------
// Target-language dropdown options. The first option ("auto") follows the
// Discord UI language and is the default; everything else is a fixed language.
// Values are natural language names that we hand straight to the AI model,
// matching the DISCORD_LOCALE_TO_LANG values above.
// ---------------------------------------------------------------------------

const TARGET_LANG_OPTIONS: { get label(): string; value: string; default?: boolean }[] = [
    // getter so the label follows the UI language at render time
    {
        get label() { return "🌐 " + tr2("跟随 Discord 界面语言（默认）", "Follow Discord UI language (default)"); },
        value: AUTO_TARGET,
        default: true,
    },
    { label: "简体中文", value: "简体中文" },
    { label: "繁體中文", value: "繁體中文" },
    { label: "English", value: "English" },
    { label: "日本語", value: "日本語" },
    { label: "한국어", value: "한국어" },
    { label: "Français", value: "Français" },
    { label: "Deutsch", value: "Deutsch" },
    { label: "Español", value: "Español" },
    { label: "Italiano", value: "Italiano" },
    { label: "Português", value: "Português" },
    { label: "Русский", value: "Русский" },
    { label: "Nederlands", value: "Nederlands" },
    { label: "Polski", value: "Polski" },
    { label: "Türkçe", value: "Türkçe" },
    { label: "Українська", value: "Українська" },
    { label: "Tiếng Việt", value: "Tiếng Việt" },
    { label: "ไทย", value: "ไทย" },
    { label: "Bahasa Indonesia", value: "Bahasa Indonesia" },
    { label: "العربية", value: "العربية" },
    { label: "हिन्दी", value: "हिन्दी" },
    { label: "Svenska", value: "Svenska" },
    { label: "Norsk", value: "Norsk" },
    { label: "Dansk", value: "Dansk" },
    { label: "Suomi", value: "Suomi" },
    { label: "Čeština", value: "Čeština" },
    { label: "Ελληνικά", value: "Ελληνικά" },
    { label: "Magyar", value: "Magyar" },
    { label: "Română", value: "Română" },
    { label: "Български", value: "Български" },
    { label: "Hrvatski", value: "Hrvatski" },
    { label: "Lietuvių", value: "Lietuvių" },
    { label: "Slovenščina", value: "Slovenščina" },
    { label: "Slovenčina", value: "Slovenčina" },
    { label: "עברית", value: "עברית" },
    { label: "বাংলা", value: "বাংলা" },
    { label: "தமிழ்", value: "தமிழ்" },
    { label: "Filipino", value: "Filipino" },
];

/** Map legacy free-text values (e.g. "中文") into the dropdown's values. */
function normalizeTargetLang(v: string): string | undefined {
    const trimmed = v.trim();
    if (!trimmed) return undefined;
    const found = TARGET_LANG_OPTIONS.find(o => o.value === trimmed);
    if (found) return found.value;
    // Legacy synonyms.
    if (trimmed === "中文" || trimmed === "简体中文" || trimmed === "zh-CN" || trimmed === "zh") return "简体中文";
    if (trimmed === "繁体中文" || trimmed === "zh-TW" || trimmed === "zh-HK") return "繁體中文";
    if (/^english|^en$/i.test(trimmed)) return "English";
    if (/^japanese|^ja$/i.test(trimmed)) return "日本語";
    if (/^korean|^ko$/i.test(trimmed)) return "한국어";
    return undefined;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const settings = definePluginSettings({
    targetLang: {
        type: OptionType.SELECT,
        // getters (not plain strings!) so the UI language is read when the
        // settings page renders — LocaleStore is only ready by then.
        get displayName() { return tr2("翻译目标语言", "Translate to"); },
        get description() {
            return tr2(
                "核心设置：要把消息翻译成什么语言。默认「跟随 Discord 界面语言」会随你客户端的界面语言自动切换；也可直接选一个固定语言。",
                "Core setting: which language messages are translated into. The default \"Follow Discord UI language\" follows your client's UI language; you can also pick a fixed language."
            );
        },
        options: TARGET_LANG_OPTIONS,
    },
    apiKey: {
        type: OptionType.STRING,
        displayName: "API Key",
        get description() {
            return tr2(
                "你的 AI 服务商 API Key。仅保存在你本机（Vencord 设置）中，不会上传到任何第三方服务器。",
                "Your AI provider API key. Stored only in your local Vencord settings; never uploaded anywhere."
            );
        },
        default: "",
        placeholder: "sk-...",
    },
    baseUrl: {
        type: OptionType.STRING,
        displayName: "API Base URL",
        get description() {
            return tr2(
                "OpenAI 兼容接口地址。留空则使用 OpenAI 官方。例如：" +
                "DeepSeek: https://api.deepseek.com/v1；" +
                "通义千问: https://dashscope.aliyuncs.com/compatible-mode/v1；" +
                "本地: http://localhost:11434/v1",
                "OpenAI-compatible API base URL. Leave empty for OpenAI. E.g. " +
                "DeepSeek: https://api.deepseek.com/v1, " +
                "Qwen: https://dashscope.aliyuncs.com/compatible-mode/v1, " +
                "local: http://localhost:11434/v1"
            );
        },
        default: "",
        placeholder: "https://api.deepseek.com/v1",
    },
    model: {
        type: OptionType.STRING,
        displayName: "Model",
        get description() {
            return tr2(
                "模型名称，例如 gpt-4o-mini / deepseek-chat / qwen-plus。",
                "Model name, e.g. gpt-4o-mini / deepseek-chat / qwen-plus."
            );
        },
        default: "gpt-4o-mini",
        placeholder: "gpt-4o-mini",
    },
    autoTranslate: {
        type: OptionType.BOOLEAN,
        get displayName() { return tr2("自动翻译消息", "Auto-translate messages"); },
        get description() {
            return tr2(
                "自动翻译屏幕上显示的外语消息（无需手动点击）。",
                "Automatically translate foreign messages shown on screen (no clicking needed)."
            );
        },
        default: true,
    },
    translateHistory: {
        type: OptionType.BOOLEAN,
        get displayName() { return tr2("翻译历史消息", "Translate history"); },
        get description() {
            return tr2(
                "同时自动翻译屏幕上已经发送的历史消息（切频道、上翻聊天记录时自动识别）。关闭则只翻译新收到的消息。",
                "Also auto-translate historical messages already on screen (open channel / scroll up). Off = only translate newly received messages."
            );
        },
        default: true,
    },
    autoDetect: {
        type: OptionType.BOOLEAN,
        get displayName() { return tr2("自动跳过目标语言", "Skip target language"); },
        get description() {
            return tr2(
                "自动跳过已经是目标语言的消息（仅当目标是中文时可用本地检测；其他语言交由 AI 判断）。关闭后始终请求 AI 翻译。",
                "Skip messages already in the target language (local check only works for Chinese; other languages are left to the AI). Off = always request a translation."
            );
        },
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
        throw new Error(tr2(
            "未设置 API Key，请在 AiTranslate 插件设置里填写。",
            "API Key is not set. Please configure it in the AiTranslate plugin settings."
        ));
    }

    const base = settings.store.baseUrl?.trim() || "https://api.openai.com/v1";
    const model = settings.store.model?.trim() || "gpt-4o-mini";
    const target = resolveTargetLang();

    const system =
        `You are a natural, fluent translator. Translate the user's message into ${target}. ` +
        `Output ONLY the translation with no extra text, quotes, explanations, or formatting. ` +
        `If the message is already in ${target}, reply with the exact same text unchanged. ` +
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
        throw new Error(tr2(
            `网络请求失败（无法连接 ${base}）：${raw || "请检查网络或 Base URL"}`,
            `Network request failed (could not reach ${base}): ${raw || "check your connection or Base URL"}`
        ));
    }

    if (status < 200 || status >= 300) {
        let detail = raw;
        try {
            const j = JSON.parse(raw);
            detail = j?.error?.message || detail;
        } catch { /* keep raw */ }
        throw new Error(tr2(
            `翻译请求失败 (HTTP ${status})：${detail || "未知错误"}`,
            `Translation request failed (HTTP ${status}): ${detail || "unknown error"}`
        ));
    }

    let data: any;
    try {
        data = JSON.parse(raw);
    } catch {
        throw new Error(tr2(
            "AI 返回了无法解析的数据。",
            "The AI returned unparseable data."
        ));
    }

    const translated: string | undefined = data?.choices?.[0]?.message?.content;

    if (typeof translated !== "string" || !translated.trim()) {
        throw new Error(tr2(
            "AI 未返回有效翻译内容。",
            "The AI returned no usable translation."
        ));
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
// Discord's message list is a *virtualized* list: message React components
// (and thus this accessory) are only mounted while the message is actually
// visible on screen. So the accessory's mount effect is the perfect "the
// user can see this message right now" signal.
//
// Strategy: whenever an accessory mounts, if auto-translation is enabled we
// check the message content and queue a translation unless:
//   - it is the user's own message,
//   - auto-detect says the text already is the target language,
//   - it was already translated (cached per message id),
//   - the user explicitly dismissed it.
//
// This covers BOTH freshly received messages AND historical messages that are
// already on screen when you open a channel or scroll up — the mount effect
// fires in every case. Results are cached per message id so scrolling away
// and back shows them instantly without re-billing the API.
// ---------------------------------------------------------------------------

// Ids of messages received via MESSAGE_CREATE (used to tell "new" from
// "historical" so the translateHistory setting can distinguish them).
const recentlyReceived = new Set<string>();
const RECENT_MAX = 300;
// Messages the user explicitly dismissed (messageId).
const dismissed = new Set<string>();
// Messages the AI confirmed are already in the target language (nothing to show).
const alreadyTarget = new Set<string>();
// Completed translations (messageId -> translated text), survives re-mounts.
const translatedCache = new Map<string, string>();
const CACHE_IDS_MAX = 300;

const inFlight = new Set<string>();
interface QueueItem {
    id: string;
    content: string;
    /** Message time (ms epoch). Newest-first ordering key. */
    time: number;
    /** Manual translations always jump to the front of the queue. */
    manual: boolean;
}
// Queue kept sorted newest-first, so the most recent message is translated
// first and older ones follow (bulk history loads translate top-down).
const requestQueue: QueueItem[] = [];
const queuedIds = new Set<string>();
let activeRequests = 0;
const MAX_CONCURRENT = 3;
// Queue saturation limit for AUTO translation (manual always bypasses).
// When history bulk-loads fill the queue past this, auto-translation pauses
// and retries later instead of dropping messages.
const MAX_AUTO_QUEUE = 40;
const AUTO_RETRY_MAX = 4;
const autoRetries = new Map<string, number>();
// Small delay so consecutive messages coalesce and the component is mounted.
const QUEUE_DELAY_MS = 350;

function dropOldest(setOrMap: Set<string> | Map<string, unknown>, max: number) {
    while (setOrMap.size > max) {
        const first = setOrMap instanceof Map
            ? setOrMap.keys().next().value
            : setOrMap.values().next().value;
        if (first === undefined) break;
        setOrMap.delete(first);
    }
}

function getMessageContent(message: Message): string {
    return message.content
        || message.messageSnapshots?.[0]?.message?.content
        || message.embeds?.find(embed => embed.type === "auto_moderation_message")?.rawDescription
        || "";
}

/** Epoch ms of a message; falls back to 0 for missing timestamps. */
function getMessageTime(message: Message): number {
    const ts = message?.timestamp;
    if (typeof ts === "string") {
        const t = Date.parse(ts);
        if (!Number.isNaN(t)) return t;
    }
    // Snowflake ids embed a timestamp — derive an approximate one.
    const raw = String(message?.id ?? "");
    if (/^\d{17,20}$/.test(raw)) {
        try {
            // Discord snowflake: (id >> 22) + DISCORD_EPOCH(1420070400000)
            return Number(BigInt(raw) >> 22n) + 1420070400000;
        } catch { /* fall through */ }
    }
    return 0;
}

function shouldSkipContent(content: string): boolean {
    if (!content) return true;
    if (!settings.store.autoDetect) return false;
    const target = resolveTargetLang();
    // Local heuristic only works reliably for Chinese targets (CJK detection).
    // For other target languages we leave detection to the AI model: the system
    // prompt tells it to echo the text back unchanged if it already is in the
    // target language, and doTranslateCore skips identical results.
    if (target.includes("中文")) return isCjk(content);
    return false;
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

        // Already confirmed as being in the target language -> do nothing.
        if (alreadyTarget.has(id)) {
            return () => void TranslationSetters.delete(id);
        }

        // 2. Auto-translate whatever is visible on screen.
        if (settings.store.autoTranslate && !dismissed.has(id)) {
            // Own messages are never auto-translated (right-click still works).
            const selfId = UserStore?.getCurrentUser()?.id;
            if (selfId && message.author?.id === selfId) {
                return () => void TranslationSetters.delete(id);
            }

            const isNew = recentlyReceived.has(id);
            if (isNew || settings.store.translateHistory) {
                const content = getMessageContent(message);
                if (content && !shouldSkipContent(content)) {
                    scheduleTranslate(id, content, getMessageTime(message), false);
                }
            }
        }

        return () => void TranslationSetters.delete(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [message.id]);

    if (!translation) return null;

    return (
        <span className={cl("accessory")}>
            <span className={cl("badge")}>{tr("badge")}</span>
            {Parser.parse(translation)}
            <span
                className={cl("dismiss")}
                onClick={() => {
                    setTranslation(undefined);
                    dismissed.add(message.id);
                    translatedCache.delete(message.id);
                }}
                role="button"
                aria-label={tr("dismiss")}
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

        // The AI may echo the message back unchanged when it is already in the
        // target language (non-Chinese targets, where local detection can't
        // decide). In that case there is nothing to display — mark it as done
        // so we don't re-request it, but don't render a useless duplicate.
        if (text === content) {
            alreadyTarget.add(id);
            dropOldest(alreadyTarget, CACHE_IDS_MAX);
            return;
        }

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

/**
 * Insert into the queue keeping it sorted newest-first:
 *  - manual translations always go first (user explicitly asked);
 *  - everything else is ordered by message time, newest at the head.
 * Discord message ids are monotonic, so newer ids = newer messages.
 */
function insertQueueItem(item: QueueItem) {
    let index = 0;
    if (item.manual) {
        // Prepend: manual items skip the entire queue.
        requestQueue.unshift(item);
        return;
    }
    for (; index < requestQueue.length; index++) {
        const existing = requestQueue[index];
        // Skip manual items already sitting at the head (never behind them).
        if (existing.manual) continue;
        if (item.time > existing.time) break;
    }
    requestQueue.splice(index, 0, item);
}

function scheduleTranslate(id: string, content: string, time: number, isManual: boolean) {
    // Already translated / in-flight / queued -> skip.
    if (translatedCache.has(id) || inFlight.has(id) || queuedIds.has(id)) return;
    if (dismissed.has(id) && !isManual) return;
    if (alreadyTarget.has(id) && !isManual) return;

    // Auto queue is saturated (bulk history load): retry a few times later
    // instead of silently dropping messages the user can see.
    if (!isManual && requestQueue.length >= MAX_AUTO_QUEUE) {
        const retries = autoRetries.get(id) ?? 0;
        if (retries < AUTO_RETRY_MAX) {
            autoRetries.set(id, retries + 1);
            setTimeout(() => {
                autoRetries.delete(id);
                scheduleTranslate(id, content, time, false);
            }, 2000 * (retries + 1));
        }
        return;
    }
    autoRetries.delete(id);

    queuedIds.add(id);
    setTimeout(() => {
        queuedIds.delete(id);
        if (translatedCache.has(id) || inFlight.has(id)) return;
        if (!isManual && requestQueue.length >= MAX_AUTO_QUEUE) {
            // Re-run the retry logic above.
            scheduleTranslate(id, content, time, false);
            return;
        }
        insertQueueItem({ id, content, time, manual: isManual });
        pumpQueue();
    }, QUEUE_DELAY_MS);
}

/** Manual translate (context menu / right-click). Always allowed. */
function handleTranslate(message: Message) {
    const content = getMessageContent(message);
    if (!content) return;

    dismissed.delete(message.id);
    translatedCache.delete(message.id);
    alreadyTarget.delete(message.id);
    // Manual requests are marked manual=true so they jump the queue.
    scheduleTranslate(message.id, content, getMessageTime(message), true);
}

/** Localised context-menu label, e.g. "翻译成简体中文" / "Translate to English". */
function translateMenuLabel(): string {
    return tr("menuTranslateTo").replace("{lang}", resolveTargetLang());
}

// ---------------------------------------------------------------------------
// Plugin definition
// ---------------------------------------------------------------------------

export default definePlugin({
    name: "AiTranslate",
    // getter so the description follows the Discord UI language at render time
    get description() {
        return tr2(
            "使用 AI（OpenAI 兼容接口，需自备 API Key）自动把消息翻译成你的 Discord 界面语言，" +
            "翻译以浮层形式显示在原文下方，绝不改动原始消息。",
            "Auto-translates messages into your Discord UI language using an OpenAI-compatible API " +
            "(bring your own key). Translations appear as an overlay below the original message; " +
            "original messages are never modified."
        );
    },
    authors: [{ name: "Albert Smith", id: 0n }],
    tags: ["Chat", "Translate", "AI", "Translation"],

    settings,

    // Right-click a message -> translate (label follows the UI language)
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
                    label={translateMenuLabel()}
                    icon={TranslateIcon}
                    leadingAccessory={{ type: "icon", icon: TranslateIcon }}
                    action={() => void handleTranslate(message)}
                />
            ));
        },
    },

    // Render the translation overlay below every message.
    renderMessageAccessory: props => <TranslationAccessory message={props.message} />,

    // Mark messages that just arrived (vs. history loaded from the store) so
    // the accessory's mount effect can honour the "translateHistory" setting.
    // If the accessory is already mounted, kick off the translation directly.
    flux: {
        MESSAGE_CREATE({ message }: { message: Message }) {
            if (!message) return;

            recentlyReceived.add(message.id);
            dropOldest(recentlyReceived, RECENT_MAX);

            if (!settings.store.autoTranslate) return;
            if (translatedCache.has(message.id) || inFlight.has(message.id)) return;
            if (alreadyTarget.has(message.id)) return;

            // Mounted already -> translate now.
            if (TranslationSetters.has(message.id)) {
                const content = getMessageContent(message);
                if (!content) return;

                const selfId = UserStore?.getCurrentUser()?.id;
                if (selfId && message.author?.id === selfId) return;
                if (shouldSkipContent(content)) return;

                scheduleTranslate(message.id, content, getMessageTime(message), false);
            }
        },
    },
});
