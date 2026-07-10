import { eq } from "drizzle-orm";
import { db } from "../../db/index";
import { hooks } from "../../db/schema";
import { logger } from "..";

export interface ZevBotEvent {
	tag?: string;
	type?: string;
	content?: unknown[];
	[key: string]: unknown;
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

	// Sign payload with secret when configured
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
			signal: AbortSignal.timeout(10_000), // 10s timeout
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

/**
 * Called for every event received from a zevBot instance.
 * Fans out to all hooks configured for the account.
 */
export async function processEvent(
	accountId: string,
	rawEvent: any,
): Promise<void> {
	let event: ZevBotEvent;

	try {
		event = JSON.parse(rawEvent);
	} catch {
		event = { tag: "raw", type: "string", content: rawEvent };
	}

	logger.info(event, `[engine] event for account ${accountId}:`);

	// Fetch all hooks for this account
	const accountHooks = await db
		.select()
		.from(hooks)
		.where(eq(hooks.waAccountId, accountId));

	if (accountHooks.length === 0) return;

	logger.info(`[engine] delivering to ${accountHooks.length} hook(s)`);

	// Deliver to all hooks concurrently
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
