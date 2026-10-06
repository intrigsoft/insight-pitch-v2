import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getProposalDetail } from "@/lib/data";
import { savedAgo, timeAgo } from "@/lib/format";
import { contentSig } from "@/lib/body";
import { getChangeRequest } from "@/lib/team";
import { getI18n } from "@/i18n/server";
import { Review } from "./Review";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: `${t("rv.kicker")} · Insight Pitch` };
}

export default async function ChangeRequestPage({ params }: PageProps<"/proposals/[id]/changes/[crId]">) {
  const { id, crId } = await params;
  const user = await requireUser();
  const [p, cr, i18n] = await Promise.all([getProposalDetail(id, user), getChangeRequest(crId), getI18n()]);
  // Change requests are visible to the team only.
  if (!p || !p.role || !cr || cr.proposalId !== id || cr.status === "withdrawn") notFound();
  const { t } = i18n;
  const latest = p.versions.at(-1)!;
  const base = p.versions.find((v) => v.number === cr.baseVersion);
  if (!base) notFound();
  const open = cr.status === "open";
  // An open request is compared with what the lead has now; a closed one with the version it was based on.
  const leadDoc = p.role === "lead" && p.draft ? p.draft : latest;
  const ours = open ? { title: leadDoc.title, summary: leadDoc.summary, body: leadDoc.body } : { title: base.title, summary: base.summary, body: base.body };
  const first = (n: string) => n.split(" ")[0];
  return (
    <Review
      v={{
        proposalId: p.id,
        crId: cr.id,
        proposalTitle: (p.draft && p.role === "lead" ? p.draft : latest).title,
        note: cr.note,
        status: cr.status,
        author: { id: cr.authorId, name: cr.authorName, initials: cr.authorInitials, first: first(cr.authorName) },
        lead: first(p.author.name),
        isLead: p.role === "lead",
        isAuthor: cr.authorId === user.id,
        base: cr.baseVersion,
        latest: latest.number,
        // The lead compares against their draft when they have one.
        draftSaved: p.role === "lead" && p.draft ? savedAgo(p.draft.savedAt, i18n) : null,
        metaLine: t("rv.basedOn", { version: `v${cr.baseVersion}`, when: timeAgo(cr.updatedAt, i18n) }),
        accepted: cr.accepted,
        total: cr.total,
        docs: { base: { title: base.title, summary: base.summary, body: base.body }, ours, theirs: { title: cr.title, summary: cr.summary, body: cr.body } },
        oursSig: contentSig(ours),
      }}
    />
  );
}
