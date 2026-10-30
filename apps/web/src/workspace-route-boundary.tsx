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
  private mounted = false;
  private recoveryRevision = 0;
  private recovery: AbortController | undefined;

  componentDidMount() {
    this.mounted = true;
    window.addEventListener("hashchange", this.cancelRecovery);
    window.addEventListener("popstate", this.cancelRecovery);
  }

  componentDidUpdate(previous: { route: string }) {
    if (previous.route !== this.props.route) this.cancelRecovery();
  }

  componentWillUnmount() {
    this.mounted = false;
    window.removeEventListener("hashchange", this.cancelRecovery);
    window.removeEventListener("popstate", this.cancelRecovery);
    this.cancelRecovery();
  }

  private cancelRecovery = () => {
    this.recoveryRevision += 1;
    this.recovery?.abort();
    this.recovery = undefined;
    if (this.mounted && this.state.recovering)
      this.setState({ recovering: false });
  };

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
    if (!this.mounted || this.state.recovering) return;
    const route = this.props.route;
    const href = window.location.href;
    const revision = ++this.recoveryRevision;
    const recovery = new AbortController();
    this.recovery = recovery;
    this.setState({ recovering: true });
    await recoverRouteAssets(recovery.signal).catch(() => undefined);
    if (
      this.mounted &&
      revision === this.recoveryRevision &&
      !recovery.signal.aborted &&
      this.props.route === route &&
      window.location.href === href
    ) {
      this.recovery = undefined;
      window.location.reload();
    }
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
