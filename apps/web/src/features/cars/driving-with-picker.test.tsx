import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { RepositoriesProvider } from "@/data/provider";
import type { Repositories } from "@/data/repositories";
import { DrivingWithPicker } from "./driving-with-picker";

afterEach(() => window.localStorage.clear());

const classes = [{ id: "k1", name: "Road car" }];
const cars = [{ id: "c1", name: "Mazda MX-5", classId: "k1", sim: "assetto-corsa" }];

function open(withCars = true) {
  const repos = {
    carClasses: { list: () => Promise.resolve(classes) },
    cars: { list: () => Promise.resolve(withCars ? cars : []) },
  } as unknown as Repositories;
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RepositoriesProvider repositories={repos}>
        <DrivingWithPicker />
      </RepositoriesProvider>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

describe("DrivingWithPicker", () => {
  it("picks a car and takes its sim, then lets the sim change", async () => {
    const user = open();
    await user.click(screen.getByRole("button", { name: "Driving: No car" }));
    await user.selectOptions(await screen.findByLabelText("Driving"), "c1");
    expect(screen.getByLabelText("In")).toHaveValue("assetto-corsa");
    expect(
      screen.getByRole("button", { name: "Driving: Mazda MX-5 · Assetto Corsa" }),
    ).toBeVisible();
    await user.selectOptions(screen.getByLabelText("In"), "");
    expect(JSON.parse(window.localStorage.getItem("driving-with")!)).toEqual({
      carId: "c1",
      sim: null,
    });
  });

  it("points to Cars when the garage is empty", async () => {
    const user = open(false);
    await user.click(screen.getByRole("button", { name: "Driving: No car" }));
    expect(await screen.findByRole("link", { name: "Add one in Cars" })).toHaveAttribute(
      "href",
      "/cars/",
    );
  });
});
