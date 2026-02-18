import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

// Admin Users Table
export const adminUsers = sqliteTable(
  'admin_users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    username: text('username').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    lastLoginAt: text('last_login_at'),
  },
  (table) => ({
    usernameIdx: index('idx_admin_username').on(table.username),
  })
);

// WhatsApp Connections Table
export const whatsappConnections = sqliteTable(
  'whatsapp_connections',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    phoneNumberHash: text('phone_number_hash').notNull().unique(),
    status: text('status', { enum: ['DISCONNECTED', 'CONNECTING', 'CONNECTED'] }).notNull(),
    lastConnectedAt: text('last_connected_at'),
    qrCodeGeneratedAt: text('qr_code_generated_at'),
    // Message filtering configuration
    filterType: text('filter_type', { enum: ['prefix', 'keyword'] }),
    filterValue: text('filter_value'),
    // Process messages from self and/or groups (default: only 1:1 from others)
    processFromSelf: integer('process_from_self', { mode: 'boolean' }).notNull().default(false),
    processGroups: integer('process_groups', { mode: 'boolean' }).notNull().default(false),
    // When true, linked session marks as online on connect (may stop phone notifications)
    markOnlineOnConnect: integer('mark_online_on_connect', { mode: 'boolean' })
      .notNull()
      .default(false),
    // Auto-approval mode
    autoApprovalMode: text('auto_approval_mode', { enum: ['auto_approve', 'auto_deny', 'manual'] })
      .notNull()
      .default('auto_approve'),
    // Exceptions configuration
    exceptionsEnabled: integer('exceptions_enabled', { mode: 'boolean' }).notNull().default(false),
    exceptionContacts: text('exception_contacts', { mode: 'json' }).$type<string[]>().default([]),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => ({
    phoneIdx: index('idx_whatsapp_phone').on(table.phoneNumberHash),
  })
);

// Conversation Sessions Table
export const conversationSessions = sqliteTable(
  'conversation_sessions',
  {
    id: text('id').primaryKey(), // UUID v4
    phoneNumberHash: text('phone_number_hash').notNull(),
    contactName: text('contact_name'), // WhatsApp contact name (pushname/notifyName)
    state: text('state', {
      enum: [
        'IDLE',
        'SEARCHING',
        'AWAITING_SELECTION',
        'AWAITING_SEASON_SELECTION',
        'AWAITING_CONFIRMATION',
        'PROCESSING',
      ],
    }).notNull(),
    mediaType: text('media_type', { enum: ['movie', 'series'] }),
    searchQuery: text('search_query'),
    searchResults: text('search_results', { mode: 'json' }), // JSON array
    selectedResultIndex: integer('selected_result_index'),
    selectedResult: text('selected_result', { mode: 'json' }), // JSON object
    availableSeasons: text('available_seasons', { mode: 'json' }), // JSON array of season info
    selectedSeasons: text('selected_seasons', { mode: 'json' }), // JSON array of season numbers
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    expiresAt: text('expires_at').notNull(),
  },
  (table) => ({
    phoneIdx: index('idx_conversation_phone').on(table.phoneNumberHash),
    expiresIdx: index('idx_conversation_expires').on(table.expiresAt),
    stateIdx: index('idx_conversation_state').on(table.state),
  })
);

