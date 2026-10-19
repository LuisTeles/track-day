// @vitest-environment node
import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { GuideImportPayload, TrackImportPayload } from "@track-day/schema";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Repositories } from "../repositories";
import { TrackDayDb } from "./db";
import { createLocalRepositories } from "./local-repositories";

const interlagos = TrackImportPayload.parse(
  JSON.parse(
    readFileSync(new URL("../../../../../examples/interlagos.track.json", import.meta.url), "utf8"),
  ),
);
const guidePayload = GuideImportPayload.parse({
  schemaVersion: 2,
  kind: "guide",
  guide: {},
  corners: [{ cornerNumber: 1, gear: 2 }],
});

let db: TrackDayDb;
let repos: Repositories;

beforeEach(() => {
  db = new TrackDayDb(`test-${crypto.randomUUID()}`);
  repos = createLocalRepositories(db);
});
afterEach(() => db.delete());

const newClass = (name: string) =>
  repos.carClasses.create({ name, description: "", drivetrain: null, downforce: null });
const newCar = (name: string, classId: string) =>
  repos.cars.create({
    name,
    classId,
    sim: null,
    powerHp: null,
    weightKg: null,
    drivetrain: null,
    downforce: null,
    transmission: null,
    abs: null,
    tc: null,
  });

async function setup() {
  const { layoutId } = await repos.trackImport.importTrack(interlagos);
  const gt3 = await newClass("GT3");
  const car = await newCar("Porsche 911 GT3 R", gt3.id);
  const other = await newCar("Ferrari 296 GT3", gt3.id);
  const guide = async (target: { carId: string } | { carClassId: string }) =>
    (await repos.guideImport.importGuide(guidePayload, { layoutId, target, sim: null })).guideId;
  return {
    layoutId,
    gt3,
    car,
    other,
    carGuide: await guide({ carId: car.id }),
    otherGuide: await guide({ carId: other.id }),
    classGuide: await guide({ carClassId: gt3.id }),
  };
}

describe("deleteCar", () => {
  it("removes the car with its guides and their corner guides", async () => {
    const { layoutId, car, other, carGuide, otherGuide, classGuide } = await setup();

    await repos.carDeletion.deleteCar(car.id);

    expect((await repos.cars.list()).map((c) => c.id)).toEqual([other.id]);
    expect((await repos.guides.listByLayout(layoutId)).map((g) => g.id).sort()).toEqual(
      [otherGuide, classGuide].sort(),
    );
    expect(await repos.cornerGuides.listByGuide(carGuide)).toEqual([]);
    expect(await repos.cornerGuides.listByGuide(otherGuide)).toHaveLength(1);
  });

  it("rejects an unknown car", async () => {
    await expect(repos.carDeletion.deleteCar(crypto.randomUUID())).rejects.toThrow(/not found/);
  });
});

describe("deleteCarClass", () => {
  it("refuses a class that still has cars", async () => {
    const { gt3 } = await setup();
    await expect(repos.carDeletion.deleteCarClass(gt3.id)).rejects.toThrow(/still has 2 cars/);
  });

  it("removes an empty class with its class guides", async () => {
    const { layoutId, gt3, car, other, classGuide } = await setup();
    await repos.carDeletion.deleteCar(car.id);
    await repos.carDeletion.deleteCar(other.id);

    await repos.carDeletion.deleteCarClass(gt3.id);

    expect(await repos.carClasses.list()).toEqual([]);
    expect(await repos.guides.listByLayout(layoutId)).toEqual([]);
    expect(await repos.cornerGuides.listByGuide(classGuide)).toEqual([]);
  });
});

describe("countGuides", () => {
  it("counts a car's or a class's own guides", async () => {
    const { gt3, car } = await setup();
    expect(await repos.carDeletion.countGuides({ carId: car.id })).toBe(1);
    expect(await repos.carDeletion.countGuides({ carClassId: gt3.id })).toBe(1);
  });
});
