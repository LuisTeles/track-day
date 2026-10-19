import interlagos from "@examples/interlagos.track.json";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Car, CarClass, Corner, Layout, Track } from "@track-day/schema";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RepositoriesProvider } from "@/data/provider";
import type { Repositories } from "@/data/repositories";
import { AddCarDialog } from "./add-car-dialog";

const track = {
  id: "t1",
  name: "Interlagos",
  aliases: [],
  country: null,
  city: null,
} as unknown as Track;
const layout = { id: "l1", name: "GP", lengthMeters: 4309, direction: "anticlockwise" } as Layout;
const corners = interlagos.corners.map((c, i) => ({
  id: `c${i}`,
  number: c.number,
  name: null,
  direction: c.direction,
  type: null,
  elevation: null,
  camber: null,
  distanceFromStartMeters: null,
  notes: "",
  commonMistakes: [],
})) as unknown as Corner[];
const carClasses = [{ id: "k1", name: "Road car" }] as CarClass[];

function setup(extra: Partial<React.ComponentProps<typeof AddCarDialog>> = {}) {
  const repos = {
    carClasses: {
      list: vi.fn().mockResolvedValue(carClasses),
      create: vi.fn().mockResolvedValue({ id: "k2", name: "GT3" }),
    },
    cars: { create: vi.fn().mockResolvedValue({ id: "car1" }) },
    guides: { create: vi.fn().mockResolvedValue({ id: "g1" }) },
    guideImport: { importGuide: vi.fn().mockResolvedValue({ guideId: "g2" }) },
  };
  const onAdded = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RepositoriesProvider repositories={repos as unknown as Repositories}>
        <AddCarDialog
          open
          onOpenChange={vi.fn()}
          track={track}
          layout={layout}
          corners={corners}
          carClasses={carClasses}
          onAdded={onAdded}
          {...extra}
        />
      </RepositoriesProvider>
    </QueryClientProvider>,
  );
  return { repos, onAdded, user: userEvent.setup() };
}

describe("AddCarDialog", () => {
  it("creates a car with an empty guide", async () => {
    const { repos, onAdded, user } = setup();
    await user.type(screen.getByLabelText("Car name"), "Mazda MX-5");
    await user.selectOptions(screen.getByLabelText("Sim"), "assetto-corsa");
    await user.clear(screen.getByLabelText("Class"));
    await user.type(screen.getByLabelText("Class"), "road car");
    await user.click(screen.getByRole("button", { name: "Add car" }));
    await vi.waitFor(() => expect(onAdded).toHaveBeenCalledWith("g1"));
    expect(repos.carClasses.create).not.toHaveBeenCalled(); // matched "Road car"
    expect(repos.cars.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Mazda MX-5", classId: "k1", sim: "assetto-corsa" }),
    );
    expect(repos.guides.create).toHaveBeenCalledWith(
      expect.objectContaining({ layoutId: "l1", target: { carId: "car1" }, source: "manual" }),
    );
  });

  it("gives a garage car a guide without creating another car", async () => {
    const mx5 = { id: "car9", name: "Mazda MX-5", classId: "k1", sim: "iracing" } as Car;
    const { repos, onAdded, user } = setup({ cars: [mx5], initialCarId: "car9" });
    expect(screen.getByLabelText("Which car")).toHaveValue("car9");
    expect(screen.queryByLabelText("Car name")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add car" }));
    await vi.waitFor(() => expect(onAdded).toHaveBeenCalledWith("g1"));
    expect(repos.cars.create).not.toHaveBeenCalled();
    expect(repos.guides.create).toHaveBeenCalledWith(
      expect.objectContaining({ target: { carId: "car9" }, sim: "iracing" }),
    );
  });

  it("can still add a new car when garage cars are offered", async () => {
    const mx5 = { id: "car9", name: "Mazda MX-5", classId: "k1", sim: null } as Car;
    const { repos, user } = setup({ cars: [mx5] });
    expect(screen.getByLabelText("Which car")).toHaveValue("__new__");
    await user.type(screen.getByLabelText("Car name"), "BMW M2");
    await user.click(screen.getByRole("button", { name: "Add car" }));
    await vi.waitFor(() => expect(repos.cars.create).toHaveBeenCalled());
  });

  it("imports a pasted AI guide", async () => {
    const { repos, onAdded, user } = setup();
    await user.type(screen.getByLabelText("Car name"), "MX-5");
    await user.click(screen.getByRole("radio", { name: "Start from an AI guide" }));
    expect(screen.getByRole("button", { name: "Copy prompt" })).toBeInTheDocument();
    await user.click(screen.getByLabelText("AI answer"));
    await user.paste(
      JSON.stringify({
        schemaVersion: 2,
        kind: "guide",
        guide: {},
        corners: [{ cornerNumber: 1, gear: 2 }],
      }),
    );
    await user.click(screen.getByRole("button", { name: "Add car" }));
    await vi.waitFor(() => expect(onAdded).toHaveBeenCalledWith("g2"));
    expect(repos.guideImport.importGuide).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "guide" }),
      expect.objectContaining({ layoutId: "l1", target: { carId: "car1" } }),
    );
  });

  it("creates nothing when the AI guide names a corner the layout doesn't have", async () => {
    const { repos, onAdded, user } = setup();
    await user.type(screen.getByLabelText("Car name"), "MX-5");
    await user.click(screen.getByRole("radio", { name: "Start from an AI guide" }));
    await user.click(screen.getByLabelText("AI answer"));
    await user.paste(
      JSON.stringify({
        schemaVersion: 2,
        kind: "guide",
        guide: {},
        corners: [{ cornerNumber: 99 }],
      }),
    );
    await user.click(screen.getByRole("button", { name: "Add car" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("no corner 99");
    expect(repos.cars.create).not.toHaveBeenCalled();
    expect(onAdded).not.toHaveBeenCalled();
  });
});
