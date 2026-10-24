import { web } from "@e2e-dev/web";
import { defineEngine } from "e2e/engine";

/** The web engine observes fragment navigation before React can scrub it.
 * Sanitize that event at the engine boundary, before it enters any reporter.
 * Keep the navigation itself and its outcome as evidence. Raw traces stay off. */
export function redactInvitationNavigation(line: string) {
  return line.replaceAll(
    /((?:[?&]|%3f|%26)invitation(?:=|%3d))[a-f0-9]{64}/giu,
    "$1[REDACTED_INVITATION]",
  );
}
export function distributionWeb(options: Parameters<typeof web>[0]) {
  const engine = web(options);
  const { capabilities: _capabilities, ...implementation } = engine;
  return defineEngine({
    ...implementation,
    startAttempt(context) {
      return engine.startAttempt!({
        ...context,
        navigation: (line) => context.navigation(redactInvitationNavigation(line)),
        appLog: (entry) => context.appLog({ ...entry, text: redactInvitationNavigation(entry.text) }),
      });
    },
  });
}
