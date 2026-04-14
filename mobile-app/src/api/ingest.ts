import axios from 'axios';
import type { Gt7Telemetry } from '../gt7/parser';

const ingest = axios.create({
  timeout: 10_000,
});

export async function sendTelemetryBatch(
  baseUrl: string,
  apiKey: string,
  sessionId: string | null,
  points: Gt7Telemetry[],
  carName?: string,
  trackName?: string,
  carCode?: number
): Promise<{ session_id: string }> {
  return ingest.post(
    `${baseUrl}/api/ingest`,
    {
      session_id: sessionId,
      car_name: carName,
      car_code: carCode,
      track_name: trackName,
      points: points.map((p) => ({
        packet_id: p.packetId,
        posX: p.posX, posY: p.posY, posZ: p.posZ,
        velX: p.velX, velY: p.velY, velZ: p.velZ,
        rpm: p.rpm,
        speed_ms: p.speedMs,
        turbo_boost: p.turboBoost,
        throttle: p.throttle,
        brake: p.brake,
        gear: p.gear,
        suggested_gear: p.suggestedGear,
        fuel_level: p.fuelLevel,
        fuel_capacity: p.fuelCapacity,
        tire_temp_fl: p.tireTempFl, tire_temp_fr: p.tireTempFr,
        tire_temp_rl: p.tireTempRl, tire_temp_rr: p.tireTempRr,
        tire_radius_fl: p.tireRadiusFl, tire_radius_fr: p.tireRadiusFr,
        tire_radius_rl: p.tireRadiusRl, tire_radius_rr: p.tireRadiusRr,
        flags: p.flags,
      })),
      is_new_session: sessionId === null,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    }
  ).then((r) => r.data);
}
