import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const devices = sqliteTable(
  "devices",
  {
    id: text("id").primaryKey(),
    installationId: text("installation_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    createdAt: text("created_at").notNull(),
    lastSeenAt: text("last_seen_at"),
    revokedAt: text("revoked_at"),
  },
  (table) => [uniqueIndex("devices_installation_id_unique").on(table.installationId), index("devices_token_hash_idx").on(table.tokenHash)],
);

export const memories = sqliteTable(
  "memories",
  {
    id: text("id").primaryKey(),
    deviceId: text("device_id").notNull().references(() => devices.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    city: text("city").notNull(),
    travelDate: text("travel_date").notNull(),
    status: text("status").notNull(),
    photoCount: integer("photo_count").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("memories_device_updated_idx").on(table.deviceId, table.updatedAt)],
);

export const memoryPages = sqliteTable(
  "memory_pages",
  {
    id: text("id").primaryKey(),
    memoryId: text("memory_id").notNull().references(() => memories.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    kind: text("kind").notNull(),
    headline: text("headline").notNull(),
    body: text("body").notNull(),
    photoSlot: integer("photo_slot"),
    layoutJson: text("layout_json"),
  },
  (table) => [index("memory_pages_memory_position_idx").on(table.memoryId, table.position)],
);

export type DeviceRow = typeof devices.$inferSelect;
export type MemoryRow = typeof memories.$inferSelect;
export type MemoryPageRow = typeof memoryPages.$inferSelect;
