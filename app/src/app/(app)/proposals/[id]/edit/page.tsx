import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getProposalDetail, getStreams } from "@/lib/data";
import { getSettings } from "@/lib/settings";
import { savedAgo } from "@/lib/format";
import { editorLanguageProps } from "@/lib/editor-props";
import { getI18n } from "@/i18n/server";
import { Editor } from "@/components/Editor";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: `${t("ed.editingDraft")} · Insight Pitch` };
}

export default async function EditProposalPage({ params }: PageProps<"/proposals/[id]/edit">) {
  const { id } = await params;
  const user = await requireUser();
  const [p, streams, settings, i18n] = await Promise.all([getProposalDetail(id, user), getStreams(), getSettings(), getI18n()]);
  if (!p) notFound();
  if (p.author.id !== user.id) redirect(`/proposals/${id}`);
  const latest = p.versions.at(-1) ?? null;
  const src = p.draft ?? latest!;
  const lp = await editorLanguageProps(streams, settings, latest?.language ?? null);
  return (
    <Editor
      id={p.id}
      initial={{
        title: src.title,
        summary: src.summary,
        body: src.body,
        scores: Object.fromEntries(p.scores.map((s) => [s.streamId, s.authorScore ?? s.score])),
      }}
      latestVersion={latest?.number ?? null}
      hasDraft={Boolean(p.draft)}
      savedLabel={p.draft ? savedAgo(p.draft.savedAt, i18n) : null}
      history={p.versions.map((v) => ({ number: v.number, note: v.note }))}
      streams={lp.streams}
      translateInto={lp.translateInto}
      scale={settings.scale}
      scoredBy={settings.scoredBy}
    />
  );
}
