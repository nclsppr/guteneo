import { createContext, useContext, type ReactNode } from "react";
import type { TableViewIdentity } from "./table-views";

const identity = createContext<TableViewIdentity | null>(null);
export function TableViewScope({
  value,
  children,
}: {
  value: TableViewIdentity;
  children: ReactNode;
}) {
  return <identity.Provider value={value}>{children}</identity.Provider>;
}
export function useTableViewIdentity() {
  return useContext(identity);
}
