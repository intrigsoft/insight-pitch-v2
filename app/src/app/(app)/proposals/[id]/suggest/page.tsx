import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getProposalDetail, getStreams } from "@/lib/data";
import { getSettings } from "@/lib/settings";
import { shortDate } from "@/lib/format";
import { sortedScores } from "@/lib/proposal-view";
import { editorLanguageProps } from "@/lib/editor-props";
import { versionCredit } from "@/lib/credit";
import { getChangeRequest } from "@/lib/team";
import { getI18n } from "@/i18n/server";
import { Editor } from "@/components/Editor";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: `${t("view.suggest")} · Insight Pitch` };
}

/** A team member suggesting changes to the latest version, or updating a change request that was sent back (?cr=). */
export default async function SuggestPage({ params, searchParams }: PageProps<"/proposals/[id]/suggest">) {
  const { id } = await params;
  const crParam = (await searchParams).cr;
  const user = await requireUser();
  const [p, streams, settings, i18n] = await Promise.all([getProposalDetail(id, user), getStreams(), getSettings(), getI18n()]);
  if (!p) notFound();
  const latest = p.versions.at(-1);
  if (!p.role || !latest) redirect(`/proposals/${id}`);
  const cr = typeof crParam === "string" ? await getChangeRequest(crParam) : null;
  if (cr && (cr.proposalId !== id || cr.authorId !== user.id || !["open", "returned"].includes(cr.status))) redirect(`/proposals/${id}`);
  // A new request starts from the latest version; an update keeps the version it was based on.
  const base = cr ? p.versions.find((v) => v.number === cr.baseVersion) ?? latest : latest;
  const src = cr ?? base;
  const lp = await editorLanguageProps(streams, settings, base.language);
  return (
    <Editor
      key={cr?.id ?? `new-${base.number}`}
      id={p.id}
      initial={{ title: src.title, summary: src.summary, body: src.body, note: "", noteAuto: true, noteFor: "", summaryAuto: false, summaryFor: "" }}
      latest={{ number: base.number, title: base.title, summary: base.summary, body: base.body }}
      savedLabel={null}
      history={p.versions.map((v) => ({ number: v.number, note: v.note, date: shortDate(v.publishedAt, i18n.locale), by: versionCredit(v, p.names, i18n.t, i18n.locale, p.author.name) }))}
      scores={sortedScores(p.scores, lp.streams).map((s) => ({ streamId: s.streamId, name: s.stream.name, color: s.stream.color, score: s.score }))}
      meName={user.name}
      translateInto={[]}
      scale={settings.scale}
      scoredBy={settings.scoredBy}
      cr={{ base: base.number, crId: cr?.id ?? null, lead: p.author.name.split(" ")[0], note: cr?.note ?? "" }}
    />
  );
}
