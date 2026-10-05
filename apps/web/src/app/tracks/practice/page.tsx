import type { Metadata } from "next";
import { Suspense } from "react";
import { PracticePage } from "@/features/practice/practice-page";

export const metadata: Metadata = { title: "Practice · Track Day" };

// Query params (ADR-003/006); useSearchParams needs a Suspense boundary.
export default function Page() {
  return (
    <Suspense>
      <PracticePage />
    </Suspense>
  );
}
