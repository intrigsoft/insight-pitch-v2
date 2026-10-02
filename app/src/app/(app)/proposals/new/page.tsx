import { requireUser } from "@/lib/auth";
import { getStreams } from "@/lib/data";
import { getSettings } from "@/lib/settings";
import { Editor } from "@/components/Editor";

export const metadata = { title: "New proposal · Insight Pitch" };

export default async function NewProposalPage() {
  await requireUser();
  const [streams, settings] = await Promise.all([getStreams(), getSettings()]);
  return (
    <Editor
      id={null}
      initial={{ title: "", summary: "", body: "", scores: {} }}
      latestVersion={null}
      hasDraft={false}
      savedLabel={null}
      history={[]}
      streams={streams}
      scale={settings.scale}
      scoredBy={settings.scoredBy}
    />
  );
}
