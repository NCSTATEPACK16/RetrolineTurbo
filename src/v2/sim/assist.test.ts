import { describe, it, expect } from 'vitest';
import { Button, emptyInput } from './input.js';
import { buildSimTrack, halfWidthAt } from './track.js';
import { createWorld, stepWorld } from './world.js';
import { createRace, stepRace, lapOf } from './race.js';
import { Assist, JUNIOR } from './assist.js';
import { parseTrackFile } from '../track/schema.js';
import sunset from '../track/circuits/sunset-beach.json';

const circuit = parseTrackFile(sunset);
const track = buildSimTrack(circuit.def);
const straight = buildSimTrack({ name: 's', halfWidth: 9, sections: [{ length: 3000, curvature: 0 }] });

describe('Junior assist', () => {
  it('auto-accelerate drives with no buttons, and still lets you brake', () => {
    const w = createWorld(1);
    w.assist[0] = Assist.AutoAccel;
    for (let t = 0; t < 120; t++) stepWorld(w, straight, [emptyInput()]);
    expect(w.cars[0]!.speed).toBeGreaterThan(10);
    for (let t = 0; t < 120; t++) stepWorld(w, straight, [{ steer: 0, buttons: Button.Brake }]);
    expect(w.cars[0]!.speed).toBeLessThanOrEqual(0);
  });

  it('road-keeping eases a car back from the edge', () => {
    const w = createWorld(1);
    w.assist[0] = Assist.AutoAccel | Assist.RoadKeep;
    w.cars[0]!.x = 8.8;
    w.cars[0]!.speed = 25;
    for (let t = 0; t < 120; t++) stepWorld(w, straight, [emptyInput()]);
    expect(w.cars[0]!.x).toBeLessThan(halfWidthAt(straight, 0) - 1);
  });

  it('is per player: an unassisted car with no input goes nowhere', () => {
    const w = createWorld(2);
    w.assist[0] = JUNIOR;
    for (let t = 0; t < 120; t++) stepWorld(w, straight, [emptyInput(), emptyInput()]);
    expect(w.cars[0]!.speed).toBeGreaterThan(5);
    expect(w.cars[1]!.speed).toBe(0);
  });

  it('a Junior player who never touches a button finishes a full race, mostly on the road', () => {
    const w = createWorld(1);
    w.assist[0] = JUNIOR;
    const race = createRace(w, track, circuit.layout.grid, [0], [true], 3);
    const inputs = [emptyInput()];
    const scratch = [emptyInput()];
    let offroad = 0;
    let drifts = 0;
    for (let t = 0; t < 60 * 400 && race.phase !== 'finished'; t++) {
      const was = w.cars[0]!.drift;
      stepRace(race, w, track, inputs, scratch);
      if (was === 0 && w.cars[0]!.drift !== 0) drifts++;
      if (Math.abs(w.cars[0]!.x) > halfWidthAt(track, w.cars[0]!.s)) offroad++;
    }
    expect(race.phase).toBe('finished');
    expect(lapOf(race.racers[0]!)).toBe(3);
    expect(offroad / race.tick).toBeLessThan(0.05);
    expect(drifts).toBeGreaterThan(3); // auto-drift found the corners
  });

  it('steering still works on top of the assist', () => {
    const w = createWorld(1);
    w.assist[0] = JUNIOR;
    w.cars[0]!.speed = 20;
    for (let t = 0; t < 30; t++) stepWorld(w, straight, [{ steer: 127, buttons: 0 }]);
    expect(w.cars[0]!.x).toBeGreaterThan(1);
  });
});
