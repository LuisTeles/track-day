import type { GuideTarget } from "@track-day/schema";
import type { CarDeletionService } from "../repositories";
import type { TrackDayDb } from "./db";

const targets = (target: GuideTarget) => (g: { target: GuideTarget; deletedAt: string | null }) =>
  g.deletedAt === null &&
  ("carId" in target
    ? "carId" in g.target && g.target.carId === target.carId
    : "carClassId" in g.target && g.target.carClassId === target.carClassId);

export class LocalCarDeletionService implements CarDeletionService {
  constructor(private readonly db: TrackDayDb) {}

  async countGuides(target: GuideTarget) {
    // Guides aren't indexed by target; a garage holds few enough to scan.
    return (await this.db.guides.toArray()).filter(targets(target)).length;
  }

  deleteCar(carId: string) {
    const { db } = this;
    return db.transaction("rw", [db.cars, db.guides, db.cornerGuides], async () => {
      const car = await db.cars.get(carId);
      if (!car || car.deletedAt) throw new Error(`cars/${carId} not found`);
      const timestamp = new Date().toISOString();
      await db.cars.update(carId, { deletedAt: timestamp, updatedAt: timestamp });
      await this.deleteGuides({ carId }, timestamp);
    });
  }

  deleteCarClass(classId: string) {
    const { db } = this;
    return db.transaction("rw", [db.carClasses, db.cars, db.guides, db.cornerGuides], async () => {
      const carClass = await db.carClasses.get(classId);
      if (!carClass || carClass.deletedAt) throw new Error(`carClasses/${classId} not found`);
      const cars = (await db.cars.where("classId").equals(classId).toArray()).filter(
        (c) => c.deletedAt === null,
      );
      if (cars.length > 0) {
        throw new Error(
          `${carClass.name} still has ${cars.length} car${cars.length === 1 ? "" : "s"}; move or delete them first.`,
        );
      }
      const timestamp = new Date().toISOString();
      await db.carClasses.update(classId, { deletedAt: timestamp, updatedAt: timestamp });
      await this.deleteGuides({ carClassId: classId }, timestamp);
    });
  }

  /** Soft-deletes the target's guides and their corner guides; runs in the caller's transaction. */
  private async deleteGuides(target: GuideTarget, timestamp: string) {
    const { db } = this;
    const guideIds = (await db.guides.toArray()).filter(targets(target)).map((g) => g.id);
    const touch = { deletedAt: timestamp, updatedAt: timestamp };
    await db.guides.where("id").anyOf(guideIds).modify(touch);
    await db.cornerGuides.where("guideId").anyOf(guideIds).modify(touch);
  }
}
