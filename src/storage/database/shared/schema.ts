import { pgTable, serial, timestamp, varchar, text, integer, index } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const healthCheck = pgTable("health_check", {
	id: serial().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const products = pgTable(
  "products",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    name: varchar("name", { length: 128 }).notNull(),
    url: varchar("url", { length: 512 }),
    description: text("description").notNull(),
    icon: varchar("icon", { length: 64 }),
    sort_order: integer("sort_order").default(0).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("products_sort_order_idx").on(table.sort_order),
  ]
);

export const contactSubmissions = pgTable(
  "contact_submissions",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    name: varchar("name", { length: 128 }).notNull(),
    contact: varchar("contact", { length: 256 }).notNull(),
    message: text("message").notNull(),
    ip: varchar("ip", { length: 64 }),
    ip_location: varchar("ip_location", { length: 256 }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("contact_submissions_created_at_idx").on(table.created_at),
  ]
);
