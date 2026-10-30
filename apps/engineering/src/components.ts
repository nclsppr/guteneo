import MermaidDiagram from "./components/diagrams/MermaidDiagram.astro";
import SystemArchitecture from "./components/diagrams/SystemArchitecture.astro";
import DispatchLifecycle from "./components/diagrams/DispatchLifecycle.astro";
import DocumentPipeline from "./components/diagrams/DocumentPipeline.astro";
import DataModelDiagram from "./components/diagrams/DataModelDiagram.astro";
import ServiceRelease from "./components/diagrams/ServiceRelease.astro";
/**
 * MDX globals registry — components available inside MDX without `import`.
 * Wired via `<Content components={components} />` in `[...slug].astro`.
 * Add new components here as you build (or install) them.
 */

import GutenbergNote from "./components/GutenbergNote.astro";
import { Aside } from "./components/ui/aside";
import Render from "./components/Render.astro";
import { Card } from "./components/ui/card";
import { CardGrid } from "./components/ui/card-grid";
import { PackageManagers } from "./components/ui/package-managers";
import { Step, Steps } from "./components/ui/steps";
import { Tabs, TabItem } from "./components/ui/tabs";

export const components = {
  MermaidDiagram,
  SystemArchitecture,
  DispatchLifecycle,
  DocumentPipeline,
  DataModelDiagram,
  ServiceRelease,
  GutenbergNote,
  Aside,
  Card,
  CardGrid,
  PackageManagers,
  Render,
  Step,
  Steps,
  TabItem,
  Tabs,
};
