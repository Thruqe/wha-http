import { eq } from "drizzle-orm";
import { db } from "./index";
import { users, type User, type NewUser } from "./schema";

export type { User };

export async function getUserById(id: string): Promise<User | null> {
	const result = await db.select().from(users).where(eq(users.id, id)).limit(1);

	return result[0] ?? null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
	const result = await db
		.select()
		.from(users)
		.where(eq(users.email, email))
		.limit(1);

	return result[0] ?? null;
}

export async function createUser(data: NewUser): Promise<User> {
	const result = await db.insert(users).values(data).returning();

	return result[0]!;
}
