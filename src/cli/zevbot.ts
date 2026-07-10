import { logger } from "../util/logger";
import { mkdirSync, writeFileSync, chmodSync, unlinkSync } from "fs";
import * as rpm from "./rpm";

const ZEVBOT_BIN = process.env.ZEVBOT_BIN ?? "zevBot";
const ZEVBOT_AUTH_DIR =
	process.env.ZEVBOT_AUTH_DIR ?? "/workspaces/wha-http/auth";
const SCRIPTS_DIR = process.env.ZEVBOT_SCRIPTS_DIR ?? "/tmp/wha-http-scripts";

export interface ZevBotSession {
	session: string;
	port: number;
}

export function sessionName(phone: string): string {
	return `wa-${phone}`;
}

function writeScript(phone: string, zevbotArgs: string[]): string {
	mkdirSync(SCRIPTS_DIR, { recursive: true });
	const scriptPath = `${SCRIPTS_DIR}/${sessionName(phone)}.sh`;
	const argStr = zevbotArgs
		.map((a) => `'${a.replace(/'/g, "'\\''")}'`)
		.join(" ");
	const content = `#!/bin/sh\nexec ${ZEVBOT_BIN} ${argStr}\n`;
	writeFileSync(scriptPath, content, { encoding: "utf8" });
	chmodSync(scriptPath, 0o755);
	logger.trace(`[zevbot] wrote script: ${scriptPath}\n${content}`);
	return scriptPath;
}

function removeScript(phone: string): void {
	try {
		unlinkSync(`${SCRIPTS_DIR}/${sessionName(phone)}.sh`);
	} catch {
		/* already gone */
	}
}

export async function start(
	opts: ZevBotSession & { watch?: boolean; force?: boolean },
): Promise<void> {
	const scriptPath = writeScript(opts.session, [
		"--session",
		opts.session,
		"--port",
		String(opts.port),
		"--auth-dir",
		ZEVBOT_AUTH_DIR,
	]);
	const rpmOpts = {
		name: sessionName(opts.session),
		watch: opts.watch ?? true,
		force: opts.force ?? false,
	};
	logger.trace(rpmOpts, `[zevbot] start script="${scriptPath}"`);
	await rpm.start(scriptPath, rpmOpts);
}

export async function stop(phone: string): Promise<void> {
	logger.trace(`[zevbot] stop session="${phone}"`);
	await rpm.stop(sessionName(phone));
}

export async function restart(phone: string): Promise<void> {
	logger.trace(`[zevbot] restart session="${phone}"`);
	await rpm.restart(sessionName(phone));
}

export async function del(phone: string): Promise<void> {
	logger.trace(`[zevbot] del session="${phone}"`);
	await rpm.del(sessionName(phone));
	removeScript(phone);
}

export async function get(phone: string): Promise<rpm.RpmProcess | null> {
	logger.trace(`[zevbot] get session="${phone}"`);
	return rpm.get(sessionName(phone));
}

export async function isRunning(phone: string): Promise<boolean> {
	logger.trace(`[zevbot] isRunning session="${phone}"`);
	return rpm.isRunning(sessionName(phone));
}

export async function startWithQr(
	opts: ZevBotSession & { force?: boolean },
): Promise<void> {
	const scriptPath = writeScript(opts.session, [
		"--session",
		opts.session,
		"--port",
		String(opts.port),
		"--auth-dir",
		ZEVBOT_AUTH_DIR,
		"--qrcode",
	]);
	const rpmOpts = {
		name: sessionName(opts.session),
		watch: true,
		force: opts.force ?? false,
	};
	logger.trace(rpmOpts, `[zevbot] startWithQr script="${scriptPath}"`);
	await rpm.start(scriptPath, rpmOpts);
}

export async function startWithPairCode(
	opts: ZevBotSession & { pairPhone: string; force?: boolean },
): Promise<void> {
	const scriptPath = writeScript(opts.session, [
		"--session",
		opts.session,
		"--port",
		String(opts.port),
		"--auth-dir",
		ZEVBOT_AUTH_DIR,
		"--pair",
		opts.pairPhone,
	]);
	const rpmOpts = {
		name: sessionName(opts.session),
		watch: true,
		force: opts.force ?? false,
	};
	logger.trace(rpmOpts, `[zevbot] startWithPairCode script="${scriptPath}"`);
	await rpm.start(scriptPath, rpmOpts);
}

export async function logout(phone: string): Promise<void> {
	logger.trace(`[zevbot] logout session="${phone}"`);

	const proc = Bun.spawn(
		[ZEVBOT_BIN, "--session", phone, "--auth-dir", ZEVBOT_AUTH_DIR, "--logout"],
		{ stdout: "pipe", stderr: "pipe" },
	);

	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);

	logger.trace(
		{ exitCode, stdout: stdout.trim(), stderr: stderr.trim() },
		`[zevbot] logout`,
	);

	if (exitCode !== 0) {
		throw new Error(
			`zevBot logout failed (exit ${exitCode}): ${stderr.trim()}`,
		);
	}

	try {
		await rpm.del(sessionName(phone));
	} catch {
		/* already gone */
	}
	removeScript(phone);
}
