import type { ServerWebSocket } from "bun";
import { verifyJwt, type JwtPayload } from "../../auth/jwt";
import { getAccountByIdAndUser } from "../../db/accounts";
import { logger } from "../logger";
import { processEvent } from "../engine";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProxyData {
	accountId: string;
	userId: string;
	port: number;
}

// ─── State ────────────────────────────────────────────────────────────────────

const upstreams = new Map<string, WebSocket>();
const subscribers = new Map<string, Set<ServerWebSocket<ProxyData>>>();

// ─── Config ───────────────────────────────────────────────────────────────────

const UPSTREAM_RETRY_DELAY = 500; // ms between retries
const UPSTREAM_MAX_RETRIES = 20; // 20 * 500ms = 10s total

// ─── Upstream connection ──────────────────────────────────────────────────────

function openUpstream(accountId: string, port: number): WebSocket {
	const ws = new WebSocket(`ws://localhost:${port}/ws`);

	ws.onopen = () => {
		logger.trace(
			`[proxy] upstream connected for account ${accountId} on port ${port}`,
		);
	};

	ws.onmessage = (event) => {
		const data = event.data as string;

		processEvent(accountId, data).catch((err) =>
			logger.error(`[proxy] engine error for account ${accountId}:`, err),
		);

		const subs = subscribers.get(accountId);
		if (!subs) return;
		for (const client of subs) {
			if (client.readyState === WebSocket.OPEN) {
				client.send(data);
			}
		}
	};

	ws.onclose = () => {
		upstreams.delete(accountId);
		const subs = subscribers.get(accountId);
		if (!subs) return;
		for (const client of subs) {
			client.send(JSON.stringify({ type: "upstream_closed", accountId }));
			client.close(1001, "upstream closed");
		}
		subscribers.delete(accountId);
	};

	ws.onerror = () => {
		// onerror always fires before onclose — onclose handles cleanup
		logger.warn(`[proxy] upstream connection failed for account ${accountId}`);
	};

	upstreams.set(accountId, ws);
	return ws;
}

// src/ws/proxy.ts — replace connectUpstreamWithRetry

async function connectUpstreamWithRetry(
	accountId: string,
	port: number,
): Promise<void> {
	for (let attempt = 1; attempt <= UPSTREAM_MAX_RETRIES; attempt++) {
		const existing = upstreams.get(accountId);
		if (existing && existing.readyState === WebSocket.OPEN) return;

		logger.trace(
			`[proxy] upstream attempt ${attempt}/${UPSTREAM_MAX_RETRIES} for account ${accountId}`,
		);

		const connected = await new Promise<boolean>((resolve) => {
			const probe = new WebSocket(`ws://localhost:${port}/ws`);
			const timer = setTimeout(() => {
				probe.terminate();
				resolve(false);
			}, 400);

			probe.onopen = () => {
				clearTimeout(timer);
				// Hand off to the real upstream handler
				upstreams.set(accountId, probe);

				probe.onmessage = (event) => {
					const data = event.data as string;
					processEvent(accountId, data).catch((err) =>
						logger.error(`[proxy] engine error for account ${accountId}:`, err),
					);
					const subs = subscribers.get(accountId);
					if (!subs) return;
					for (const client of subs) {
						if (client.readyState === WebSocket.OPEN) client.send(data);
					}
				};

				probe.onclose = () => {
					upstreams.delete(accountId);
					const subs = subscribers.get(accountId);
					if (!subs) return;
					for (const client of subs) {
						client.send(JSON.stringify({ type: "upstream_closed", accountId }));
						client.close(1001, "upstream closed");
					}
					subscribers.delete(accountId);
				};

				probe.onerror = () => {
					logger.warn(`[proxy] upstream error for account ${accountId}`);
				};

				logger.trace(
					`[proxy] upstream connected for account ${accountId} on port ${port}`,
				);
				resolve(true);
			};

			probe.onerror = () => {
				clearTimeout(timer);
				resolve(false);
			};
		});

		if (connected) return;

		await Bun.sleep(UPSTREAM_RETRY_DELAY);
	}

	logger.error(
		`[proxy] gave up connecting upstream for account ${accountId} after ${UPSTREAM_MAX_RETRIES} attempts`,
	);

	const subs = subscribers.get(accountId);
	if (!subs) return;
	for (const client of subs) {
		client.send(
			JSON.stringify({ type: "error", message: "zevBot failed to start" }),
		);
		client.close(1001, "upstream timeout");
	}
	subscribers.delete(accountId);
}

// ─── Bun WS handlers ─────────────────────────────────────────────────────────

export const wsProxy = {
	async upgrade(
		req: Request,
		server: Bun.Server<ProxyData>,
	): Promise<Response | undefined> {
		const url = new URL(req.url);

		const segments = url.pathname.split("/").filter(Boolean);
		if (segments[0] !== "ws" || !segments[1]) {
			return new Response("Not found", { status: 404 });
		}
		const accountId = segments[1];

		const token =
			url.searchParams.get("token") ??
			req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
			null;

		if (!token) {
			return new Response("Unauthorized", { status: 401 });
		}

		let payload: JwtPayload;
		try {
			payload = await verifyJwt(token);
		} catch {
			return new Response("Unauthorized: invalid token", { status: 401 });
		}

		const account = await getAccountByIdAndUser(accountId, payload.userId);
		if (!account) {
			return new Response("Forbidden", { status: 403 });
		}

		if (account.status === "disconnected") {
			return new Response("Account disconnected", { status: 409 });
		}

		const upgraded = server.upgrade(req, {
			data: {
				accountId,
				userId: payload.userId,
				port: account.port, // ← no longer passing upstream here
			} satisfies ProxyData,
		});

		if (!upgraded) {
			return new Response("WebSocket upgrade failed", { status: 500 });
		}

		return undefined;
	},

	open(ws: ServerWebSocket<ProxyData>) {
		const { accountId, port } = ws.data;

		if (!subscribers.has(accountId)) {
			subscribers.set(accountId, new Set());
		}
		subscribers.get(accountId)!.add(ws);

		logger.trace(
			`[proxy] client connected → account ${accountId} ` +
				`(${subscribers.get(accountId)!.size} subscriber(s))`,
		);

		ws.send(JSON.stringify({ type: "connected", accountId }));

		// Kick off retry loop in background — don't block
		connectUpstreamWithRetry(accountId, port).catch((err) =>
			logger.error(`[proxy] retry loop error for account ${accountId}:`, err),
		);
	},

	message(ws: ServerWebSocket<ProxyData>, message: string | Buffer) {
		const { accountId } = ws.data;
		const upstream = upstreams.get(accountId);

		if (!upstream || upstream.readyState !== WebSocket.OPEN) {
			ws.send(
				JSON.stringify({ type: "error", message: "upstream not connected" }),
			);
			return;
		}

		upstream.send(message as string);
	},

	close(ws: ServerWebSocket<ProxyData>) {
		const { accountId } = ws.data;
		const subs = subscribers.get(accountId);

		if (subs) {
			subs.delete(ws);
			if (subs.size === 0) {
				subscribers.delete(accountId);
				const up = upstreams.get(accountId);
				if (up && up.readyState === WebSocket.OPEN) {
					up.close();
					upstreams.delete(accountId);
				}
			}
		}

		logger.trace(`[proxy] client disconnected from account ${accountId}`);
	},

	error(ws: ServerWebSocket<ProxyData>, error: Error) {
		logger.error(
			error,
			`[proxy] client error on account ${ws.data.accountId}:`,
		);
	},
};
