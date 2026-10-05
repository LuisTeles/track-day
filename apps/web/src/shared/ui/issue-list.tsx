import type { FieldIssue } from "@track-day/schema";

/** Validation issues pinned to their field path, e.g. `corners[3].direction`. */
export function IssueList({ issues, title }: { issues: FieldIssue[]; title: string }) {
  return (
    <div role="alert" className="rounded-lg border border-danger/40 p-4 text-sm">
      <p className="font-medium text-danger">{title}</p>
      <ul className="mt-2 space-y-1">
        {issues.map((issue, i) => (
          <li key={i}>
            {issue.path && <code className="mr-2 font-mono text-xs">{issue.path}</code>}
            {issue.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
