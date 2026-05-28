import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = ({ request, url }) => {
	const upgradeHeader = request.headers.get("upgrade");

	if (upgradeHeader !== "websocket") {
		return new Response("Expected websocket", { status: 400 });
	}

	const accountId = url.searchParams.get("accountId");
	const token = url.searchParams.get("token");

	if (!accountId || !token) {
		return new Response("Missing accountId or token", { status: 400 });
	}

	const { socket: clientSocket, response } = Deno.upgradeWebSocket(request);

	const upstream = new WebSocket(
		`ws://localhost:8080/ws/${accountId}?token=${token}`,
	);

	upstream.onmessage = (e: MessageEvent) => {
		if (clientSocket.readyState === WebSocket.OPEN) {
			clientSocket.send(e.data);
		}
	};

	upstream.onclose = (e: CloseEvent) => {
		if (clientSocket.readyState === WebSocket.OPEN) {
			clientSocket.close(e.code, e.reason);
		}
	};

	upstream.onerror = () => {
		if (clientSocket.readyState === WebSocket.OPEN) {
			clientSocket.close(1011, "Upstream error");
		}
	};

	clientSocket.onmessage = (e: MessageEvent) => {
		if (upstream.readyState === WebSocket.OPEN) {
			upstream.send(e.data);
		}
	};

	clientSocket.onclose = (e: CloseEvent) => {
		if (upstream.readyState === WebSocket.OPEN) {
			upstream.close(e.code, e.reason);
		}
	};

	return response;
};
