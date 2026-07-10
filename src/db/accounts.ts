import { eq, and } from "drizzle-orm";
import { db } from "./index";
import { waAccounts, type WaAccount, type NewWaAccount } from "./schema";

export type { WaAccount };

export async function getAccountByIdAndUser(
	accountId: string,
	userId: string,
): Promise<WaAccount | null> {
	const result = await db
		.select()
		.from(waAccounts)
		.where(and(eq(waAccounts.id, accountId), eq(waAccounts.userId, userId)))
		.limit(1);

	return result[0] ?? null;
}

export async function getAccountsByUser(userId: string): Promise<WaAccount[]> {
	return db.select().from(waAccounts).where(eq(waAccounts.userId, userId));
}

export async function getAccountByPhone(
	phone: string,
): Promise<WaAccount | null> {
	const result = await db
		.select()
		.from(waAccounts)
		.where(eq(waAccounts.phone, phone))
		.limit(1);

	return result[0] ?? null;
}

export async function createAccount(data: NewWaAccount): Promise<WaAccount> {
	const result = await db.insert(waAccounts).values(data).returning();

	return result[0]!;
}

export async function updateAccountStatus(
	accountId: string,
	status: WaAccount["status"],
): Promise<void> {
	await db
		.update(waAccounts)
		.set({ status })
		.where(eq(waAccounts.id, accountId));
}

export async function deleteAccount(accountId: string): Promise<void> {
	await db.delete(waAccounts).where(eq(waAccounts.id, accountId));
}

// Port allocation

const PORT_START = 3000;
const PORT_END = 5000;

export async function allocatePort(): Promise<number> {
	// Get all used ports
	const used = await db.select({ port: waAccounts.port }).from(waAccounts);

	const usedPorts = new Set(used.map((r) => r.port));

	for (let port = PORT_START; port <= PORT_END; port++) {
		if (!usedPorts.has(port)) return port;
	}

	throw new Error("No available ports in range");
}