// Media Service Configurations Table
export const mediaServiceConfigurations = sqliteTable(
  'media_service_configurations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    serviceType: text('service_type', { enum: ['radarr', 'sonarr', 'overseerr'] }).notNull(),
    name: text('name').notNull(),
    baseUrl: text('base_url').notNull(),
    apiKeyEncrypted: text('api_key_encrypted').notNull(),
    apiKeyIv: text('api_key_iv').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    priority: integer('priority').notNull(),
    maxResults: integer('max_results').notNull().default(5),
    // Radarr/Sonarr specific (not used for Overseerr)
    qualityProfile: text('quality_profile'),
    rootFolder: text('root_folder'),
    // Metadata
    lastHealthCheck: text('last_health_check'),
    healthStatus: text('health_status', { enum: ['ONLINE', 'OFFLINE', 'UNKNOWN'] })
      .notNull()
      .default('UNKNOWN'),
    version: text('version'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => ({
    serviceTypeIdx: index('idx_service_type').on(table.serviceType),
    enabledIdx: index('idx_service_enabled').on(table.enabled),
    priorityIdx: index('idx_service_priority').on(table.priority),
  })
);

// Request History Table
export const requestHistory = sqliteTable(
  'request_history',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    phoneNumberHash: text('phone_number_hash').notNull(),
    phoneNumberEncrypted: text('phone_number_encrypted'), // Encrypted phone number for notifications (format: iv:authTag:ciphertext)
    contactName: text('contact_name'), // WhatsApp contact name (pushname/notifyName)
    mediaType: text('media_type', { enum: ['movie', 'series'] }).notNull(),
    title: text('title').notNull(),
    year: integer('year'),
    tmdbId: integer('tmdb_id'),
    tvdbId: integer('tvdb_id'),
    serviceType: text('service_type', { enum: ['radarr', 'sonarr', 'overseerr'] }),
    serviceConfigId: integer('service_config_id'),
    selectedSeasons: text('selected_seasons', { mode: 'json' }), // JSON array of season numbers for series requests
    notifiedSeasons: text('notified_seasons', { mode: 'json' }), // JSON array of season numbers that user has been notified about
    notifiedEpisodes: text('notified_episodes', { mode: 'json' }), // JSON object: {"1": [1,2,3], "2": [1]} - season -> episode numbers notified
    totalSeasons: integer('total_seasons'), // Total number of available seasons (for detecting new releases)
    status: text('status', {
      enum: ['PENDING', 'APPROVED', 'REJECTED', 'SUBMITTED', 'FAILED'],
    }).notNull(),
    conversationLog: text('conversation_log', { mode: 'json' }), // JSON array of messages
    submittedAt: text('submitted_at'),
    errorMessage: text('error_message'),
    adminNotes: text('admin_notes'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => ({
    phoneIdx: index('idx_request_phone').on(table.phoneNumberHash),
    statusIdx: index('idx_request_status').on(table.status),
    createdAtIdx: index('idx_request_created').on(table.createdAt),
    serviceConfigIdx: index('idx_request_service').on(table.serviceConfigId),
  })
);

// Type inference helpers
export type AdminUser = typeof adminUsers.$inferSelect;
export type NewAdminUser = typeof adminUsers.$inferInsert;

export type WhatsappConnection = typeof whatsappConnections.$inferSelect;
export type NewWhatsappConnection = typeof whatsappConnections.$inferInsert;

export type ConversationSession = typeof conversationSessions.$inferSelect;
export type NewConversationSession = typeof conversationSessions.$inferInsert;

export type MediaServiceConfiguration = typeof mediaServiceConfigurations.$inferSelect;
export type NewMediaServiceConfiguration = typeof mediaServiceConfigurations.$inferInsert;

export type RequestHistory = typeof requestHistory.$inferSelect;
export type NewRequestHistory = typeof requestHistory.$inferInsert;

// Contacts Table (stores phoneNumberHash -> contactName mapping)
export const contacts = sqliteTable(
  'contacts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    phoneNumberHash: text('phone_number_hash').notNull().unique(),
    phoneNumberEncrypted: text('phone_number_encrypted'),
    contactName: text('contact_name'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => ({
    phoneIdx: index('idx_contacts_phone').on(table.phoneNumberHash),
  })
);

export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;

// Settings Table (stores application settings)
export const settings = sqliteTable(
  'settings',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    key: text('key').notNull().unique(),
    value: text('value', { mode: 'json' }),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => ({
    keyIdx: index('idx_settings_key').on(table.key),
  })
);

export type Setting = typeof settings.$inferSelect;
export type NewSetting = typeof settings.$inferInsert;

// Setup Status Table (tracks if initial setup is complete)
export const setupStatus = sqliteTable('setup_status', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  isCompleted: integer('is_completed', { mode: 'boolean' }).notNull().default(false),
  completedAt: text('completed_at'),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export type SetupStatus = typeof setupStatus.$inferSelect;
export type NewSetupStatus = typeof setupStatus.$inferInsert;

// Backup Codes Table (for password recovery)
export const backupCodes = sqliteTable(
  'backup_codes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    adminUserId: integer('admin_user_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    isUsed: integer('is_used', { mode: 'boolean' }).notNull().default(false),
    usedAt: text('used_at'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => ({
    userIdx: index('idx_backup_codes_user').on(table.adminUserId),
    usedIdx: index('idx_backup_codes_used').on(table.isUsed),
  })
);

export type BackupCode = typeof backupCodes.$inferSelect;
export type NewBackupCode = typeof backupCodes.$inferInsert;
