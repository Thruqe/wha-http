import type { APIRoute } from "astro";

export const prerender = false;

const BASE = "http://localhost:8080";

export const POST: APIRoute = async ({ request }) => {
	let phone: string;

	try {
		const body = await request.json();
		phone = body?.phone;
	} catch {
		return new Response(
			JSON.stringify({ error: "Invalid or missing JSON body" }),
			{
				status: 400,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	if (!phone) {
		return new Response(JSON.stringify({ error: "Phone number is required" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	let token: string;
	let user: any;

	const registerRes = await fetch(`${BASE}/auth/register`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email: "test@test.com", password: "password123" }),
	});

	const registerBody = (await registerRes.json()) as any;

	if (registerRes.ok) {
		token = registerBody.token;
		user = registerBody.user;
	} else if (registerBody.error === "email already registered") {
		const loginRes = await fetch(`${BASE}/auth/login`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "test@test.com", password: "password123" }),
		});

		const loginBody = (await loginRes.json()) as any;

		if (!loginRes.ok) {
			return new Response(
				JSON.stringify({ error: "Login failed", detail: loginBody }),
				{
					status: 401,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		token = loginBody.token;
		user = loginBody.user;
	} else {
		return new Response(
			JSON.stringify({ error: "Auth failed", detail: registerBody }),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	const createRes = await fetch(`${BASE}/accounts`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ phone, mode: "pair", pairPhone: phone }),
	});

	const created = (await createRes.json()) as any;
	let account: any;

	if (createRes.ok) {
		account = created.account;
	} else if (created.error?.includes("UNIQUE constraint failed")) {
		const getRes = await fetch(`${BASE}/accounts`, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
		});

		const accountsList = (await getRes.json()) as any;

		if (!getRes.ok) {
			return new Response(
				JSON.stringify({
					error: "Failed to fetch accounts",
					detail: accountsList,
				}),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		const list = Array.isArray(accountsList)
			? accountsList
			: accountsList.accounts;
		account = list?.find((acc: any) => acc.phone === phone);

		if (!account) {
			return new Response(
				JSON.stringify({
					error: "Account found in DB but not retrievable from list",
				}),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				},
			);
		}
	} else {
		return new Response(
			JSON.stringify({ error: "Account creation failed", detail: created }),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	return new Response(JSON.stringify({ token, user, account }), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
};
