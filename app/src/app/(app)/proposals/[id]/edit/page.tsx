import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getProposalDetail, getStreams } from "@/lib/data";
import { getSettings } from "@/lib/settings";
import { savedAgo, shortDate } from "@/lib/format";
import { sortedScores } from "@/lib/proposal-view";
import { editorLanguageProps } from "@/lib/editor-props";
import { getI18n } from "@/i18n/server";
import { Editor } from "@/components/Editor";
import { versionCredit } from "@/lib/credit";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: `${t("ed.editingDraft")} · Insight Pitch` };
}

export default async function EditProposalPage({ params }: PageProps<"/proposals/[id]/edit">) {
  const { id } = await params;
  const user = await requireUser();
  const [p, streams, settings, i18n] = await Promise.all([getProposalDetail(id, user), getStreams(), getSettings(), getI18n()]);
  if (!p) notFound();
  // Only the lead edits; other team members suggest changes instead.
  if (p.role !== "lead") redirect(p.role === "member" && p.versions.length ? `/proposals/${id}/suggest` : `/proposals/${id}`);
  const latest = p.versions.at(-1) ?? null;
  const d = p.draft;
  const src = d ?? latest!;
  const lp = await editorLanguageProps(streams, settings, latest?.language ?? null);
  return (
    <Editor
      // A fresh editor after each save that changes the route, so the body DOM reloads from the server.
      key={p.id}
      id={p.id}
      initial={{ title: src.title, summary: src.summary, body: src.body, note: d?.note ?? "", noteAuto: d?.noteAuto ?? true, noteFor: d?.noteFor ?? "", summaryAuto: d?.summaryAuto ?? false, summaryFor: d?.summaryFor ?? "" }}
      latest={latest && { number: latest.number, title: latest.title, summary: latest.summary, body: latest.body }}
      savedLabel={d ? savedAgo(d.savedAt, i18n) : null}
      history={p.versions.map((v) => ({ number: v.number, note: v.note, date: shortDate(v.publishedAt, i18n.locale), by: versionCredit(v, p.names, i18n.t, i18n.locale, p.author.name) }))}
      scores={sortedScores(p.scores, lp.streams).map((s) => ({ streamId: s.streamId, name: s.stream.name, color: s.stream.color, score: s.score }))}
      meName={user.name}
      translateInto={lp.translateInto}
      scale={settings.scale}
      scoredBy={settings.scoredBy}
    />
  );
}
