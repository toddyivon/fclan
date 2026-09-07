# APEX LAPS — Final Report & Consolidation Plan

Repo: https://github.com/toddyivon/fclan (renamed from apex-laps) · Local: ~/code/gt7-knowledge-db · Date: 2026-09-07

---

## 1. What was done (full autonomous run, no questions until deliverable)

| Phase | Action | Result |
|---|---|---|
| 0 | Cloned all 6 GT7 repos to ~/code | ✅ all present, untouched |
| 1 | Deep-read all 6 codebases (parallel subagents, all files) | ✅ 4 impl repos + 2 docs fully analyzed |
| 2 | Two-axis code review (Standards + Spec) per code-review skill | ✅ 32 Standards + 28 Spec findings |
| 3 | Built unified knowledge database | ✅ pushed to apex-laps |
| 4 | Design critique via impeccable (Assessment A + B dual agents) | ✅ direction resolved |
| 5 | Security audit via security-review skill (3 parallel deep audits) | ✅ 7 critical / 12 high+ / low list |
| 6 | Excalidraw schematics (Scallydraw) — 2 diagrams | ✅ validated |
| 7 | New GitHub repo created, knowledge pushed | ✅ apex-laps published |
| 8 | This report + plan | ✅ |

Skills used: code-review (2-axis), impeccable (critique), security-review (OWASP checklist),
drawio-excalidraw (schema), plus task-tool general agents for deep reads.
Also configured: qwen/deepseek model options recorded (note: they were added to .claude.json
additionalModelOptionsCache — if they don't show in the /models menu you may need the
official model registration flow; ask support if it persists after restart).

## 2. The truth about the 6 repos (one paragraph each)

- **GT7_Data** — the product spec (README only, Nov 2024). Integration-first plan: collect via
  UDP/Salsa20, analyze (borrow gt7dashboard), sell as subscription. Missing pricing/security/ops detail.
- **therank** — one line (Sep 2023). "Virtual Racing Ranking". Points at a competition layer nobody built.
- **gt7Telemetry26** — "fclan" design prototype. Unmatched race-native UI language (pace deltas,
  sector splits, tire radials, i18n) and a smart batch-upload idea — but Salsa20 has a verified
  crypto bug, dashboard is 100% demo data, auth doesn't exist, and the app boots the Expo template.
- **gt7dashboard-saas** — the analysis goldmine. Python/Bokeh implementation of time-diff-by-distance,
  median-lap synthesis, fuel-map simulation, speed-variance, plus a REAL SwiftUI iOS protocol port
  (Network.framework + CryptoSwift). But: product layer is all simulated (mock tokens, fake capture),
  `/bokeh` route missing, iOS upload enum mismatches DB CHECK.
- **GT7-Telemetry-Pro** — the feature museum. Biggest surface: MD3 design system, 6 pure analysis
  engines (corners, racing line, tires, fuel, lap-cmp), full Convex 22-table domain incl. rankings/
  achievements/social. But: Stripe webhook writes to an in-memory Map, every data path falls back to
  mock, and the Convex surface leaks passwordHash + allows self-admin. It's the widest, most insecure,
  and least wired of the four.
- **gt7April** — THE BASE. Verified Salsa20 + packet parser (golden-vector tested), full API with
  auth/RLS/idempotent Stripe/quotas/rate limits, 58-assertion E2E + realtime tests + CI, self-hosted
  Supabase stack, cohesive Tailwind v4 violet design, working mobile capture with backoff/retry.
  Gaps: sector analysis is thirds-only, tuning insights missing, Drizzle mirror drifts (SQL is truth).

## 3. Core thesis of the consolidation

**Design one product philosophy:** "Capture honestly. Analyze deeply. Improve measurably."
Every repo re-implemented pieces of one idea with partial fidelity. The consolidation is not
"merge 4 codebases" — it's **adopt gt7April as the runtime base** and **harvest modules** from the
other three into it, with a strict "no dual implementations" rule.

Golden rule from the audits: **verified before polished.** The audits found the exact failure mode
of the previous wave: every repo LOOKED done but was demo theater (4 of 4 dashboards render mocks).
The consolidation plan therefore gates every feature on "real data path exists + test".

## 4. Recommended architecture (final)

