import { Component, type ReactNode } from "react";
import { WarningCircle } from "@phosphor-icons/react";
import { msg } from "./messages";

/** Keep navigation and current identity available when route code cannot load. */
export class WorkspaceRouteBoundary extends Component<
  { children: ReactNode; route: string },
  { failed: boolean; route: string }
> {
  state = { failed: false, route: this.props.route };

  static getDerivedStateFromProps(
    props: { route: string },
    state: { route: string },
  ) {
    return props.route === state.route
      ? null
      : { failed: false, route: props.route };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="notice error" role="alert">
        <WarningCircle size={22} aria-hidden="true" />
        <div>
          <p>{msg("This page could not be loaded.")}</p>
          <button
            type="button"
            className="button"
            onClick={() => window.location.reload()}
          >
            {msg("Reload the page")}
          </button>
        </div>
      </div>
    );
  }
}
