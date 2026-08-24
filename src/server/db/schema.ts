import { check, foreignKey, index, integer, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import type { CloudCanvasLayout } from "../../services/backend/contracts";

export type GiftMemberRole = "owner" | "viewer" | "editor";
export type GiftContentReportReason = "sexual" | "harassment" | "hate" | "violence" | "spam" | "other";

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
    deletionState: text("deletion_state").$type<"active" | "pending">().default("active").notNull(),
    deletionRequestedAt: text("deletion_requested_at"),
  },
  (table) => [
    uniqueIndex("users_email_unique").on(table.email),
    check("users_deletion_state_check", sql`${table.deletionState} in ('active', 'pending')`),
    check("users_deletion_requested_at_check", sql`(${table.deletionState} = 'active' and ${table.deletionRequestedAt} is null) or (${table.deletionState} = 'pending' and ${table.deletionRequestedAt} is not null)`),
  ],
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
    failedAttempts: integer("failed_attempts").default(0).notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("auth_email_codes_email_created_idx").on(table.email, table.createdAt),
    index("auth_email_codes_expires_idx").on(table.expiresAt, table.id),
    check("auth_email_codes_failed_attempts_check", sql`${table.failedAttempts} between 0 and 5`),
  ],
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
  (table) => [
    uniqueIndex("auth_sessions_token_hash_unique").on(table.tokenHash),
    index("auth_sessions_user_idx").on(table.userId),
    index("auth_sessions_expires_idx").on(table.expiresAt, table.id),
    index("auth_sessions_revoked_idx").on(table.revokedAt, table.id),
  ],
);

/** Short-lived hashed verification throttles. Raw client IP addresses are never stored. */
export const authRateLimits = pgTable(
  "auth_rate_limits",
  {
    scopeHash: text("scope_hash").primaryKey(),
    windowStartedAt: text("window_started_at").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    expiresAt: text("expires_at").notNull(),
  },
  (table) => [
    index("auth_rate_limits_expires_idx").on(table.expiresAt, table.scopeHash),
    check("auth_rate_limits_attempts_check", sql`${table.attempts} >= 0`),
  ],
);

/** Session-bound, short-lived proof required before permanent account deletion. */
export const accountDeletionChallenges = pgTable(
  "account_deletion_challenges",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull().references(() => authSessions.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    consumedAt: text("consumed_at"),
    failedAttempts: integer("failed_attempts").default(0).notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("account_deletion_challenges_user_created_idx").on(table.userId, table.createdAt),
    index("account_deletion_challenges_expires_idx").on(table.expiresAt, table.id),
    check("account_deletion_challenges_failed_attempts_check", sql`${table.failedAttempts} between 0 and 5`),
  ],
);

/** Revocation-first, durable account deletion work. Completed rows retain only an anonymous receipt. */
export const accountDeletionJobs = pgTable(
  "account_deletion_jobs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    accountEmail: text("account_email"),
    state: text("state").$type<"pending" | "processing" | "completed">().default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    nextAttemptAt: text("next_attempt_at").notNull(),
    leaseUntil: text("lease_until"),
    completeBy: text("complete_by").notNull(),
    lastErrorCode: text("last_error_code"),
    supportNotifiedAt: text("support_notified_at"),
    completedAt: text("completed_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("account_deletion_jobs_user_open_unique").on(table.userId).where(sql`${table.state} in ('pending', 'processing')`),
    index("account_deletion_jobs_due_idx").on(table.state, table.nextAttemptAt, table.id),
    check("account_deletion_jobs_state_check", sql`${table.state} in ('pending', 'processing', 'completed')`),
    check("account_deletion_jobs_attempts_check", sql`${table.attempts} >= 0`),
    check("account_deletion_jobs_identity_check", sql`(${table.state} = 'completed' and ${table.userId} is null and ${table.accountEmail} is null and ${table.completedAt} is not null) or (${table.state} in ('pending', 'processing') and ${table.userId} is not null and ${table.accountEmail} is not null and ${table.completedAt} is null)`),
  ],
);

