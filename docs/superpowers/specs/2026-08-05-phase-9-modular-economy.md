# Phase 9 — Modular Economy & Post-Race Shop (design spec)

> **SUPERSEDED (2026-08-11)** by
> `docs/superpowers/specs/2026-08-11-phase-9-modular-economy-shop.md`. This version's payout
> model (placement 1st/2nd/3rd, fastest lap) assumes rivals and laps, neither of which the
> shipped game has; the successor re-bases payout on the real route/traffic/collision signals
> and keeps the baseline-50 + 80-part trade-off model intact. Kept for provenance.

Source spec for `plan.md` Phase 9. Replaces the earlier linear, tier-based progression with a
**modular, stat-altering** economy: vehicles start from a median baseline and players buy/equip
specialized parts that shift core physics metrics, forcing strategic trade-offs rather than a
strict upgrade ladder.

> Provenance: distilled from the working note `additoinal_phase_garage_shop.md` (root, now
> removed). An unrelated "GridClash / EconomyManager.swift / recursive-reveal" section pasted into
> that note was a cross-project paste error and is intentionally excluded.

---

## 1. Currency & payout logic
Credits are awarded immediately on crossing the finish line, transitioning the player to the
Post-Race Summary screen.

- **Placement payout** — fixed base scaled by final race position (e.g. 1st = 1000c, 2nd = 750c,
  3rd = 500c).
- **Fastest-lap bonus** — flat premium (e.g. 500c) awarded only if the player holds the fastest
  single lap of the session, rewarding time-attack precision even on a lost race.
- **Clean-race bonus** — minor multiplier (e.g. 1.1×) for avoiding trackside collisions.

## 2. Vehicle base metrics
Every vehicle starts at a **median baseline of 50/100** on all core physics parameters; parts add
or subtract from these baselines.

| Metric | Physics mapping | Description |
| :--- | :--- | :--- |
| **Top Speed** | `maxSpeed` | Absolute maximum velocity reachable in High Gear. |
| **Acceleration** | `accel` | How quickly the vehicle reaches Top Speed from standstill or after a crash. |
| **Handling** | `maxSteer` | Steering responsiveness and cornering tightness. |
| **Grip** | `centrifugal` | Skid-state threshold and off-road deceleration resistance. |

## 3. The 20-part matrix (inventory schema)
Four categories × 20 distinct purchasable items (80 total). Higher-tier items are extreme
specializations with notable trade-offs, not strictly-better upgrades.

- **Engine (20)** — biases Top Speed. High-end engines (e.g. "V8 Twin-Turbo") drastically raise
  `maxSpeed` but add a minor Handling penalty (weight).
- **Transmission (20)** — biases Acceleration. Short-ratio gearboxes give explosive launch speed
  but cap absolute Top Speed.
- **Suspension (20)** — biases Handling. Stiff track-tuned suspensions maximize steering
  responsiveness but reduce Grip on off-road segments.
- **Wheels/Tires (20)** — biases Grip. Soft racing slicks raise the cornering/skid threshold but
  shave a little Top Speed (friction).

## 4. Post-race shop window (Garage UI)
The race→Garage transition is seamless and data-driven.

- **Summary screen** — race ledger breakdown (Placement + bonuses = Total Credits).
- **Shop interface** — horizontal carousel of the four part categories.
- **Stat-diff UI** — hovering/selecting an unowned part shows a visual diff (red/green bars)
  comparing the currently equipped part's stats against the selected part's.
- **Equip/buy state** — each part is **Locked** (insufficient funds), **Purchasable**, **Owned**,
  or **Equipped**.

## 5. Implementation directives
- `types/inventory.ts` — `Part` interface (`id, name, category, cost, speedMod, accelMod,
  handlingMod, gripMod`) and an `EquippedLoadout` (one part per category).
- Generate a **JSON catalog of all 80 parts** (20 per category) with tuned mod values so no single
  loadout dominates.
- `economy/Garage.ts` — pure **loadout resolver**: `baseline(50) + Σ equipped mods → effective
  Vehicle params`, feeding `physics/Vehicle.ts`. Owned parts, equipped loadout, and credits live in
  the save (`SaveBackend`).
- `ui/GarageScreen` — Summary + carousel + stat-diff bars + per-part state machine.
- Payout module — pure function of `{position, heldFastestLap, hadCollision}` → credits.

## 6. Testing (vitest)
- Payout curve: placement tiers, fastest-lap bonus gating, clean-race multiplier.
- Loadout resolution: baseline + mods → effective params, including trade-off penalties.
- Balance guard: no single loadout wins every metric (specialization holds).
- Save/load round-trip of `{credits, owned, equipped}`.

## 7. Done-when
Race→earn→buy→equip loop is closed and persisted; equipping a part visibly and correctly shifts
effective physics; stat-diff UI reflects real deltas; costs tuned for a ~20-min/day player; economy
math unit-tested; specialization trade-offs prevent a dominant loadout.
