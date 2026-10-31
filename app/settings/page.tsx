import { getAnalysisSettings } from "@/lib/settings";
import { Card, Page } from "../ui";
import { AnalysisForm } from "./analysis-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { analysis } = await getAnalysisSettings();
  return (
    <Page title="Settings" ask={false}>
      <Card title="How closely your agent watches spending" ask={false}>
        <AnalysisForm initial={analysis} />
      </Card>
    </Page>
  );
}
