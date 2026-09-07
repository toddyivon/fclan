# GT7 Telemetry SaaS — Product Spec

## Overview
A SaaS platform that captures live telemetry data from Gran Turismo 7 via UDP, stores it in the cloud, visualizes it with an animated gaming-themed dashboard, and uses AI to provide lap analysis and driving suggestions.

## Tiers

### Free ($0)
- Live telemetry view (basic: speed, RPM, gear)
- Session history (last 7 days only)
- Basic charts (speed, RPM)
- 1 API key
- Mobile app capture enabled

### Pro — $9.99/mo (Recommended)
- Everything in Free
- Unlimited session history
- AI lap analysis (up to 50/month)
- Lap comparison overlay
- Interactive track maps
- 5 API keys
- Tire temperature visualization
- Telemetry export (CSV/JSON)

### AI Premium — $24.99/mo
- Everything in Pro
- Advanced AI coaching with personalized suggestions
- Ghost lap generation and replay
- Predictive tire & fuel strategy
- Real-time AI suggestions during driving
- Unlimited API keys
- Priority analysis queue (no wait)
- Unlimited AI analyses

## Data Flow
1. User runs GT7 on PS4/PS5 with Simulator Interface enabled in settings
2. Phone (same WiFi) captures UDP packets via React Native app
3. Phone decrypts Salsa20, forwards decoded telemetry to cloud via HTTPS POST
4. Cloud stores telemetry in Supabase with user-scoped RLS
5. Web dashboard reads telemetry via Supabase Realtime (WebSocket)
6. User requests AI analysis → cloud sends telemetry summary to GPT-4o-mini → streams response
