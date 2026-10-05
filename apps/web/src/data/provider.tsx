"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { createLocalRepositories } from "./local/local-repositories";
import type { Repositories } from "./repositories";

const RepositoriesContext = createContext<Repositories | null>(null);

/**
 * Binds the repository implementation for the whole app. v1 always uses the
 * local (IndexedDB) one; a backend build would choose `http/` here.
 */
export function RepositoriesProvider({
  children,
  repositories,
}: {
  children: ReactNode;
  /** Override for tests. */
  repositories?: Repositories;
}) {
  const [repos] = useState(() => repositories ?? createLocalRepositories());
  return <RepositoriesContext.Provider value={repos}>{children}</RepositoriesContext.Provider>;
}

export function useRepositories(): Repositories {
  const repos = useContext(RepositoriesContext);
  if (!repos) throw new Error("useRepositories() must be used inside <RepositoriesProvider>");
  return repos;
}
