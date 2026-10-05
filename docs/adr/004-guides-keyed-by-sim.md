# 004. Guides keyed by sim, with fallback order

- Status: Accepted
- Date: 2026-10-04

## Context

The same car on the same track drives differently in Assetto Corsa, ACC, iRacing or real life (tyre models, physics, track scans). One guide per car would mix incompatible numbers; one per car × sim × layout would be tedious to fill in.

## Decision

- `Guide.sim` is a `SimId` or `null` (applies to any sim). Supported sims live in `packages/schema/src/sim.ts`; adding one is an append to that list.
- `Track.sims` lists where a track exists; `Car.sim` optionally pins a car to a sim.
- The guide shown for a car in a sim is resolved by `resolveGuide()` in `packages/schema`, most to least specific:
  1. this car, this sim
  2. this car, any sim
  3. the car's class, this sim
  4. the car's class, any sim
- A guide for a different sim is never used. Ties go to the most recently updated guide.
- Car-specific beats sim-specific: a car's own any-sim guide is closer than a class guide for the exact sim.

## Consequences

- Writing one class-level, any-sim guide gives every car a starting point; refine with specifics later.
- The header selector needs both a car and a sim (sim optional).
