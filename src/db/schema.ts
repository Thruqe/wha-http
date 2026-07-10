import { sql } from "drizzle-orm";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
	id: text("id").primaryKey(),
	email: text("email").notNull().unique(),
	passwordHash: text("password_hash").notNull(),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
});

export const waAccounts = sqliteTable("wa_accounts", {
	id: text("id").primaryKey(),
	userId: text("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	phone: text("phone").notNull().unique(),
	port: integer("port").notNull().unique(),
	status: text("status", {
		enum: ["pending_qr", "pending_pair", "connected", "disconnected"],
	})
		.notNull()
		.default("pending_qr"),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
});

export const automations = sqliteTable("automations", {
	id: text("id").primaryKey(),
	waAccountId: text("wa_account_id")
		.notNull()
		.references(() => waAccounts.id, { onDelete: "cascade" }),
	name: text("name").notNull(),
	triggerType: text("trigger_type").notNull(), // e.g. "message_received", "keyword_match"
	triggerConfig: text("trigger_config", { mode: "json" })
		.notNull()
		.default("{}"),
	enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
});

export const actions = sqliteTable("actions", {
	id: text("id").primaryKey(),
	automationId: text("automation_id")
		.notNull()
		.references(() => automations.id, { onDelete: "cascade" }),
	actionType: text("action_type").notNull(), // e.g. "send_message", "webhook"
	actionConfig: text("action_config", { mode: "json" }).notNull().default("{}"),
	order: integer("order").notNull().default(0),
});

export const hooks = sqliteTable("hooks", {
	id: text("id").primaryKey(),
	waAccountId: text("wa_account_id")
		.notNull()
		.references(() => waAccounts.id, { onDelete: "cascade" }),
	eventType: text("event_type").notNull(), // e.g. "message_received", "connected"
	targetUrl: text("target_url").notNull(),
	secret: text("secret"),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type WaAccount = typeof waAccounts.$inferSelect;
export type NewWaAccount = typeof waAccounts.$inferInsert;
export type Automation = typeof automations.$inferSelect;
export type NewAutomation = typeof automations.$inferInsert;
export type Action = typeof actions.$inferSelect;
export type NewAction = typeof actions.$inferInsert;
export type Hook = typeof hooks.$inferSelect;
export type NewHook = typeof hooks.$inferInsert;