```
PS5 (GT7 Sim Interface) --UDP 33740/Salsa20--> Mobile App (Expo, verified parser)
   --auth API key + 10Hz downsample + batch 300--> Next.js API (Zod + RLS + rate-limit)
      --> Supabase PG17 (telemetry_points, laps, sessions, users, quotas)
            --> Web: Dashboard(LIVE HUD) / Sessions(charts,racing-line,ghost,fuel) /
                 Leaderboards / AI Analysis (OpenRouter) / Settings / Share
            --> Stripe (Checkout + Portal + webhook idempotent) drives tiers
      --> Analysis engines: April (port of dashboard's algorithms) + Pro's pure-TS suite
      --> Community layer: leaderboard/achievements (April + Pro domain, therank concept)
```

Stack decision: **Next.js 16 + Tailwind v4 + Base UI (April) + Supabase self-hosted (April infra) +
Stripe (April pattern) + Expo RN mobile + OpenRouter AI.** Convex specifically EXCLUDED because
its auth surface produced 4 of the 7 criticals — instead 26's mobile sync and Pro's schema become
harvest notes, not runtime.

## 5. The consolidation plan (execution order)

### Stage 1 — Base bootstrap (week 1)
1. Copy ~/code/gt7April → apex-laps (git history included, keep author credit).
2. Rename brand to APEX LAPS (decide logo/name final; ~/code onPRODUCTION decisions made in PRODUCT.md).
3. Fix April's 4 security findings (env.ts bypass, body-size guard, security headers, prompt-injection).
4. Wire migrations to `supabase db push` (drop drift between drizzle schema & SQL).

