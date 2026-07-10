import type { JwtPayload } from "./jwt";
import { verifyJwt } from "./jwt";

export async function authenticate(req: Request): Promise<JwtPayload> {
	const token =
		req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;

	if (!token) {
		throw new AuthError("Missing token", 401);
	}

	try {
		return await verifyJwt(token);
	} catch {
		throw new AuthError("Invalid or expired token", 401);
	}
}

export class AuthError extends Error {
	constructor(
		message: string,
		public status: number,
	) {
		super(message);
	}
}
