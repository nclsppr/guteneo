import { msg, msgIn } from "./messages";

export function DistributionRoadmap() {
  return (
    <div className="distribution-roadmap">
      <span className="eyebrow">{msgIn("short-status", "Coming soon")}</span>
      <p>
        {msg(
          "Importing recipient lists in all formats and distributing PDFs, Excel files and other documents are planned. These features are not yet available.",
        )}
      </p>
    </div>
  );
}
