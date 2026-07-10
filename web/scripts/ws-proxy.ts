import type { ServerWebSocket, WebSocketHandler } from "bun";

const UPSTREAM = "ws://localhost:8080";

interface WebSocketData {
	accountId: string;
	token: string;
	upstream?: WebSocket;
}

Bun.serve<WebSocketData>({
	port: 4322,
	fetch(req, server) {
		const url = new URL(req.url);
		const accountId = url.searchParams.get("accountId");
		const token = url.searchParams.get("token");

		if (!accountId || !token) {
			return new Response("Missing params", { status: 400 });
		}

		const upgraded = server.upgrade(req, { data: { accountId, token } });
		if (upgraded) return;

		return new Response("Expected websocket", { status: 426 });
	},
	websocket: {
		data: {} as WebSocketData,
		open(ws) {
			const { accountId, token } = ws.data;
			const upstream = new WebSocket(
				`${UPSTREAM}/ws/${accountId}?token=${token}`,
			);

			upstream.onmessage = (e: MessageEvent) => {
				ws.send(e.data);
			};

			upstream.onclose = (e: CloseEvent) => {
				ws.close(e.code, e.reason);
			};

			upstream.onerror = () => {
				ws.close(1011, "Upstream error");
			};

			ws.data.upstream = upstream;
		},
		message(ws, msg) {
			const upstream = ws.data.upstream;
			if (upstream?.readyState === WebSocket.OPEN) {
				upstream.send(msg);
			}
		},
		close(ws, code, reason) {
			const upstream = ws.data.upstream;
			if (upstream?.readyState === WebSocket.OPEN) {
				upstream.close(code, reason);
			}
		},
	} satisfies WebSocketHandler<WebSocketData>,
});

console.log("[ws-proxy] listening on ws://localhost:4322");
