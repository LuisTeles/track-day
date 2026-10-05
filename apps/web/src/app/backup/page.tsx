import type { Metadata } from "next";
import { BackupPanel } from "@/features/backup/backup-panel";

export const metadata: Metadata = { title: "Backup · Track Day" };

export default function BackupPage() {
  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Backup</h1>
      <p className="text-sm text-muted">
        Your data lives only in this browser. Export regularly, and use the same file to move data
        to another device.
      </p>
      <BackupPanel />
    </section>
  );
}
