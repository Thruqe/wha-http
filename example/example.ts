import WebSocket from "ws";
import { parseArgs } from "node:util";
import { logger } from "../src/util";

const { values } = parseArgs({
	options: {
		phone: {
			type: "string",
			short: "p",
		},
	},
});

const PHONE = values.phone;

if (!PHONE) {
	logger.error("Error: Phone number is required. Use -p or --phone.");
	process.exit(1);
}

const BASE = "http://localhost:8080";

let token: string;
let user: any;

const registerRes = await fetch(`${BASE}/auth/register`, {
	method: "POST",
	headers: { "Content-Type": "application/json" },
	body: JSON.stringify({ email: "test@test.com", password: "password123" }),
});

const registerBody = (await registerRes.json()) as any;

if (registerRes.ok) {
	logger.info(`[auth] registered as ${registerBody.user.email}`);
	token = registerBody.token;
	user = registerBody.user;
} else if (registerBody.error === "email already registered") {
	logger.info(`[auth] already registered, logging in...`);

	const loginRes = await fetch(`${BASE}/auth/login`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email: "test@test.com", password: "password123" }),
	});

	const loginBody = (await loginRes.json()) as any;

	if (!loginRes.ok) {
		logger.error(`[auth] login failed:`, loginBody);
		process.exit(1);
	}

	token = loginBody.token;
	user = loginBody.user;
	logger.info(`[auth] logged in as ${user.email} (${user.id})`);
} else {
	logger.error(`[auth] unexpected error:`, registerBody);
	process.exit(1);
}

logger.info(`[accounts] creating account for ${PHONE}...`);

const createRes = await fetch(`${BASE}/accounts`, {
	method: "POST",
	headers: {
		Authorization: `Bearer ${token}`,
		"Content-Type": "application/json",
	},
	body: JSON.stringify({ phone: PHONE, mode: "pair", pairPhone: PHONE }),
});

const created = (await createRes.json()) as any;
let account: any;

if (createRes.ok) {
	account = created.account;
	logger.info(`[accounts] created:`, account);
} else if (created.error?.includes("UNIQUE constraint failed")) {
	logger.info(
		`[accounts] phone already registered, fetching account details...`,
	);

	const getRes = await fetch(`${BASE}/accounts`, {
		method: "GET",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
	});

	const accountsList = (await getRes.json()) as any;

	if (!getRes.ok) {
		logger.error(`[accounts] failed to fetch accounts:`, accountsList);
		process.exit(1);
	}

	const list = Array.isArray(accountsList)
		? accountsList
		: accountsList.accounts;
	account = list?.find((acc: any) => acc.phone === PHONE);

	if (!account) {
		logger.error(
			`[accounts] error: account found in db but could not be retrieved from list`,
		);
		process.exit(1);
	}

	logger.info(`[accounts] retrieved existing:`, account);
} else {
	logger.error(`[accounts] failed to create:`, created);
	process.exit(1);
}

logger.info(`[ws] connecting to account ${account.id} (${account.phone})...`);

const ws = new WebSocket(`ws://localhost:8080/ws/${account.id}?token=${token}`);

ws.on("open", () => {
	logger.info(`[ws] connected — waiting for pair code...`);
});

ws.on("message", (data) => {
	try {
		const event = JSON.parse(data.toString());

		if (event?.type === "connected") {
			logger.info(`[ws] proxy ready for account ${event.accountId}`);
			return;
		}

		if (event?.type === "error") {
			logger.error(`[ws] error:`, event.message);
			return;
		}

		if (event?.type === "upstream_closed") {
			logger.warn(`[ws] upstream closed`);
			return;
		}

		logger.info(`[event]`, JSON.stringify(event, null, 2));
	} catch {
		logger.info(`[event] raw:`, data.toString());
	}
});

ws.on("close", (code, reason) => {
	logger.info(`[ws] closed: ${code} ${reason.toString()}`);
});

ws.on("error", (err) => {
	logger.error(`[ws] error:`, err.message);
});
