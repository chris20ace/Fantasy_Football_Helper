import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const cache = sqliteTable('fantasy_cache', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updated: integer('updated').notNull(),
});
export const preferences = sqliteTable('preferences', {
  user: text('user').primaryKey(),
  value: text('value').notNull(),
  updated: integer('updated').notNull(),
});
