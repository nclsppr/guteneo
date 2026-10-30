import { useResource } from "./components";
import { msg } from "./messages";

export type StudioAiPolicy = {
  enabled: boolean;
  transferApproved: boolean;
  dailyLimit: number;
  usedToday: number;
  configured: boolean;
};

export function useStudioAiPolicy() {
  const resource = useResource<StudioAiPolicy>("/dataset-ai-policy");
  const policy = resource.data;
  return {
    ...resource,
    available: Boolean(
      policy?.configured &&
      policy.enabled &&
      policy.transferApproved &&
      policy.usedToday < policy.dailyLimit,
    ),
  };
}

export function StudioAiNotice({ available }: { available: boolean }) {
  return available ? null : (
    <p className="notice info">
      {msg(
        "AI is unavailable until the provider, transfer permission and workshop quota are ready. You can create and edit your template manually.",
      )}
    </p>
  );
}
