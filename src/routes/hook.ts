import { randomUUID } from "crypto";
import { eq, and } from "drizzle-orm";
import { authenticate } from "../auth/";
import { db, hooks, getAccountByIdAndUser } from "../db/index";

function json(data: unknown, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

// GET /accounts/:accountId/hooks
export async function listHooks(
	req: Request,
	accountId: string,
): Promise<Response> {
	try {
		const { userId } = await authenticate(req);
		const account = await getAccountByIdAndUser(accountId, userId);
		if (!account) return json({ error: "Account not found" }, 404);

		const result = await db
			.select()
			.from(hooks)
			.where(eq(hooks.waAccountId, accountId));

		return json(result);
	} catch (e: any) {
		return json({ error: e.message }, e.status ?? 500);
	}
}

// POST /accounts/:accountId/hooks
// Body: { targetUrl: string, secret?: string }
export async function createHook(
	req: Request,
	accountId: string,
): Promise<Response> {
	try {
		const { userId } = await authenticate(req);
		const account = await getAccountByIdAndUser(accountId, userId);
		if (!account) return json({ error: "Account not found" }, 404);

		let body: { targetUrl?: string; secret?: string };
		try {
			body = await req.json() as any;
		} catch {
			return json({ error: "Invalid JSON" }, 400);
		}

		const { targetUrl, secret } = body;
		if (!targetUrl) return json({ error: "targetUrl is required" }, 400);

		// Validate URL
		try {
			new URL(targetUrl);
		} catch {
			return json({ error: "Invalid targetUrl" }, 400);
		}

		const hook = await db
			.insert(hooks)
			.values({
				id: randomUUID(),
				waAccountId: accountId,
				eventType: "all", // forward everything
				targetUrl,
				secret: secret ?? null,
			})
			.returning();

		return json(hook[0], 201);
	} catch (e: any) {
		return json({ error: e.message }, e.status ?? 500);
	}
}

// DELETE /accounts/:accountId/hooks/:hookId
export async function deleteHook(
	req: Request,
	accountId: string,
	hookId: string,
): Promise<Response> {
	try {
		const { userId } = await authenticate(req);
		const account = await getAccountByIdAndUser(accountId, userId);
		if (!account) return json({ error: "Account not found" }, 404);

		await db
			.delete(hooks)
			.where(and(eq(hooks.id, hookId), eq(hooks.waAccountId, accountId)));

		return json({ ok: true });
	} catch (e: any) {
		return json({ error: e.message }, e.status ?? 500);
	}
}
