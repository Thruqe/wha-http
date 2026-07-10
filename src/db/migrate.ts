import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db } from "./index";
import { logger } from "../util/logger";

logger.info("[DB] running migrations...");
migrate(db, { migrationsFolder: "./drizzle" });
logger.info("[DB] migrations done");
