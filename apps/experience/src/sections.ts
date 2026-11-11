import {
  AddressBook,
  ArrowDownLeft,
  ArrowUpRight,
  Briefcase,
  ClockCountdown,
  Files,
  PenNib,
  Ticket,
  Vault,
  type Icon,
} from "@phosphor-icons/react";
import type { PersonalSession, WorkspaceSession } from "./api/types";

/**
 * The station plan. Each section is a numbered track with one canonical
 * English path; its label is the only thing a language changes.
 */
export type SectionId =
  | "departures"
  | "arrivals"
  | "counter"
  | "documents"
  | "lockers"
  | "destinations"
  | "timetable"
  | "studio"
  | "office";

export type Section = {
  id: SectionId;
  track: number;
  path: string;
  icon: Icon;
  /** Which authority the section needs to exist for this person. */
  needs: "workspace" | "personal";
  group: "traffic" | "station" | "back";
  available?: (workspace: WorkspaceSession) => boolean;
};

export const sections: Section[] = [
  {
    id: "departures",
    track: 1,
    path: "/departures",
    icon: ArrowUpRight,
    needs: "workspace",
    group: "traffic",
  },
  {
    id: "arrivals",
    track: 2,
    path: "/arrivals",
    icon: ArrowDownLeft,
    needs: "personal",
    group: "traffic",
  },
  {
    id: "counter",
    track: 3,
    path: "/counter",
    icon: Ticket,
    needs: "workspace",
    group: "traffic",
    available: (workspace) => workspace.permissions.prepareDispatches,
  },
  {
    id: "documents",
    track: 4,
    path: "/documents",
    icon: Files,
    needs: "workspace",
    group: "station",
  },
  {
    id: "lockers",
    track: 5,
    path: "/lockers",
    icon: Vault,
    needs: "workspace",
    group: "station",
  },
  {
    id: "destinations",
    track: 6,
    path: "/destinations",
    icon: AddressBook,
    needs: "workspace",
    group: "station",
  },
  {
    id: "timetable",
    track: 7,
    path: "/timetable",
    icon: ClockCountdown,
    needs: "workspace",
    group: "station",
  },
  {
    id: "studio",
    track: 8,
    path: "/studio",
    icon: PenNib,
    needs: "workspace",
    group: "back",
  },
  {
    id: "office",
    track: 9,
    path: "/office",
    icon: Briefcase,
    needs: "workspace",
    group: "back",
    available: (workspace) =>
      workspace.permissions.manageOrganization ||
      workspace.permissions.viewReports,
  },
];

export function visibleSections(
  workspace: WorkspaceSession | null,
  personal: PersonalSession | null,
): Section[] {
  return sections.filter((section) =>
    section.needs === "personal"
      ? Boolean(personal)
      : Boolean(workspace) &&
        (section.available ? section.available(workspace!) : true),
  );
}

export function sectionOf(path: string): Section | undefined {
  return sections.find(
    (section) => path === section.path || path.startsWith(`${section.path}/`),
  );
}
