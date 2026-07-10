import { wsProxy, logger } from "./util";
import {
	me,
	login,
	register,
	listAccounts,
	addAccount,
	getAccount,
	removeAccount,
	stopAccount,
	restartAccount,
	listHooks,
	createHook,
	deleteHook,
} from "./routes";

function notFound() {
	return new Response(JSON.stringify({ error: "Not found" }), {
		status: 404,
		headers: { "Content-Type": "application/json" },
	});
}

Bun.serve({
	port: process.env.PORT ?? 8080,

	async fetch(req, server) {
		const url = new URL(req.url);
		const method = req.method;

		// ─ WS upgrade
		if (url.pathname.startsWith("/ws/")) {
			return wsProxy.upgrade(req, server);
		}

		// ─ Auth
		if (url.pathname === "/auth/register" && method === "POST")
			return register(req);
		if (url.pathname === "/auth/login" && method === "POST") return login(req);
		if (url.pathname === "/auth/me" && method === "GET") return me(req);

		// ─ Accounts
		if (url.pathname === "/accounts" && method === "GET")
			return listAccounts(req);
		if (url.pathname === "/accounts" && method === "POST")
			return addAccount(req);

		const accountMatch = url.pathname.match(/^\/accounts\/([^/]+)(\/(\w+))?$/);
		if (accountMatch) {
			const accountId = accountMatch?.[1]!;
			const action = accountMatch?.[3];

			if (method === "GET" && !action) return getAccount(req, accountId);
			if (method === "DELETE" && !action) return removeAccount(req, accountId);
			if (method === "POST" && action === "stop")
				return stopAccount(req, accountId);
			if (method === "POST" && action === "restart")
				return restartAccount(req, accountId);
		}

		// ─ Hooks
		const hookMatch = url.pathname.match(
			/^\/accounts\/([^/]+)\/hooks(\/([^/]+))?$/,
		);
		if (hookMatch) {
			const accountId = hookMatch?.[1]!;
			const hookId = hookMatch[3];

			if (method === "GET" && !hookId) return listHooks(req, accountId);
			if (method === "POST" && !hookId) return createHook(req, accountId);
			if (method === "DELETE" && hookId)
				return deleteHook(req, accountId, hookId);
		}

		return notFound();
	},

	websocket: wsProxy,
});

logger.info(`[WHA-HTTP] listening on port ${process.env.PORT ?? 8080}`);
