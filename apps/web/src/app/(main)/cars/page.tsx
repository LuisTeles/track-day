import type { Metadata } from "next";
import { GaragePage } from "@/features/cars/garage-page";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: "Cars · Track Day" };

export default function CarsPage() {
  return (
    <>
      <PageHeader
        title="Cars"
        description="Your cars and their classes. A guide can be for one car or for a whole class."
      />
      <GaragePage />
    </>
  );
}
