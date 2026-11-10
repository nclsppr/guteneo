import { msg, msgIn } from "./messages";

export function DistributionRoadmap() {
  return (
    <div className="distribution-roadmap">
      <span className="eyebrow">{msgIn("short-status", "Coming soon")}</span>
      <h3>{msg("One list, all your recipients.")}</h3>
      <p>
        {msg(
          "Importing recipient lists in all formats and distributing PDFs, Excel files and other documents are planned. These features are not yet available.",
        )}
      </p>
    </div>
  );
}
