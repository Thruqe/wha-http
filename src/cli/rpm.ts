import { logger } from "../util/logger";

const RPM_BIN = process.env.RPM_BIN ?? "rpm";

export interface RpmProcess {
	id?: string;
	name?: string;
	mode?: string;
	pid?: string;
	cpu?: string;
	mem?: string;
	uptime?: string;
	status?: "online" | "stopped" | string;
	watch?: string;
	restarts?: string;
}

export interface StartOptions {
	name: string;
	watch?: boolean;
	interpreter?: string;
	force?: boolean;
	env?: Record<string, string>;
}

async function run(
	args: string[],
	env?: Record<string, string>,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
	const mergedEnv = { ...process.env, ...env };

	logger.trace(args.join(" "), `[rpm] exec: ${RPM_BIN}`);
	logger.trace(env ?? {}, `[rpm] env overrides`);

	const proc = Bun.spawn([RPM_BIN, ...args], {
		stdout: "pipe",
		stderr: "pipe",
		env: mergedEnv,
	});

	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);

	logger.trace(`[rpm] exit: ${exitCode}`);
	logger.trace(`[rpm] stdout: ${stdout.trim() || "(empty)"}`);
	logger.trace(`[rpm] stderr: ${stderr.trim() || "(empty)"}`);

	return { stdout, stderr, exitCode };
}

function parseTable(output: string): RpmProcess[] {
	const lines = output.split("\n");

	logger.trace(`[rpm] parseTable raw output:\n${output}`);

	const dataLines = lines.filter((line) => {
		const trimmed = line.trim();
		if (!trimmed.startsWith("│")) return false;
		if (trimmed.includes("│ id") || trimmed.includes("no processes running"))
			return false;
		if (trimmed.startsWith("├")) return false;
		return true;
	});

	logger.trace(
		`[rpm] parseTable dataLines (${dataLines.length}):, ${dataLines}`,
	);

	return dataLines.map((line) => {
		const cells = line
			.split("│")
			.map((c) => c.trim())
			.filter((_, i, arr) => i > 0 && i < arr.length - 1);

		const [id, name, mode, pid, cpu, mem, uptime, status, watch, restarts] =
			cells;

		logger.trace(
			{ id, name, mode, pid, cpu, mem, uptime, status, watch, restarts },
			"[rpm] parsed row:",
		);

		return { id, name, mode, pid, cpu, mem, uptime, status, watch, restarts };
	});
}

export async function start(
	scriptPath: string,
	opts: StartOptions,
): Promise<void> {
	logger.trace(opts, `[rpm] start script="${scriptPath}"`);

	// scriptPath must be a single executable — no arg splitting
	const args = ["start", scriptPath, "--name", opts.name];

	if (opts.watch) args.push("--watch");
	if (opts.force) args.push("--force");
	if (opts.interpreter) args.push("--interpreter", opts.interpreter!);

	logger.trace(`[rpm] start final args: ${args.join(", ")}`);

	const { exitCode, stderr } = await run(args, opts.env);

	if (exitCode !== 0) {
		throw new Error(`rpm start failed (exit ${exitCode}): ${stderr.trim()}`);
	}
}

export async function stop(nameOrId: string): Promise<void> {
	logger.trace(`[rpm] stop "${nameOrId}"`);
	const { exitCode, stderr } = await run(["stop", nameOrId]);
	if (exitCode !== 0) {
		throw new Error(`rpm stop failed (exit ${exitCode}): ${stderr.trim()}`);
	}
}

export async function restart(nameOrId: string): Promise<void> {
	logger.trace(`[rpm] restart "${nameOrId}"`);
	const { exitCode, stderr } = await run(["restart", nameOrId]);
	if (exitCode !== 0) {
		throw new Error(`rpm restart failed (exit ${exitCode}): ${stderr.trim()}`);
	}
}

export async function del(nameOrId: string): Promise<void> {
	logger.trace(`[rpm] delete "${nameOrId}"`);
	const { exitCode, stderr } = await run(["delete", nameOrId]);
	if (exitCode !== 0) {
		throw new Error(`rpm delete failed (exit ${exitCode}): ${stderr.trim()}`);
	}
}

export async function list(): Promise<RpmProcess[]> {
	logger.trace(`[rpm] list`);
	const { stdout, exitCode, stderr } = await run(["ls"]);
	if (exitCode !== 0) {
		throw new Error(`rpm ls failed (exit ${exitCode}): ${stderr.trim()}`);
	}
	return parseTable(stdout);
}

export async function get(nameOrId: string): Promise<RpmProcess | null> {
	logger.trace(`[rpm] get "${nameOrId}"`);
	const processes = await list();
	return (
		processes.find((p) => p.name === nameOrId || p.id === nameOrId) ?? null
	);
}

export async function isRunning(nameOrId: string): Promise<boolean> {
	logger.trace(`[rpm] isRunning "${nameOrId}"`);
	const proc = await get(nameOrId);
	logger.trace(`[rpm] isRunning result: ${proc}`);
	return proc?.status === "online";
}
