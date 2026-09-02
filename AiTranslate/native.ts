/*
 * AiTranslate - native (main process) network helpers.
 *
 * Discord's desktop renderer blocks cross-origin fetch via CORS/CSP, which is
 * why plain fetch() to your AI provider fails with "Failed to fetch".
 * This file runs in the Electron MAIN process (Node.js), where no such
 * restriction exists. Vencord auto-discovers this file and bridges every
 * export over IPC as VencordNative.pluginHelpers.AiTranslate.<name>.
 *
 * License: MIT
 */

import { IpcMainInvokeEvent } from "electron";

export interface NativeChatRequest {
    url: string;
    apiKey: string;
    model: string;
    system: string;
    user: string;
}

export interface NativeChatResponse {
    /** HTTP status; -1 means the request itself failed (network/DNS/TLS) */
    status: number;
    /** Raw response text when status >= 0, otherwise the error message */
    data: string;
}

/**
 * POST a Chat Completions request from the main process, avoiding CORS.
 * Returns { status, data } so callers never need to deal with thrown IPC
 * errors for expected failures (bad key, quota, 5xx, offline...).
 */
export async function makeChatRequest(_: IpcMainInvokeEvent, req: NativeChatRequest): Promise<NativeChatResponse> {
    try {
        const res = await fetch(req.url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${req.apiKey}`,
            },
            body: JSON.stringify({
                model: req.model,
                temperature: 0.2,
                messages: [
                    { role: "system", content: req.system },
                    { role: "user", content: req.user },
                ],
            }),
        });

        const data = await res.text();
        return { status: res.status, data };
    } catch (e) {
        return { status: -1, data: String(e instanceof Error ? e.message : e) };
    }
}
