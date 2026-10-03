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
        "L’IA est indisponible tant que le fournisseur, l’autorisation de transfert et le quota de l’atelier ne sont pas prêts. Vous pouvez créer et modifier votre modèle manuellement.",
      )}
    </p>
  );
}