/** Private object keys awaiting deletion; removed before a receipt is anonymized. */
export const accountDeletionMediaObjects = pgTable(
  "account_deletion_media_objects",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id").notNull().references(() => accountDeletionJobs.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull(),
  },
  (table) => [uniqueIndex("account_deletion_media_objects_job_object_unique").on(table.jobId, table.objectKey)],
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
  (table) => [
    uniqueIndex("gifts_token_hash_unique").on(table.tokenHash),
    check("gifts_status_check", sql`${table.status} in ('initializing', 'unclaimed', 'bound', 'disabled')`),
  ],
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
    index("gift_cards_state_expires_idx").on(table.state, table.expiresAt, table.id),
    check("gift_cards_state_check", sql`${table.state} in ('initializing', 'active', 'retired')`),
    check("gift_cards_gift_id_present_check", sql`${table.giftId} is not null`),
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
    role: text("role").$type<GiftMemberRole>().notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("gift_members_gift_email_unique").on(table.giftId, table.email),
    uniqueIndex("gift_members_gift_id_id_unique").on(table.giftId, table.id),
    index("gift_members_email_role_gift_idx").on(table.email, table.role, table.giftId),
    check("gift_members_role_check", sql`${table.role} in ('owner', 'viewer', 'editor')`),
  ],
);

export const sharedAlbums = pgTable(
  "shared_albums",
  {
    id: text("id").primaryKey(),
    giftId: text("gift_id").notNull().references(() => gifts.id, { onDelete: "cascade" }),
    sourceMemoryId: text("source_memory_id").notNull(),
    title: text("title").notNull(),
    travelDate: text("travel_date"),
    publishedAt: text("published_at").notNull(),
    version: integer("version").notNull(),
    /** 独立于页面照片的封面对象；旧相册为 null。 */
    coverObjectKey: text("cover_object_key"),
    coverContentType: text("cover_content_type"),
    coverByteSize: integer("cover_byte_size"),
  },
  (table) => [uniqueIndex("shared_albums_gift_unique").on(table.giftId)],
);

