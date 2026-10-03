"use client";

import { useOptimistic, useTransition } from "react";
import { useToast } from "@/components/Toast";
import { toggleFollow } from "../../actions";
import { useI18n } from "@/i18n/client";

export function FollowButton({ proposalId, following }: { proposalId: string; following: boolean }) {
  const [optimistic, setOptimistic] = useOptimistic(following);
  const [, start] = useTransition();
  const toast = useToast();
  const { t } = useI18n();
  return (
    <button
      className="btn-secondary btn-block"
      onClick={() =>
        start(async () => {
          setOptimistic(!optimistic);
          const r = await toggleFollow(proposalId);
          if (!r.ok) toast(r.error);
          else toast(r.following ? t("view.followed") : t("view.unfollowed"));
        })
      }
    >
      {optimistic ? t("view.following") : t("view.follow")}
    </button>
  );
}
