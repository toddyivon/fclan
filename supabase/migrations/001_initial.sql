-- GT7 Telemetry SaaS - Initial Schema
-- Run this in your Supabase SQL editor or via `supabase db push`

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tables
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  name text,
  tier text CHECK (tier IN ('free', 'pro', 'ai_premium')) DEFAULT 'free' NOT NULL,
  stripe_customer_id text UNIQUE,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) NOT NULL,
  key_hash text NOT NULL,
  name text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  last_used timestamptz
);

CREATE TABLE telemetry_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) NOT NULL,
  car_name text,
  car_code integer,
  track_name text,
  started_at timestamptz DEFAULT now() NOT NULL,
  ended_at timestamptz,
  total_laps integer DEFAULT 0,
  best_lap_ms integer DEFAULT -1
);

CREATE TABLE telemetry_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES telemetry_sessions(id) NOT NULL,
  packet_id integer NOT NULL,
  timestamp timestamptz DEFAULT now() NOT NULL,
  pos_x double precision, pos_y double precision, pos_z double precision,
  vel_x double precision, vel_y double precision, vel_z double precision,
  rot_x double precision, rot_y double precision, rot_z double precision, rot_w double precision,
  rpm double precision, speed_ms double precision, turbo_boost double precision,
  throttle integer, brake integer, gear integer, suggested_gear integer,
  fuel_level double precision, fuel_capacity double precision,
  tire_temp_fl double precision, tire_temp_fr double precision, tire_temp_rl double precision, tire_temp_rr double precision,
  tire_radius_fl double precision, tire_radius_fr double precision, tire_radius_rl double precision, tire_radius_rr double precision,
  flags integer DEFAULT 0,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE lap_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES telemetry_sessions(id) NOT NULL,
  lap_number integer NOT NULL,
  start_ms integer,
  end_ms integer,
  lap_time_ms integer DEFAULT -1
);

CREATE TABLE ai_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES telemetry_sessions(id) NOT NULL,
  lap_number integer DEFAULT -1,
  analysis_json jsonb,
  suggestions text[],
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE stripe_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) NOT NULL,
  stripe_sub_id text UNIQUE,
  status text CHECK (status IN ('active', 'canceled', 'past_due', 'incomplete')),
  price_id text,
  current_period_end timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX idx_telemetry_sessions_user_id ON telemetry_sessions(user_id);
CREATE INDEX idx_telemetry_points_session_id ON telemetry_points(session_id);
CREATE INDEX idx_telemetry_points_session_packet ON telemetry_points(session_id, packet_id);
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_ai_analyses_session_id ON ai_analyses(session_id);
CREATE INDEX idx_stripe_subscriptions_user_id ON stripe_subscriptions(user_id);

-- Row Level Security
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE lap_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "users_select_own_sessions" ON telemetry_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_insert_own_sessions" ON telemetry_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_update_own_sessions" ON telemetry_sessions FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "users_select_own_api_keys" ON api_keys FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_insert_own_api_keys" ON api_keys FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_delete_own_api_keys" ON api_keys FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "users_select_own_telemetry" ON telemetry_points FOR SELECT USING (EXISTS (SELECT 1 FROM telemetry_sessions WHERE telemetry_sessions.id = telemetry_points.session_id AND telemetry_sessions.user_id = auth.uid()));

CREATE POLICY "users_select_own_lap_data" ON lap_data FOR SELECT USING (EXISTS (SELECT 1 FROM telemetry_sessions WHERE telemetry_sessions.id = lap_data.session_id AND telemetry_sessions.user_id = auth.uid()));

CREATE POLICY "users_select_own_ai_analyses" ON ai_analyses FOR SELECT USING (EXISTS (SELECT 1 FROM telemetry_sessions WHERE telemetry_sessions.id = ai_analyses.session_id AND telemetry_sessions.user_id = auth.uid()));

CREATE POLICY "users_select_own_stripe_sub" ON stripe_subscriptions FOR SELECT USING (auth.uid() = user_id);

-- Auto-update updated_at trigger for users table
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
