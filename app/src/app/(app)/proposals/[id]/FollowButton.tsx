"use client";

import { useOptimistic, useTransition } from "react";
import { useToast } from "@/components/Toast";
import { toggleFollow } from "../../actions";

export function FollowButton({ proposalId, following }: { proposalId: string; following: boolean }) {
  const [optimistic, setOptimistic] = useOptimistic(following);
  const [, start] = useTransition();
  const toast = useToast();
  return (
    <button
      className="btn-secondary btn-block"
      onClick={() =>
        start(async () => {
          setOptimistic(!optimistic);
          const r = await toggleFollow(proposalId);
          if (!r.ok) toast(r.error);
          else toast(r.following ? "You’ll be notified about new versions" : "Unfollowed");
        })
      }
    >
      {optimistic ? "Following ✓" : "Follow proposal"}
    </button>
  );
}
