# GT7 Telemetry SaaS — Database Schema

## Tables

### users
| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| id | uuid | PK | gen_random_uuid() |
| email | text | UNIQUE, NOT NULL | - |
| name | text | - | - |
| tier | text | CHECK IN ('free','pro','ai_premium') | 'free' |
| stripe_customer_id | text | UNIQUE | - |
| created_at | timestamptz | NOT NULL | now() |
| updated_at | timestamptz | NOT NULL | now() |

### api_keys
| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| id | uuid | PK | gen_random_uuid() |
| user_id | uuid | FK → users.id, NOT NULL | - |
| key_hash | text | NOT NULL | - |
| name | text | NOT NULL | - |
| created_at | timestamptz | NOT NULL | now() |
| last_used | timestamptz | - | - |

### telemetry_sessions
| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| id | uuid | PK | gen_random_uuid() |
| user_id | uuid | FK → users.id, NOT NULL | - |
| car_name | text | - | - |
| car_code | integer | - | - |
| track_name | text | - | - |
| started_at | timestamptz | NOT NULL | now() |
| ended_at | timestamptz | - | - |
| total_laps | integer | DEFAULT 0 | 0 |
| best_lap_ms | integer | - | -1 |

### telemetry_points
| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| id | uuid | PK | gen_random_uuid() |
| session_id | uuid | FK → telemetry_sessions.id, NOT NULL | - |
| packet_id | integer | NOT NULL | - |
| timestamp | timestamptz | NOT NULL | now() |
| pos_x, pos_y, pos_z | double precision | - | - |
| vel_x, vel_y, vel_z | double precision | - | - |
| rot_x, rot_y, rot_z, rot_w | double precision | - | - |
| rpm | double precision | - | - |
| speed_ms | double precision | - | - |
| turbo_boost | double precision | - | - |
| throttle | integer (0-255) | - | - |
| brake | integer (0-255) | - | - |
| gear | integer (0-15) | - | - |
| suggested_gear | integer (0-15) | - | - |
| fuel_level | double precision | - | - |
| fuel_capacity | double precision | - | - |
| tire_temp_fl, tire_temp_fr, tire_temp_rl, tire_temp_rr | double precision | - | - |
| tire_radius_fl, tire_radius_fr, tire_radius_rl, tire_radius_rr | double precision | - | - |
| flags | integer (bitmask) | - | 0 |
| created_at | timestamptz | NOT NULL | now() |

### lap_data
| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| id | uuid | PK | gen_random_uuid() |
| session_id | uuid | FK → telemetry_sessions.id, NOT NULL | - |
| lap_number | integer | NOT NULL | - |
| start_ms | integer | - | - |
| end_ms | integer | - | - |
| lap_time_ms | integer | - | -1 |

### ai_analyses
| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| id | uuid | PK | gen_random_uuid() |
| session_id | uuid | FK → telemetry_sessions.id, NOT NULL | - |
| lap_number | integer | - | -1 |
| analysis_json | jsonb | - | - |
| suggestions | text[] | - | - |
| created_at | timestamptz | NOT NULL | now() |

### stripe_subscriptions
| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| id | uuid | PK | gen_random_uuid() |
| user_id | uuid | FK → users.id, NOT NULL | - |
| stripe_sub_id | text | UNIQUE | - |
| status | text | CHECK IN ('active','canceled','past_due','incomplete') | - |
| price_id | text | - | - |
| current_period_end | timestamptz | - | - |
| created_at | timestamptz | NOT NULL | now() |

## Row Level Security Policies

```sql
-- Users can only see their own data
CREATE POLICY "users_select_own_data" ON telemetry_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_insert_own_data" ON telemetry_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_update_own_data" ON telemetry_sessions FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "users_select_own_telemetry" ON telemetry_points FOR SELECT USING (EXISTS (SELECT 1 FROM telemetry_sessions WHERE telemetry_sessions.id = telemetry_points.session_id AND telemetry_sessions.user_id = auth.uid()));
CREATE POLICY "ingest_insert_telemetry" ON telemetry_points FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM telemetry_sessions WHERE telemetry_sessions.id = telemetry_points.session_id AND telemetry_sessions.user_id = auth.uid()));

CREATE POLICY "users_select_own_api_keys" ON api_keys FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_insert_own_api_keys" ON api_keys FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_delete_own_api_keys" ON api_keys FOR DELETE USING (auth.uid() = user_id);

-- API keys table: ingest uses key_hash lookup, not auth.uid()
-- This is handled in the API layer, not RLS
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE lap_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_subscriptions ENABLE ROW LEVEL SECURITY;
```
