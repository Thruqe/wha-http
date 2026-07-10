import * as zevbot from "../src/cli/zevbot";
import * as rpm from "../src/cli/rpm";
import { logger } from "../src/util/logger";

try {
	await zevbot.startWithQr({ session: "1234567890", port: 4001 });
	logger.trace("start succeeded");
} catch (e) {
	console.error("start failed:", e);
}

const all = await rpm.list();
logger.trace(all, "processes:");
