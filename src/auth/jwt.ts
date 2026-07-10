import { SignJWT, jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
	process.env.JWT_SECRET ?? "change-me-in-production",
);

export interface JwtPayload {
	userId: string;
	email: string;
}

export async function signJwt(payload: JwtPayload): Promise<string> {
	return new SignJWT({ ...payload })
		.setProtectedHeader({ alg: "HS256" })
		.setExpirationTime("7d")
		.sign(SECRET);
}

export async function verifyJwt(token: string): Promise<JwtPayload> {
	const { payload } = await jwtVerify(token, SECRET);
	return payload as unknown as JwtPayload;
}
