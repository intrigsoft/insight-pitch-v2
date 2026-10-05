import { requireUser } from "@/lib/auth";
import { getStreams } from "@/lib/data";
import { getSettings } from "@/lib/settings";
import { editorLanguageProps } from "@/lib/editor-props";
import { getI18n } from "@/i18n/server";
import { Editor } from "@/components/Editor";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: `${t("ed.newProposal")} · Insight Pitch` };
}

export default async function NewProposalPage() {
  const user = await requireUser();
  const [streams, settings] = await Promise.all([getStreams(), getSettings()]);
  const lp = await editorLanguageProps(streams, settings, null);
  return (
    <Editor
      id={null}
      initial={{ title: "", summary: "", body: "", note: "", noteAuto: true, noteFor: "", summaryAuto: false, summaryFor: "" }}
      latest={null}
      savedLabel={null}
      history={[]}
      scores={[]}
      meName={user.name}
      translateInto={lp.translateInto}
      scale={settings.scale}
      scoredBy={settings.scoredBy}
    />
  );
}
