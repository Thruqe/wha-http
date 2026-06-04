import { eq } from "drizzle-orm";
import { db } from "../../db/index";
import { hooks } from "../../db/schema";
import { logger } from "..";

type EventType =
    | "pair_qr"
    | "pair_code"
    | "pair_success"
    | "pair_error"
    | "logged_out"
    | "disconnected"
    | "ack";

interface EventPayload extends Record<string, unknown> {}

export interface ZevBotEvent {
    type: EventType;
    id?: string;
    payload: EventPayload;
}

interface WebhookAction {
    targetUrl: string;
    secret?: string | null;
}

async function deliverWebhook(
    webhook: WebhookAction,
    accountId: string,
    event: ZevBotEvent,
): Promise<void> {
    const body = JSON.stringify({ accountId, event });
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "User-Agent": "wha-http/1.0",
    };

    if (webhook.secret) {
        const key = await crypto.subtle.importKey(
            "raw",
            new TextEncoder().encode(webhook.secret),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"],
        );
        const sig = await crypto.subtle.sign(
            "HMAC",
            key,
            new TextEncoder().encode(body),
        );
        headers["X-WHA-Signature"] = Buffer.from(sig).toString("hex");
    }

    try {
        const res = await fetch(webhook.targetUrl, {
            method: "POST",
            headers,
            body,
            signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) {
            logger.warn(
                `[engine] webhook ${webhook.targetUrl} responded ${res.status}`,
            );
        } else {
            logger.info(
                `[engine] webhook delivered → ${webhook.targetUrl} (${res.status})`,
            );
        }
    } catch (err) {
        logger.error(
            err,
            `[engine] webhook delivery failed → ${webhook.targetUrl}:`,
        );
    }
}

// Proxy/internal events that should not be forwarded to webhooks
const INTERNAL_EVENTS = new Set<string>([
    "ack",
    "connected",
    "upstream_closed",
    "error",
]);

function parseEvent(raw: string): ZevBotEvent | null {
    try {
        const msg = JSON.parse(raw);
        if (typeof msg.type === "string" && "payload" in msg) {
            return msg as ZevBotEvent;
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Called for every event received from a zevBot instance.
 * Fans out to all hooks configured for the account.
 */
export async function processEvent(
    accountId: string,
    raw: string,
): Promise<void> {
    const event = parseEvent(raw);

    if (!event) {
        logger.warn(
            `[engine] unparseable event for account ${accountId}: ${raw}`,
        );
        return;
    }

    logger.info(event, `[engine] event for account ${accountId}:`);

    // Don't forward internal/proxy events to webhooks
    if (INTERNAL_EVENTS.has(event.type)) {
        logger.trace(`[engine] skipping internal event type="${event.type}"`);
        return;
    }

    const accountHooks = await db
        .select()
        .from(hooks)
        .where(eq(hooks.waAccountId, accountId));

    if (accountHooks.length === 0) return;

    logger.info(`[engine] delivering to ${accountHooks.length} hook(s)`);

    await Promise.allSettled(
        accountHooks.map((hook) =>
            deliverWebhook(
                { targetUrl: hook.targetUrl, secret: hook.secret },
                accountId,
                event,
            ),
        ),
    );
}
