"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useToast } from "@/components/Toast";
import { useI18n } from "@/i18n/client";
import { saveProfile, setStrengthsPublic, togglePersonFollow, type ProfileInput } from "../actions";

const BIO_MAX = 280;
const OPEN_EVENT = "ip:edit-profile";

type Lang = { code: string; native: string };

export function ProfileActions({ isMe, personId, name, following, role, profile, languages }: {
  isMe: boolean;
  personId: string;
  name: string;
  following: boolean;
  role: string;
  profile: ProfileInput;
  languages: Lang[];
}) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [on, setOn] = useState(following);
  const [editing, setEditing] = useState(false);

  // "Add a short bio" in the About card opens the same drawer.
  useEffect(() => {
    if (!isMe) return;
    const open = () => setEditing(true);
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, [isMe]);

  const follow = () =>
    start(async () => {
      const r = await togglePersonFollow(personId);
      if (!r.ok) return;
      setOn(r.following);
      toast(r.following ? t("prof.followed", { first: name.split(" ")[0] }) : t("prof.unfollowed", { name }));
      router.refresh();
    });

  return (
    <div className="profile-actions">
      {isMe ? (
        <button className="btn-pill" onClick={() => setEditing(true)}>{t("prof.editProfile")}</button>
      ) : (
        <button className="btn-follow" aria-pressed={on} onClick={follow} disabled={pending}>{on ? t("prof.following") : t("prof.follow")}</button>
      )}
      {editing ? <EditProfileDrawer initial={profile} role={role} languages={languages} onClose={() => setEditing(false)} /> : null}
    </div>
  );
}

export function AddBioButton() {
  const { t } = useI18n();
  return <button className="pa-add-bio" onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}>{t("prof.addBio")}</button>;
}

export function StrengthsToggle({ value }: { value: boolean }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [on, setOn] = useState(value);
  const [, start] = useTransition();
  const toggle = () => {
    const next = !on;
    setOn(next);
    start(async () => {
      const r = await setStrengthsPublic(next);
      if (!r.ok) return setOn(!next);
      toast(next ? t("prof.nowPublic") : t("prof.nowPrivate"));
      router.refresh();
    });
  };
  return (
    <label className="pa-public">
      {t("prof.public")}
      <button className="toggle" role="switch" aria-checked={on} aria-label={t("prof.public")} onClick={toggle}><span /></button>
    </label>
  );
}

function EditProfileDrawer({ initial, role, languages, onClose }: { initial: ProfileInput; role: string; languages: Lang[]; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [d, setD] = useState<ProfileInput>(initial);
  const [error, setError] = useState("");
  const set = (patch: Partial<ProfileInput>) => { setD((x) => ({ ...x, ...patch })); setError(""); };

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  const save = () => {
    if (!d.name.trim()) return setError(t("prof.edit.errName"));
    if (d.bio.trim().length > BIO_MAX) return setError(t("prof.edit.errBio"));
    if (!d.reads.length) return setError(t("prof.edit.errReads"));
    start(async () => {
      const r = await saveProfile(d);
      if (!r.ok) return setError(r.error);
      toast(t("prof.edit.saved"));
      onClose();
      router.refresh();
    });
  };

  const field = (key: "name" | "title" | "org" | "location", label: string, placeholder?: string) => (
    <label className="label">
      {label}
      <input className="field" value={d[key]} placeholder={placeholder} onChange={(e) => set({ [key]: e.target.value })} />
    </label>
  );
  // Languages the person already reads stay listed even if an admin has since turned them off.
  const options = [...languages, ...d.reads.filter((c) => !languages.some((l) => l.code === c)).map((c) => ({ code: c, native: c }))];

  return (
    <>
      <button className="scrim" aria-label={t("prof.edit.close")} onClick={onClose} />
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="profile-drawer-title">
        <div className="drawer-head">
          <h2 id="profile-drawer-title">{t("prof.edit.title")}</h2>
          <button className="drawer-close" onClick={onClose} aria-label={t("prof.edit.close")}>×</button>
        </div>
        <div className="drawer-body">
          {field("name", t("prof.edit.name"))}
          {field("title", t("prof.edit.jobTitle"), t("prof.edit.jobTitlePlaceholder"))}
          {field("org", t("prof.edit.org"), t("prof.edit.orgPlaceholder"))}
          {field("location", t("prof.edit.location"))}
          <label className="label">
            <span className="drawer-row"><span>{t("prof.edit.bio")}</span><span className={d.bio.length > BIO_MAX ? "count-over" : "muted-count"}>{d.bio.length}/{BIO_MAX}</span></span>
            <textarea className="textarea" rows={4} value={d.bio} placeholder={t("prof.edit.bioPlaceholder")} onChange={(e) => set({ bio: e.target.value })} />
          </label>
          <div className="drawer-group">
            <div className="stack">
              <span className="ttl">{t("prof.edit.reads")}</span>
              <span className="sub">{t("prof.edit.readsHint")}</span>
            </div>
            <div className="lang-chips" role="group" aria-label={t("prof.edit.reads")}>
              {options.map((l) => {
                const on = d.reads.includes(l.code);
                return (
                  <button key={l.code} className="lang-chip" aria-pressed={on} onClick={() => set({ reads: on ? d.reads.filter((c) => c !== l.code) : [...d.reads, l.code] })}>{l.native}</button>
                );
              })}
            </div>
          </div>
          <div className="role-note"><b>{t("prof.edit.role", { role })}</b><span>{t("prof.edit.roleHint")}</span></div>
          {error ? <div className="error-text" role="alert">{error}</div> : null}
        </div>
        <div className="drawer-foot">
          <div className="grow" />
          <button className="btn-secondary" onClick={onClose}>{t("prof.edit.cancel")}</button>
          <button className="btn-primary" onClick={save} disabled={pending}>{pending ? t("prof.edit.saving") : t("prof.edit.save")}</button>
        </div>
      </div>
    </>
  );
}
