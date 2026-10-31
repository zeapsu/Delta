import { getAnalysisSettings } from "@/lib/settings";
import { Card, Page } from "../ui";
import { AnalysisForm } from "./analysis-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { analysis, customized } = await getAnalysisSettings();
  return (
    <Page title="Settings" ask={false}>
      <Card title="Agent analysis" ask={false}>
        <p className="text-sm text-muted">
          Thresholds your agent uses when it looks for unusual spending, trends and budgets that are running
          out.{" "}
          {customized
            ? "These are your saved values."
            : "You're on the defaults, which suit most people. Save to keep them or change any number."}
        </p>
        <AnalysisForm initial={analysis} />
      </Card>
    </Page>
  );
}
