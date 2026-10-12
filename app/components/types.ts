import type { ReactNode } from "react";

export type NavigationGroup = {
  key: string;
  label: string;
  items: Array<{ key: string; label: ReactNode; icon: ReactNode }>;
};
