// src/routes/auth.ts
import { randomUUID } from "crypto";
import { createUser, getUserByEmail } from "../db/users";
import { hashPassword, verifyPassword } from "../auth/password";
import { signJwt } from "../auth/jwt";

function json(data: unknown, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

// POST /auth/register
export async function register(req: Request): Promise<Response> {
	let body: { email?: string; password?: string };

	try {
		body = (await req.json()) as any;
	} catch {
		return json({ error: "Invalid JSON" }, 400);
	}

	const { email, password } = body;

	if (!email || !password) {
		return json({ error: "email and password are required" }, 400);
	}

	if (password.length < 8) {
		return json({ error: "password must be at least 8 characters" }, 400);
	}

	const existing = await getUserByEmail(email);
	if (existing) {
		return json({ error: "email already registered" }, 409);
	}

	const user = await createUser({
		id: randomUUID(),
		email,
		passwordHash: await hashPassword(password),
	});

	const token = await signJwt({ userId: user.id, email: user.email });

	return json({ token, user: { id: user.id, email: user.email } }, 201);
}

// POST /auth/login
export async function login(req: Request): Promise<Response> {
	let body: { email?: string; password?: string };

	try {
		body = (await req.json()) as any;
	} catch {
		return json({ error: "Invalid JSON" }, 400);
	}

	const { email, password } = body;

	if (!email || !password) {
		return json({ error: "email and password are required" }, 400);
	}

	const user = await getUserByEmail(email);
	if (!user) {
		return json({ error: "Invalid credentials" }, 401);
	}

	const valid = await verifyPassword(password, user.passwordHash);
	if (!valid) {
		return json({ error: "Invalid credentials" }, 401);
	}

	const token = await signJwt({ userId: user.id, email: user.email });

	return json({ token, user: { id: user.id, email: user.email } });
}

// GET /auth/me
export async function me(req: Request): Promise<Response> {
	const { authenticate } = await import("../auth/middleware");

	try {
		const payload = await authenticate(req);
		return json({ userId: payload.userId, email: payload.email });
	} catch (e: any) {
		return json({ error: e.message }, e.status ?? 401);
	}
}
