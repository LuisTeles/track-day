import type { Metadata } from "next";
import { Suspense } from "react";
import { ComparePage } from "@/features/compare/compare-page";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: "Compare cars · Track Day" };

export default function CompareRoute() {
  return (
    <>
      <PageHeader
        title="Compare cars"
        description="Two cars, corner by corner. Bold values differ."
      />
      <Suspense>
        <ComparePage />
      </Suspense>
    </>
  );
}
