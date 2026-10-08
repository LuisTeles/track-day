import type { Metadata } from "next";
import { Suspense } from "react";
import { CheatSheetPage } from "@/features/cheat-sheet/cheat-sheet-page";

export const metadata: Metadata = { title: "Cheat sheet · Track Day" };

// Ids come from IndexedDB, so they travel as query params (ADR-003).
export default function Page() {
  return (
    <Suspense>
      <CheatSheetPage />
    </Suspense>
  );
}