/** A viewer must prove possession of the gift token before shared media is readable. */
export const giftMemberActivations = pgTable(
  "gift_member_activations",
  {
    memberId: text("member_id").primaryKey().references(() => giftMembers.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    activatedAt: text("activated_at").notNull(),
  },
  (table) => [index("gift_member_activations_user_member_idx").on(table.userId, table.memberId)],
);

/** Minimal ended-relationship proof so either party can still block after membership removal. */
export const giftRelationshipTombstones = pgTable(
  "gift_relationship_tombstones",
  {
    id: text("id").primaryKey(),
    giftId: text("gift_id").notNull().references(() => gifts.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("gift_relationship_tombstones_gift_email_unique").on(table.giftId, table.email),
    index("gift_relationship_tombstones_user_gift_idx").on(table.userId, table.giftId),
    index("gift_relationship_tombstones_email_gift_idx").on(table.email, table.giftId),
  ],
);

/** A reporter-specific hide plus the minimum metadata needed for support disposition. */
export const giftContentReports = pgTable(
  "gift_content_reports",
  {
    id: text("id").primaryKey(),
    giftId: text("gift_id").notNull().references(() => gifts.id, { onDelete: "cascade" }),
    reporterUserId: text("reporter_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    reason: text("reason").$type<GiftContentReportReason>().notNull(),
    details: text("details"),
    snapshotVersion: integer("snapshot_version").notNull(),
    state: text("state").$type<"open" | "resolved" | "dismissed">().default("open").notNull(),
    disposition: text("disposition").$type<"content_disabled" | "member_removed" | "no_violation">(),
    dispositionNote: text("disposition_note"),
    disposedAt: text("disposed_at"),
    supportNotifiedAt: text("support_notified_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("gift_content_reports_reporter_snapshot_unique").on(table.giftId, table.reporterUserId, table.snapshotVersion),
    index("gift_content_reports_open_created_idx").on(table.state, table.createdAt, table.id),
    index("gift_content_reports_reporter_gift_idx").on(table.reporterUserId, table.giftId),
    check("gift_content_reports_reason_check", sql`${table.reason} in ('sexual', 'harassment', 'hate', 'violence', 'spam', 'other')`),
    check("gift_content_reports_snapshot_version_check", sql`${table.snapshotVersion} >= 1`),
    check("gift_content_reports_details_length_check", sql`${table.details} is null or char_length(${table.details}) <= 500`),
    check("gift_content_reports_disposition_note_length_check", sql`${table.dispositionNote} is null or char_length(${table.dispositionNote}) <= 500`),
    check("gift_content_reports_state_check", sql`${table.state} in ('open', 'resolved', 'dismissed')`),
    check("gift_content_reports_disposition_check", sql`(${table.state} = 'open' and ${table.disposition} is null and ${table.disposedAt} is null) or (${table.state} in ('resolved', 'dismissed') and ${table.disposition} in ('content_disabled', 'member_removed', 'no_violation') and ${table.disposedAt} is not null)`),
  ],
);

/** Direction is retained for support, while the canonical email pair enforces bidirectional blocking. */
export const userBlocks = pgTable(
  "user_blocks",
  {
    id: text("id").primaryKey(),
    blockerUserId: text("blocker_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    blockerEmail: text("blocker_email").notNull(),
    blockedUserId: text("blocked_user_id").references(() => users.id, { onDelete: "cascade" }),
    blockedEmail: text("blocked_email").notNull(),
    emailLow: text("email_low").notNull(),
    emailHigh: text("email_high").notNull(),
    sourceGiftId: text("source_gift_id").references(() => gifts.id, { onDelete: "set null" }),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("user_blocks_email_pair_unique").on(table.emailLow, table.emailHigh),
    index("user_blocks_blocker_created_idx").on(table.blockerUserId, table.createdAt, table.id),
    index("user_blocks_blocked_email_idx").on(table.blockedEmail, table.createdAt, table.id),
    check("user_blocks_distinct_email_check", sql`${table.blockerEmail} <> ${table.blockedEmail} and ${table.emailLow} <> ${table.emailHigh}`),
  ],
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
    memberId: text("member_id").references(() => giftMembers.id, { onDelete: "set null" }),
    baseVersion: integer("base_version").notNull(),
    actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    payloadJson: jsonb("payload_json").notNull(),
    expiresAt: text("expires_at").notNull(),
    completedAt: text("completed_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("gift_publish_sessions_gift_expires_idx").on(table.giftId, table.expiresAt),
    index("gift_publish_sessions_expires_idx").on(table.expiresAt, table.id),
    index("gift_publish_sessions_completed_idx").on(table.completedAt, table.id),
  ],
);

export const giftManagementRequests = pgTable(
  "gift_management_requests",
  {
    id: text("id").primaryKey(),
    giftId: text("gift_id").notNull().references(() => gifts.id, { onDelete: "cascade" }),
    requesterMemberId: text("requester_member_id").notNull(),
    action: text("action").$type<"delete_album" | "remove_member" | "change_member_role">().notNull(),
    targetEmail: text("target_email"),
    targetRole: text("target_role").$type<"viewer" | "editor">(),
    status: text("status").$type<"pending" | "approved" | "rejected">().notNull(),
    createdAt: text("created_at").notNull(),
    decidedAt: text("decided_at"),
  },
  (table) => [
    index("gift_management_requests_gift_status_created_idx").on(table.giftId, table.status, table.createdAt),
    uniqueIndex("gift_management_requests_pending_unique").on(table.giftId, table.action, sql`coalesce(${table.targetEmail}, '')`, sql`coalesce(${table.targetRole}, '')`).where(sql`${table.status} = 'pending'`),
    check("gift_management_requests_action_check", sql`${table.action} in ('delete_album', 'remove_member', 'change_member_role')`),
    check("gift_management_requests_status_check", sql`${table.status} in ('pending', 'approved', 'rejected')`),
    check("gift_management_requests_target_role_check", sql`${table.targetRole} is null or ${table.targetRole} in ('viewer', 'editor')`),
    check("gift_management_requests_action_target_check", sql`(${table.action} = 'delete_album' and ${table.targetEmail} is null and ${table.targetRole} is null) or (${table.action} = 'remove_member' and ${table.targetEmail} is not null and ${table.targetRole} is null) or (${table.action} = 'change_member_role' and ${table.targetEmail} is not null and ${table.targetRole} is not null)`),
    check("gift_management_requests_decision_time_check", sql`(${table.status} = 'pending' and ${table.decidedAt} is null) or (${table.status} in ('approved', 'rejected') and ${table.decidedAt} is not null)`),
    foreignKey({ name: "gift_management_requests_gift_requester_member_fk", columns: [table.giftId, table.requesterMemberId], foreignColumns: [giftMembers.giftId, giftMembers.id] }).onDelete("cascade"),
  ],
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
    leaseUntil: text("lease_until"),
    lastError: text("last_error"),
    completedAt: text("completed_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("gift_media_cleanup_jobs_object_key_unique").on(table.objectKey),
    index("gift_media_cleanup_jobs_due_idx").on(table.state, table.nextAttemptAt, table.id),
    index("gift_media_cleanup_jobs_terminal_idx").on(table.state, table.completedAt, table.id),
    check("gift_media_cleanup_jobs_state_check", sql`${table.state} in ('pending', 'processing', 'completed', 'dead_letter')`),
    check("gift_media_cleanup_jobs_attempts_check", sql`${table.attempts} >= 0`),
  ],
);

/** Singleton lease and last-run state shared by scheduled and opportunistic maintenance. */
export const appMaintenanceState = pgTable("app_maintenance_state", {
  id: text("id").primaryKey(),
  leaseToken: text("lease_token"),
  leaseUntil: text("lease_until"),
  lastStartedAt: text("last_started_at"),
  lastCompletedAt: text("last_completed_at"),
  lastErrorCode: text("last_error_code"),
});

/** Explicit application schema version used by the public readiness check. */
export const appSchemaMeta = pgTable("app_schema_meta", {
  key: text("key").primaryKey(),
  version: integer("version").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export type DeviceRow = typeof devices.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type AuthEmailCodeRow = typeof authEmailCodes.$inferSelect;
export type AuthSessionRow = typeof authSessions.$inferSelect;
export type AuthRateLimitRow = typeof authRateLimits.$inferSelect;
export type AccountDeletionChallengeRow = typeof accountDeletionChallenges.$inferSelect;
export type AccountDeletionJobRow = typeof accountDeletionJobs.$inferSelect;
export type AccountDeletionMediaObjectRow = typeof accountDeletionMediaObjects.$inferSelect;
export type MemoryRow = typeof memories.$inferSelect;
export type MemoryPageRow = typeof memoryPages.$inferSelect;
export type GiftRow = typeof gifts.$inferSelect;
export type GiftCardRow = typeof giftCards.$inferSelect;
export type GiftCardEventRow = typeof giftCardEvents.$inferSelect;
export type GiftMemberRow = typeof giftMembers.$inferSelect;
export type GiftRelationshipTombstoneRow = typeof giftRelationshipTombstones.$inferSelect;
export type GiftContentReportRow = typeof giftContentReports.$inferSelect;
export type UserBlockRow = typeof userBlocks.$inferSelect;
export type GiftManagementRequestRow = typeof giftManagementRequests.$inferSelect;
export type SharedAlbumRow = typeof sharedAlbums.$inferSelect;
export type GiftEmailCodeRow = typeof giftEmailCodes.$inferSelect;
export type GiftSessionRow = typeof giftSessions.$inferSelect;
export type SharedAlbumPageRow = typeof sharedAlbumPages.$inferSelect;
export type SharedAlbumMediaRow = typeof sharedAlbumMedia.$inferSelect;
export type GiftPublishSessionRow = typeof giftPublishSessions.$inferSelect;
export type GiftMediaCleanupJobRow = typeof giftMediaCleanupJobs.$inferSelect;
export type AppMaintenanceStateRow = typeof appMaintenanceState.$inferSelect;
export type AppSchemaMetaRow = typeof appSchemaMeta.$inferSelect;
