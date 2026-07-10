import { randomUUID } from "crypto";
import { authenticate } from "../auth";
import {
	allocatePort,
	createAccount,
	deleteAccount,
	getAccountByIdAndUser,
	getAccountsByUser,
	updateAccountStatus,
} from "../db/accounts";
import * as zevbot from "../cli/zevbot";

function json(data: unknown, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

// GET /accounts
export async function listAccounts(req: Request): Promise<Response> {
	try {
		const { userId } = await authenticate(req);
		const accounts = await getAccountsByUser(userId);
		return json(accounts);
	} catch (e: any) {
		return json({ error: e.message }, e.status ?? 500);
	}
}

// POST /accounts
// Body: { phone: string, mode: "qr" | "pair", pairPhone?: string }
export async function addAccount(req: Request): Promise<Response> {
	try {
		const { userId } = await authenticate(req);

		let body: { phone?: string; mode?: string; pairPhone?: string };
		try {
			body = (await req.json()) as any;
		} catch {
			return json({ error: "Invalid JSON" }, 400);
		}

		const { phone, mode = "qr", pairPhone } = body;

		if (!phone) {
			return json({ error: "phone is required" }, 400);
		}

		if (mode === "pair" && !pairPhone) {
			return json({ error: "pairPhone is required for pair mode" }, 400);
		}

		// Check if already exists
		const running = await zevbot.isRunning(phone);
		if (running) {
			return json({ error: "Account already running" }, 409);
		}

		// Allocate a free port
		const port = await allocatePort();

		// Save to DB first so the WS proxy can find it
		const account = await createAccount({
			id: randomUUID(),
			userId,
			phone,
			port,
			status: mode === "pair" ? "pending_pair" : "pending_qr",
		});

		// Spawn zevBot instance
		if (mode === "pair" && pairPhone) {
			await zevbot.startWithPairCode({
				session: phone,
				port,
				pairPhone,
				force: false,
			});
		} else {
			await zevbot.startWithQr({ session: phone, port, force: false });
		}

		return json({ account }, 201);
	} catch (e: any) {
		return json({ error: e.message }, e.status ?? 500);
	}
}

// GET /accounts/:id
export async function getAccount(
	req: Request,
	accountId: string,
): Promise<Response> {
	try {
		const { userId } = await authenticate(req);
		const account = await getAccountByIdAndUser(accountId, userId);
		if (!account) return json({ error: "Account not found" }, 404);

		// Enrich with live rpm status
		const process = await zevbot.get(account.phone);

		return json({ account, process });
	} catch (e: any) {
		return json({ error: e.message }, e.status ?? 500);
	}
}

// DELETE /accounts/:id
export async function removeAccount(
	req: Request,
	accountId: string,
): Promise<Response> {
	try {
		const { userId } = await authenticate(req);
		const account = await getAccountByIdAndUser(accountId, userId);
		if (!account) return json({ error: "Account not found" }, 404);

		// Stop and remove from rpm, clear auth files
		await zevbot.logout(account.phone);

		// Remove from DB
		await deleteAccount(accountId);

		return json({ ok: true });
	} catch (e: any) {
		return json({ error: e.message }, e.status ?? 500);
	}
}

// POST /accounts/:id/stop
export async function stopAccount(
	req: Request,
	accountId: string,
): Promise<Response> {
	try {
		const { userId } = await authenticate(req);
		const account = await getAccountByIdAndUser(accountId, userId);
		if (!account) return json({ error: "Account not found" }, 404);

		await zevbot.stop(account.phone);
		await updateAccountStatus(accountId, "disconnected");

		return json({ ok: true });
	} catch (e: any) {
		return json({ error: e.message }, e.status ?? 500);
	}
}

// POST /accounts/:id/restart
export async function restartAccount(
	req: Request,
	accountId: string,
): Promise<Response> {
	try {
		const { userId } = await authenticate(req);
		const account = await getAccountByIdAndUser(accountId, userId);
		if (!account) return json({ error: "Account not found" }, 404);

		await zevbot.restart(account.phone);
		await updateAccountStatus(accountId, "pending_qr");

		return json({ ok: true });
	} catch (e: any) {
		return json({ error: e.message }, e.status ?? 500);
	}
}