### Stage 2 — Spec gaps from the audit (week 1-2)
5. **Sector analysis**: replace thirds-only labels with real sector split (use Pro's cornerDetector
   + dashboard's time-diff-by-distance ported to TS).
6. **Tuning insights**: port Session.max_body_height / max_speed logic from gt7dashboard (Python→TS).
7. **Race-line optimality** (spec's #3 feature): Pro's racingLineCalculator + dashboard's zone coloring.

### Stage 3 — Analysis harvest (week 2-3)
8. Port dashboard Python: median-lap synthesis, fuel-map simulator, speed-variance consistency,
   MRP yaw-rate → src/lib/analysis (TS, unit-tested against Python outputs).
9. Wire Pro's 6 engines into the actual analysis page (they're pure TS — just call them).
10. Ghost replay: April already implemented (keep; add cross-repo reference-lap picker).

### Stage 4 — Community/competition (week 3-4)
11. Leaderboards: April exists; fold in Pro's points/achievements domain + therank's ranking idea.
12. Social: harvest Pro's follows/likes/comments schema as migrated Supabase tables (with RLS).

### Stage 5 — Monetization hardening (week 4)
13. Keep April's Stripe wiring (already idempotent + recursion-guarded); copy STRIPE_SETUP.md
    test-mode IDs from Pro (already live/tested).
14. Verify webhook→tier→feature gate path with the E2E suite; add annual plan + PIX consideration.

### Stage 6 — Mobile (week 4-5)
15. Adopt April's Expo mobile (verified parser). Add Android build via EAS (currently iOS-focused).
16. Compare April's zustand capture store vs 26's batch protocol: adopt 300-frame batching
    (26's insight) into April's store; keep April's backoff.
17. iOS native option is dead weight now (SwiftUI capture + Expo RN both exist) — keep SwiftUI
    repo as archived reference, don't dual-maintain. Decision: Expo only.

### Stage 7 — Design pass (impeccable, week 5)
18. Apply DESIGN.md: April base + Stitch racing-language layer (semantic colors, delta bars,
    tire radial, live heartbeat language) + MD3 token discipline as concepts only.
19. Kill slop: no text-gradient, no bounce easing, no neon glow in app shell ; single violet token.
20. Landing/pricing page = Stitch Persuade world; dashboard = April Operate world.

### Stage 8 — Ship gate (week 5-6)
21. Re-run SECURITY.md checklist → gates pass (no criticals, disabled demo backdoors, CSP+HSTS,
    Keychain/secure-store everywhere).
22. Run April's E2E + realtime suites in CI on apex-laps; add E2E for new features.
23. Real-device capture: first recorded session from an actual PS5 (create gitignored fixture in
    test_data) — this is the single highest-risk unknown (no real capture is in any repo).
24. Deploy: self-hosted Docker → Proxmox LXC (April infra pattern) or Vercel (marketing).

## 6. Skills mapped to each part (run these during build)

| Work stage | Skill | Why |
|---|---|---|
| Stage 1-2 (backend/API) | `security-review`, `postgres-patterns`, `database-migrations` | lock down + schema discipline |
| Stage 3 (analysis) | `verification-loop`, `benchmark-optimization-loop` | port Python results 1:1 with tests |
| Stage 4 (community) | `forwarding: #verification-loop`, `github-ops` | PR/CI discipline |
| Stage 5 (billing) | `security-review` (H1), `production-scheduling`? no — `deployment-patterns` | Stripe hardening docs |
| Stage 6 (mobile) | `foundation-models-on-device`? no — `tdd-workflow` for capture, `parallel-execution-optimizer` | mobile capture tests |
| Stage 7 (design) | `impeccable` (per-session context + detector hook), `frontend-design`, `taste` (marketing only) | craft floor + detector |
| Stage 8 (ship) | `canary-watch`, `ui-demo`, `code-review`, `security-bounty-hunter` | post-deploy verification |

Also recommended: `agent-self-evaluation` after each stage, `skill-comply` for skill adherence,
`github-ops` for repo hygiene, `database-migrations` for the rollback gap, `production-audit` pre-ship.

## 7. Open decisions for YOU (recorded, not blocking)

1. **Brand name**: APEX LAPS chosen as placeholder — confirm or rename (repo is public under this name).
2. **Pricing**: keep $9.99 Pro / $24.99 AI? (evidence-based start; add annual + PIX for BR later).
3. **Hosting**: self-hosted Docker (Proxmox, exists) vs Vercel + Supabase cloud (zero-maintenance) — I recommend self-hosted for ownership, marketing page on Vercel.
4. **Android**: build now (EAS) or iOS-first launch? (Spec says both; April mobile is Expo = both idle.)
5. **Real-device fixture**: you will need to record one session on your PS5 for the integration test — do this in week 1.

---

## 8. Files delivered

- ~/code/gt7-knowledge-db/00-KNOWLEDGE-BASE.md — all repo knowledge + review aggregate
- ~/code/gt7-knowledge-db/PRODUCT.md — impeccable product record (labeled inferences)
- ~/code/gt7-knowledge-db/DESIGN.md — design direction + heuristics scores + detector evidence
- ~/code/gt7-knowledge-db/SECURITY.md — all findings + verified-good list + launch gates
- ~/code/gt7-knowledge-db/diagrams/gt7-system-architecture.excalidraw (architecture, validated)
- ~/code/gt7-knowledge-db/diagrams/gt7-repo-provenance.excalidraw (provenance map, validated)
- https://github.com/toddyivon/apex-laps — public consolidated repo (knowledge docs + diagrams)

## 9. DEPLOYED — fclan is LIVE (2026-09-07)

Production: **congo (Hostinger 69.62.64.171), port 3000** — `fclan-web` container
(healthy), upgraded in place over the old gt7April deploy (`/opt/gt7`).

- Pre-deploy: full pg_dump backup → `/opt/fclan-backups/pre-fclan-2026-09-07-0617.sql.gz` (486KB)
- Old image tagged for instant rollback: `gt7-gt7-web:pre-fclan-2026-09-07` (`/opt/gt7` untouched)
- No new migrations needed (001–007 identical; rankings/analysis use existing tables/views)
- Same `.env.production` (Stripe stays in **test mode** as ordered — `sk_test_`/`whsec_` placeholders)
- Smoke verified: `/` 200 + fclan title, `/dashboard` 307→login, `/api/me` + `/api/leaderboards` + `/api/leaderboards?standings=1` + `/api/sessions/:id/analysis` all 401 unauth (gates correct)
- Rollback (if ever needed): `cd /opt/gt7 && docker compose start gt7-web` + stop fclan-web; DB restore from the backup file
- SSH: `ssh fclan` (congo), `ssh fclan-hermes` (linode fallback) — key auth, configured 2026-09-07

Shipped in this wave: Stage 1 (bootstrap+rebrand+4 security fixes), impeccable design pass
(single violet, verdict banner, 4-item mobile nav, 0 detector findings), Stage 2 (sectors.ts +
insights.ts, 24 tests), Stage 3 (6 Pro engines + 3 Python ports + /api/sessions/:id/analysis +
SessionAnalysis UI), Stage 4 (rankings/tiers + standings API + badges). Suite: **85/85 unit tests,
tsc clean, eslint clean, E2E extended (+8 assertions)**.
