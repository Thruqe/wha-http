import WebSocket from "ws";
import { parseArgs } from "node:util";

const ANSI = {
	reset: "\x1b[0m",
	bold: "\x1b[1m",
	cyan: "\x1b[36m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	red: "\x1b[31m",
	gray: "\x1b[90m",
};

function log(level, ...args) {
	const styles = {
		info: { label: "INFO ", color: ANSI.green },
		warn: { label: "WARN ", color: ANSI.yellow },
		error: { label: "ERROR", color: ANSI.red },
	};
	const { label, color } = styles[level];
	const time = new Date().toLocaleTimeString("en-US", { hour12: false });
	const prefix = `${ANSI.gray}${time}${ANSI.reset} ${color}${ANSI.bold}${label}${ANSI.reset} ${ANSI.cyan}(example)${ANSI.reset}:`;
	(level === "error" ? console.error : console.log)(prefix, ...args);
}

const logger = {
	info: (...args) => log("info", ...args),
	warn: (...args) => log("warn", ...args),
	error: (...args) => log("error", ...args),
};

const { values } = parseArgs({
	options: {
		phone: { type: "string", short: "p" },
	},
});

const PHONE = values.phone;
if (!PHONE) {
	logger.error("Error: Phone number is required. Use -p or --phone.");
	process.exit(1);
}

const BASE = "http://localhost:8080";

let token;
let user;

const registerRes = await fetch(`${BASE}/auth/register`, {
	method: "POST",
	headers: { "Content-Type": "application/json" },
	body: JSON.stringify({ email: "test@test.com", password: "password123" }),
});
const registerBody = await registerRes.json();

if (registerRes.ok) {
	logger.info(`[auth] registered as ${registerBody.user.email}`);
	token = registerBody.token;
	user = registerBody.user;
} else if (registerBody.error === "email already registered") {
	logger.info(`[auth] already registered, logging in...`);
	const loginRes = await fetch(`${BASE}/auth/login`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			email: "test@test.com",
			password: "password123",
		}),
	});
	const loginBody = await loginRes.json();
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
const created = await createRes.json();
let account;

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
	const accountsList = await getRes.json();
	if (!getRes.ok) {
		logger.error(`[accounts] failed to fetch accounts:`, accountsList);
		process.exit(1);
	}
	const list = Array.isArray(accountsList)
		? accountsList
		: accountsList.accounts;
	account = list?.find((acc) => acc.phone === PHONE);
	if (!account) {
		logger.error(
			`[accounts] account found in db but could not be retrieved from list`,
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

const pending = new Map();

function randomId() {
	return Math.random().toString(36).slice(2, 10);
}

function sendControl(type, payload = {}) {
	return new Promise((resolve, reject) => {
		if (ws.readyState !== WebSocket.OPEN) {
			reject("Not connected");
			return;
		}
		const id = randomId();
		pending.set(id, { resolve, reject });
		const msg = { type, id, payload };
		ws.send(JSON.stringify(msg));
		setTimeout(() => {
			if (pending.has(id)) {
				pending.delete(id);
				reject(`Timeout waiting for ack: ${id}`);
			}
		}, 10_000);
	});
}

function handleEvent(msg) {
	if (msg.type === "ack" && msg.id) {
		const p = pending.get(msg.id);
		if (p) {
			pending.delete(msg.id);
			const { ok, error } = msg.payload;
			ok ? p.resolve() : p.reject(error ?? "Unknown error");
		}
		return;
	}

	switch (msg.type) {
		case "connected":
			logger.info(`[ws] proxy ready for account ${msg.payload.accountId}`);
			break;
		case "pair_qr":
			logger.info(`[pair] QR code: ${msg.payload.code}`);
			break;
		case "pair_code": {
			const { code, expires_in } = msg.payload;
			logger.info(`[pair] code: ${code} (expires in ${expires_in}s)`);
			break;
		}
		case "pair_success":
			logger.info(`[pair] paired successfully!`);
			break;
		case "pair_error":
			logger.error(`[pair] failed: ${msg.payload.reason}`);
			break;
		case "logged_out":
			logger.warn(`[session] logged out`);
			break;
		case "disconnected":
			logger.warn(`[session] bot disconnected`);
			break;
		case "upstream_closed":
			logger.warn(`[ws] upstream closed`);
			break;
		case "error":
			logger.error(`[ws] error: ${msg.payload.message}`);
			break;
		default:
			logger.info(`[event]`, JSON.stringify(msg, null, 2));
	}
}

ws.on("open", () => {
	logger.info(`[ws] connected — waiting for events...`);
});

ws.on("message", (data) => {
	try {
		const msg = JSON.parse(data.toString());
		handleEvent(msg);
	} catch {
		logger.info(`[event] unparseable:`, data.toString());
	}
});

ws.on("close", (code, reason) => {
	logger.info(`[ws] closed: ${code} ${reason.toString()}`);
});

ws.on("error", (err) => {
	logger.error(`[ws] error:`, err.message);
});

// ── Example control usage (after pair_success) ────────────────────────────────
// Uncomment to test sending a message once paired:
//
// ws.once("message", async () => {
//   try {
//     await sendControl("send_message", { to: PHONE, text: "Hello from example!" });
//     logger.info("[control] message sent and acked");
//   } catch (err) {
//     logger.error("[control] failed:", err);
//   }
// });
