import type { ActionOutcome } from "./action-outcomes";

export class ObsoleteClientAction extends Error {
  constructor() {
    super("This action belongs to a departed view.");
    this.name = "ObsoleteClientAction";
  }
}

/** Metadata only: never content, recipients, bearer links, tokens or passwords. */
export type ClientActionOutcome = ActionOutcome;
export type ClientActionContext = {
  ownsView: () => boolean;
  checkpoint: () => void;
  wait: <T>(
    work: T | PromiseLike<T>,
    outcome?: (receipt: T) => ClientActionOutcome | undefined,
  ) => Promise<T>;
};

/** The lock lives outside React rendering, so two same-turn submissions cannot enter. */
export function createClientActionController() {
  let locked = false;
  return {
    get pending() {
      return locked;
    },
    async run(
      action: (context: ClientActionContext) => Promise<void>,
      ownsView: () => boolean,
      publish: (outcome: ClientActionOutcome) => void = () => undefined,
    ) {
      if (locked) return;
      locked = true;
      const checkpoint = () => {
        if (!ownsView()) throw new ObsoleteClientAction();
      };
      const context: ClientActionContext = {
        ownsView,
        checkpoint,
        async wait(work, outcome) {
          const receipt = await work;
          if (!ownsView()) {
            const metadata = outcome?.(receipt);
            if (metadata) publish(metadata);
            throw new ObsoleteClientAction();
          }
          return receipt;
        },
      };
      try {
        checkpoint();
        await action(context);
      } finally {
        locked = false;
      }
    },
  };
}
