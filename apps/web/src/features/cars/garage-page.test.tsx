import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RepositoriesProvider } from "@/data/provider";
import type { Repositories } from "@/data/repositories";
import { TrackDayDb } from "@/data/local/db";
import { createLocalRepositories } from "@/data/local/local-repositories";
import { ConfirmProvider } from "@/shared/ui/confirm";
import { ToastProvider } from "@/shared/ui/toast";
import { GaragePage } from "./garage-page";

let db: TrackDayDb;
let repos: Repositories;

beforeEach(() => {
  db = new TrackDayDb(`test-${crypto.randomUUID()}`);
  repos = createLocalRepositories(db);
});
afterEach(() => db.delete());

function open() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RepositoriesProvider repositories={repos}>
        <ToastProvider>
          <ConfirmProvider>
            <GaragePage />
          </ConfirmProvider>
        </ToastProvider>
      </RepositoriesProvider>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

const section = (name: string) => screen.getByRole("region", { name });

describe("GaragePage", () => {
  it("starts empty and adds the starter classes", async () => {
    const user = open();
    await user.click(await screen.findByRole("button", { name: "Add starter classes" }));
    for (const name of ["Formula", "GT3", "GT4", "Road car", "Drift"])
      expect(await screen.findByRole("heading", { name })).toBeInTheDocument();
    expect(await repos.carClasses.list()).toHaveLength(5);
  });

  it("adds a car to a class with its specs", async () => {
    await repos.carClasses.create({
      name: "GT3",
      description: "",
      drivetrain: null,
      downforce: null,
    });
    const user = open();
    await user.click(await screen.findByRole("button", { name: "Add GT3 car" }));
    const form = screen.getByRole("form", { name: "New car" });
    await user.type(within(form).getByLabelText("Car name"), "Porsche 911 GT3 R");
    await user.selectOptions(within(form).getByLabelText("Sim"), "assetto-corsa-competizione");
    await user.type(within(form).getByLabelText("Power (hp)"), "550");
    await user.selectOptions(within(form).getByLabelText("ABS"), "yes");
    await user.click(within(form).getByRole("button", { name: "Add car" }));

    expect(
      await within(section("GT3")).findByText("Assetto Corsa Competizione · 550 hp"),
    ).toBeInTheDocument();
    expect((await repos.cars.list())[0]).toMatchObject({ powerHp: 550, abs: true, tc: null });
  });

  it("refuses a duplicate class name and an empty car name", async () => {
    await repos.carClasses.create({
      name: "GT3",
      description: "",
      drivetrain: null,
      downforce: null,
    });
    const user = open();
    await user.click(await screen.findByRole("button", { name: "Add class" }));
    const form = screen.getByRole("form", { name: "New class" });
    await user.type(within(form).getByLabelText("Class name"), "gt3");
    await user.click(within(form).getByRole("button", { name: "Add class" }));
    expect(within(form).getByText("gt3 already exists.")).toBeInTheDocument();
    await user.click(within(form).getByRole("button", { name: "Cancel" }));

    await user.click(screen.getByRole("button", { name: "Add car" }));
    const car = screen.getByRole("form", { name: "New car" });
    await user.click(within(car).getByRole("button", { name: "Add car" }));
    expect(within(car).getByText("Give the car a name.")).toBeInTheDocument();
  });

  it("deletes a car after saying how many guides go with it", async () => {
    const gt3 = await repos.carClasses.create({
      name: "GT3",
      description: "",
      drivetrain: null,
      downforce: null,
    });
    const car = await repos.cars.create({
      name: "Ferrari 296 GT3",
      classId: gt3.id,
      sim: null,
      powerHp: null,
      weightKg: null,
      drivetrain: null,
      downforce: null,
      transmission: null,
      abs: null,
      tc: null,
    });
    await repos.guides.create({
      layoutId: crypto.randomUUID(),
      target: { carId: car.id },
      sim: null,
      referenceLapTime: null,
      setupNotes: "",
      source: "manual",
      video: null,
    });
    const user = open();
    expect(await screen.findByRole("button", { name: "Delete GT3" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Delete Ferrari 296 GT3" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Its 1 guide and every value in them go too.");
    await user.click(within(dialog).getByRole("button", { name: "Delete car" }));
    await waitFor(async () => expect(await repos.cars.list()).toEqual([]));
    await waitFor(() => expect(screen.getByRole("button", { name: "Delete GT3" })).toBeEnabled());
  });
});
