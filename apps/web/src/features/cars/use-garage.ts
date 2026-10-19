"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Car, CarClass } from "@track-day/schema";
import { useRepositories } from "@/data/provider";
import type { NewEntity } from "@/data/repositories";
import { queryKeys } from "@/data/query-keys";
import { missingStarters } from "./starter-classes";

/** Every class and car, sorted by name. */
export function useGarage() {
  const repos = useRepositories();
  return useQuery({
    queryKey: queryKeys.garage(),
    queryFn: async () => {
      const [classes, cars] = await Promise.all([repos.carClasses.list(), repos.cars.list()]);
      return { classes, cars };
    },
  });
}

// Car and class names show up in every view (guide labels), so changes refresh everything.
function useInvalidateAll() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.all });
}

export function useSaveCarClass() {
  const repos = useRepositories();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, value }: { id: string | null; value: NewEntity<CarClass> }) =>
      id ? repos.carClasses.update(id, value) : repos.carClasses.create(value),
    onSuccess: invalidate,
  });
}

export function useSaveCar() {
  const repos = useRepositories();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, value }: { id: string | null; value: NewEntity<Car> }) =>
      id ? repos.cars.update(id, value) : repos.cars.create(value),
    onSuccess: invalidate,
  });
}

export function useDeleteCar() {
  const repos = useRepositories();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (carId: string) => repos.carDeletion.deleteCar(carId),
    onSuccess: invalidate,
  });
}

export function useDeleteCarClass() {
  const repos = useRepositories();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (classId: string) => repos.carDeletion.deleteCarClass(classId),
    onSuccess: invalidate,
  });
}

/** Creates the starter classes the garage doesn't have yet. */
export function useAddStarterClasses() {
  const repos = useRepositories();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async () => {
      for (const c of missingStarters(await repos.carClasses.list())) {
        await repos.carClasses.create(c);
      }
    },
    onSuccess: invalidate,
  });
}
