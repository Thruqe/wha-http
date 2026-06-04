import type { ServerWebSocket } from "bun";
import { verifyJwt, type JwtPayload } from "../../auth/jwt";
import { getAccountByIdAndUser } from "../../db/accounts";
import { logger } from "../logger";
import { processEvent } from "../engine";

interface ProxyData {
    accountId: string;
    userId: string;
    port: number;
}

type ControlType = "send_message" | "disconnect" | "logout" | "get_status";

type EventType =
    | "pair_qr"
    | "pair_code"
    | "pair_success"
    | "pair_error"
    | "logged_out"
    | "disconnected"
    | "ack"
    | "connected"
    | "upstream_closed"
    | "error";

interface ControlMessage {
    type: ControlType;
    id: string;
    payload: Record<string, unknown>;
}

interface EventMessage {
    type: EventType;
    id?: string;
    payload: Record<string, unknown>;
}

function sendEvent(
    ws: ServerWebSocket<ProxyData>,
    type: EventType,
    payload: Record<string, unknown> = {},
    id?: string,
): void {
    const msg: EventMessage = { type, payload };
    if (id) msg.id = id;
    ws.send(JSON.stringify(msg));
}

function broadcastEvent(
    subs: Set<ServerWebSocket<ProxyData>>,
    type: EventType,
    payload: Record<string, unknown> = {},
): void {
    const msg: EventMessage = { type, payload };
    const json = JSON.stringify(msg);
    for (const client of subs) {
        if (client.readyState === WebSocket.OPEN) client.send(json);
    }
}

function parseControl(raw: string): ControlMessage | null {
    try {
        const msg = JSON.parse(raw);
        if (typeof msg.type === "string" && typeof msg.id === "string") {
            return msg as ControlMessage;
        }
        return null;
    } catch {
        return null;
    }
}

const upstreams = new Map<string, WebSocket>();
const subscribers = new Map<string, Set<ServerWebSocket<ProxyData>>>();

const UPSTREAM_RETRY_DELAY = 500;
const UPSTREAM_MAX_RETRIES = 20;

async function Upstream(accountId: string, port: number): Promise<void> {
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
                upstreams.set(accountId, probe);

                probe.onmessage = (event) => {
                    const raw = event.data as string;

                    // Pass to automation engine
                    processEvent(accountId, raw).catch((err) =>
                        logger.error(
                            `[proxy] engine error for account ${accountId}:`,
                            err,
                        ),
                    );

                    // Forward structured event to all subscribers as-is
                    // (already valid EventMessage JSON from zevBot)
                    const subs = subscribers.get(accountId);
                    if (!subs) return;
                    for (const client of subs) {
                        if (client.readyState === WebSocket.OPEN)
                            client.send(raw);
                    }
                };

                probe.onclose = () => {
                    upstreams.delete(accountId);
                    const subs = subscribers.get(accountId);
                    if (!subs) return;
                    broadcastEvent(subs, "upstream_closed", { accountId });
                    for (const client of subs)
                        client.close(1001, "upstream closed");
                    subscribers.delete(accountId);
                };

                probe.onerror = () => {
                    logger.warn(
                        `[proxy] upstream error for account ${accountId}`,
                    );
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
    broadcastEvent(subs, "error", { message: "zevBot failed to start" });
    for (const client of subs) client.close(1001, "upstream timeout");
    subscribers.delete(accountId);
}

// ── Proxy handlers ───────────────────────────────────────────────────────────

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

        if (!token) return new Response("Unauthorized", { status: 401 });

        let payload: JwtPayload;
        try {
            payload = await verifyJwt(token);
        } catch {
            return new Response("Unauthorized: invalid token", { status: 401 });
        }

        const account = await getAccountByIdAndUser(accountId, payload.userId);
        if (!account) return new Response("Forbidden", { status: 403 });

        if (account.status === "disconnected") {
            return new Response("Account disconnected", { status: 409 });
        }

        const upgraded = server.upgrade(req, {
            data: {
                accountId,
                userId: payload.userId,
                port: account.port,
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

        // Notify client it's connected using structured format
        sendEvent(ws, "connected", { accountId });

        Upstream(accountId, port).catch((err) =>
            logger.error(
                `[proxy] retry loop error for account ${accountId}:`,
                err,
            ),
        );
    },

    message(ws: ServerWebSocket<ProxyData>, message: string | Buffer) {
        const { accountId } = ws.data;
        const upstream = upstreams.get(accountId);

        if (!upstream || upstream.readyState !== WebSocket.OPEN) {
            sendEvent(ws, "error", { message: "upstream not connected" });
            return;
        }

        // Validate it's a well-formed ControlMessage before forwarding
        const raw = message as string;
        const ctrl = parseControl(raw);

        if (!ctrl) {
            sendEvent(ws, "error", { message: "invalid message format" });
            return;
        }

        logger.trace(
            `[proxy] forwarding control type="${ctrl.type}" id="${ctrl.id}" → account ${accountId}`,
        );

        upstream.send(raw);
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
