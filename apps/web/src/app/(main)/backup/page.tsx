import type { Metadata } from "next";
import { BackupPanel } from "@/features/backup/backup-panel";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: "Backup · Track Day" };

export default function BackupPage() {
  return (
    <>
      <PageHeader
        title="Backup"
        description="Your data lives only in this browser. Export regularly, and use the same file to move data to another device."
      />
      <BackupPanel />
    </>
  );
}
