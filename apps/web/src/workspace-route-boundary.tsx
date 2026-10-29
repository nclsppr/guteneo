import { Component, type ReactNode } from "react";
import { WarningCircle } from "@phosphor-icons/react";
import { msg } from "./messages";
import { recoverRouteAssets } from "./route-code-recovery";

/** Keep navigation and current identity available when route code cannot load. */
export class WorkspaceRouteBoundary extends Component<
  { children: ReactNode; route: string },
  { failed: boolean; route: string; recovering: boolean }
> {
  state = { failed: false, route: this.props.route, recovering: false };

  static getDerivedStateFromProps(
    props: { route: string },
    state: { route: string },
  ) {
    return props.route === state.route
      ? null
      : { failed: false, route: props.route, recovering: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  async reload() {
    const route = this.props.route;
    const href = window.location.href;
    this.setState({ recovering: true });
    await recoverRouteAssets().catch(() => undefined);
    if (this.props.route === route && window.location.href === href)
      window.location.reload();
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
            disabled={this.state.recovering}
            onClick={() => void this.reload()}
          >
            {msg("Reload the page")}
          </button>
        </div>
      </div>
    );
  }
}
