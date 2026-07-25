import { index, integer, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

import type { CloudCanvasLayout } from "../../services/backend/contracts";

export const devices = pgTable(
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

/** Canonical passwordless account identity. Email is stored normalized by the auth repository. */
export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    createdAt: text("created_at").notNull(),
    lastAuthenticatedAt: text("last_authenticated_at").notNull(),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

/** Short-lived, one-time email verification codes; plaintext codes are never persisted. */
export const authEmailCodes = pgTable(
  "auth_email_codes",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    consumedAt: text("consumed_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("auth_email_codes_email_created_idx").on(table.email, table.createdAt)],
);

/** Thirty-day bearer-token sessions. Only a peppered hash of the token is persisted. */
export const authSessions = pgTable(
  "auth_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("auth_sessions_token_hash_unique").on(table.tokenHash), index("auth_sessions_user_idx").on(table.userId)],
);

export const memories = pgTable(
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

export const memoryPages = pgTable(
  "memory_pages",
  {
    id: text("id").primaryKey(),
    memoryId: text("memory_id").notNull().references(() => memories.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    kind: text("kind").notNull(),
    headline: text("headline").notNull(),
    body: text("body").notNull(),
    photoSlot: integer("photo_slot"),
    layoutJson: jsonb("layout_json").$type<CloudCanvasLayout>(),
  },
  (table) => [index("memory_pages_memory_position_idx").on(table.memoryId, table.position)],
);

export const gifts = pgTable(
  "gifts",
  {
    id: text("id").primaryKey(),
    tokenHash: text("token_hash").notNull(),
    status: text("status").notNull(),
    createdAt: text("created_at").notNull(),
    claimedAt: text("claimed_at"),
    disabledAt: text("disabled_at"),
  },
  (table) => [uniqueIndex("gifts_token_hash_unique").on(table.tokenHash)],
);

export const giftCards = pgTable(
  "gift_cards",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    state: text("state").notNull(),
    giftId: text("gift_id").references(() => gifts.id, { onDelete: "restrict" }),
    note: text("note"),
    createdByEmail: text("created_by_email").notNull(),
    expiresAt: text("expires_at"),
    activatedAt: text("activated_at"),
    retiredAt: text("retired_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("gift_cards_code_unique").on(table.code),
    uniqueIndex("gift_cards_gift_unique").on(table.giftId),
    index("gift_cards_state_created_idx").on(table.state, table.createdAt),
  ],
);

export const giftCardEvents = pgTable(
  "gift_card_events",
  {
    id: text("id").primaryKey(),
    cardId: text("card_id").notNull().references(() => giftCards.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    actorEmail: text("actor_email").notNull(),
    metadataJson: jsonb("metadata_json"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("gift_card_events_card_created_idx").on(table.cardId, table.createdAt)],
);

export const giftMembers = pgTable(
  "gift_members",
  {
    id: text("id").primaryKey(),
    giftId: text("gift_id").notNull().references(() => gifts.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("gift_members_gift_email_unique").on(table.giftId, table.email)],
);

export const sharedAlbums = pgTable(
  "shared_albums",
  {
    id: text("id").primaryKey(),
    giftId: text("gift_id").notNull().references(() => gifts.id, { onDelete: "cascade" }),
    sourceMemoryId: text("source_memory_id").notNull(),
    title: text("title").notNull(),
    publishedAt: text("published_at").notNull(),
    version: integer("version").notNull(),
  },
  (table) => [uniqueIndex("shared_albums_gift_unique").on(table.giftId)],
);

export const giftEmailCodes = pgTable(
  "gift_email_codes",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    consumedAt: text("consumed_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("gift_email_codes_email_created_idx").on(table.email, table.createdAt)],
);

export const giftSessions = pgTable(
  "gift_sessions",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("gift_sessions_token_hash_unique").on(table.tokenHash), index("gift_sessions_email_idx").on(table.email)],
);

/** Immutable page snapshot published by a gift owner. */
export const sharedAlbumPages = pgTable(
  "shared_album_pages",
  {
    id: text("id").primaryKey(),
    sharedAlbumId: text("shared_album_id").notNull().references(() => sharedAlbums.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    pageJson: jsonb("page_json").notNull(),
  },
  (table) => [uniqueIndex("shared_album_pages_album_position_unique").on(table.sharedAlbumId, table.position)],
);

/** Private R2 object metadata; object keys are never exposed directly to viewers. */
export const sharedAlbumMedia = pgTable(
  "shared_album_media",
  {
    id: text("id").primaryKey(),
    sharedAlbumId: text("shared_album_id").notNull().references(() => sharedAlbums.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    objectKey: text("object_key").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("shared_album_media_object_key_unique").on(table.objectKey),
    uniqueIndex("shared_album_media_album_position_unique").on(table.sharedAlbumId, table.position),
  ],
);

/** Short-lived server-side publication workflow used to prevent partial snapshots becoming visible. */
export const giftPublishSessions = pgTable(
  "gift_publish_sessions",
  {
    id: text("id").primaryKey(),
    giftId: text("gift_id").notNull().references(() => gifts.id, { onDelete: "cascade" }),
    ownerEmail: text("owner_email").notNull(),
    payloadJson: jsonb("payload_json").notNull(),
    expiresAt: text("expires_at").notNull(),
    completedAt: text("completed_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("gift_publish_sessions_gift_expires_idx").on(table.giftId, table.expiresAt)],
);

/** Durable R2 cleanup work. Deleting an object never controls gift access. */
export const giftMediaCleanupJobs = pgTable(
  "gift_media_cleanup_jobs",
  {
    id: text("id").primaryKey(),
    giftId: text("gift_id").notNull().references(() => gifts.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull(),
    state: text("state").notNull(),
    attempts: integer("attempts").notNull(),
    nextAttemptAt: text("next_attempt_at").notNull(),
    lastError: text("last_error"),
    completedAt: text("completed_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("gift_media_cleanup_jobs_object_key_unique").on(table.objectKey),
    index("gift_media_cleanup_jobs_due_idx").on(table.state, table.nextAttemptAt),
  ],
);

export type DeviceRow = typeof devices.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type AuthEmailCodeRow = typeof authEmailCodes.$inferSelect;
export type AuthSessionRow = typeof authSessions.$inferSelect;
export type MemoryRow = typeof memories.$inferSelect;
export type MemoryPageRow = typeof memoryPages.$inferSelect;
export type GiftRow = typeof gifts.$inferSelect;
export type GiftCardRow = typeof giftCards.$inferSelect;
export type GiftCardEventRow = typeof giftCardEvents.$inferSelect;
export type GiftMemberRow = typeof giftMembers.$inferSelect;
export type SharedAlbumRow = typeof sharedAlbums.$inferSelect;
export type GiftEmailCodeRow = typeof giftEmailCodes.$inferSelect;
export type GiftSessionRow = typeof giftSessions.$inferSelect;
export type SharedAlbumPageRow = typeof sharedAlbumPages.$inferSelect;
export type SharedAlbumMediaRow = typeof sharedAlbumMedia.$inferSelect;
export type GiftPublishSessionRow = typeof giftPublishSessions.$inferSelect;
export type GiftMediaCleanupJobRow = typeof giftMediaCleanupJobs.$inferSelect;
