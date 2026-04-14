import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  doublePrecision,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const tierEnum = pgEnum("tier", ["free", "pro", "ai_premium"]);
export const subStatusEnum = pgEnum("sub_status", ["active", "canceled", "past_due", "incomplete"]);

const ts = () => timestamp({ withTimezone: true, mode: 'date' });

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").unique().notNull(),
  name: text("name"),
  tier: tierEnum("tier").default("free").notNull(),
  stripeCustomerId: text("stripe_customer_id").unique(),
  createdAt: ts().defaultNow().notNull(),
  updatedAt: ts().defaultNow().notNull(),
});

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  keyHash: text("key_hash").notNull(),
  name: text("name").notNull(),
  createdAt: ts().defaultNow().notNull(),
  lastUsed: ts(),
});

export const telemetrySessions = pgTable("telemetry_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  carName: text("car_name"),
  carCode: integer("car_code"),
  trackName: text("track_name"),
  startedAt: ts().defaultNow().notNull(),
  endedAt: ts(),
  totalLaps: integer("total_laps").default(0),
  bestLapMs: integer("best_lap_ms").default(-1),
});

export const telemetryPoints = pgTable("telemetry_points", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").references(() => telemetrySessions.id).notNull(),
  packetId: integer("packet_id").notNull(),
  timestamp: ts().defaultNow().notNull(),
  posX: doublePrecision("pos_x"),
  posY: doublePrecision("pos_y"),
  posZ: doublePrecision("pos_z"),
  velX: doublePrecision("vel_x"),
  velY: doublePrecision("vel_y"),
  velZ: doublePrecision("vel_z"),
  rotX: doublePrecision("rot_x"),
  rotY: doublePrecision("rot_y"),
  rotZ: doublePrecision("rot_z"),
  rotW: doublePrecision("rot_w"),
  rpm: doublePrecision("rpm"),
  speedMs: doublePrecision("speed_ms"),
  turboBoost: doublePrecision("turbo_boost"),
  throttle: integer("throttle"),
  brake: integer("brake"),
  gear: integer("gear"),
  suggestedGear: integer("suggested_gear"),
  fuelLevel: doublePrecision("fuel_level"),
  fuelCapacity: doublePrecision("fuel_capacity"),
  tireTempFl: doublePrecision("tire_temp_fl"),
  tireTempFr: doublePrecision("tire_temp_fr"),
  tireTempRl: doublePrecision("tire_temp_rl"),
  tireTempRr: doublePrecision("tire_temp_rr"),
  tireRadiusFl: doublePrecision("tire_radius_fl"),
  tireRadiusFr: doublePrecision("tire_radius_fr"),
  tireRadiusRl: doublePrecision("tire_radius_rl"),
  tireRadiusRr: doublePrecision("tire_radius_rr"),
  flags: integer("flags").default(0),
  createdAt: ts().defaultNow().notNull(),
});

export const lapDataTable = pgTable("lap_data", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").references(() => telemetrySessions.id).notNull(),
  lapNumber: integer("lap_number").notNull(),
  startMs: integer("start_ms"),
  endMs: integer("end_ms"),
  lapTimeMs: integer("lap_time_ms").default(-1),
});

export const aiAnalysesTable = pgTable("ai_analyses", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").references(() => telemetrySessions.id).notNull(),
  lapNumber: integer("lap_number").default(-1),
  analysisJson: jsonb("analysis_json"),
  suggestions: text("suggestions").array(),
  createdAt: ts().defaultNow().notNull(),
});

export const stripeSubscriptions = pgTable("stripe_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  stripeSubId: text("stripe_sub_id").unique(),
  status: subStatusEnum("status"),
  priceId: text("price_id"),
  currentPeriodEnd: timestamp({ withTimezone: true }),
  createdAt: ts().defaultNow().notNull(),
});
