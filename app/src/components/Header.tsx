"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { CurrentUser } from "@/lib/auth";
import { logout } from "@/app/auth-actions";
import { PlusIcon, SearchIcon, SlidersIcon } from "./icons";

export function Header({ user }: { user: CurrentUser }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isAdmin = user.role === "admin";

  // Keep the box in sync when the list's filters are cleared or the URL changes.
  const urlQuery = params.get("q") ?? "";
  const [lastUrlQuery, setLastUrlQuery] = useState(urlQuery);
  if (urlQuery !== lastUrlQuery) {
    setLastUrlQuery(urlQuery);
    setQuery(urlQuery);
  }

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [menuOpen]);

  // Typing searches the proposal list live, from any screen.
  function onQuery(value: string) {
    setQuery(value);
    const next = new URLSearchParams(pathname === "/" ? params.toString() : "");
    if (value.trim()) next.set("q", value); else next.delete("q");
    const qs = next.toString();
    if (pathname === "/") router.replace(qs ? `/?${qs}` : "/", { scroll: false });
    else router.push(qs ? `/?${qs}` : "/");
  }

  return (
    <header className="header">
      <div className="header-inner">
        <Link href="/" className="logo" aria-label="Insight Pitch home"><span className="l1">Insight</span><span className="l2">Pitch</span></Link>
        <form className="search" role="search" onSubmit={(e) => e.preventDefault()}>
          <SearchIcon />
          <input value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search proposals, people, streams" aria-label="Search proposals, people, streams" />
        </form>
        <div className="spacer" />
        <Link href="/proposals/new" className="btn-primary btn-new" aria-label="New proposal"><PlusIcon /><span className="new-label">New proposal</span></Link>
        {isAdmin ? (
          <Link href="/settings" className="icon-btn" title="Admin settings" aria-label="Admin settings" aria-current={pathname.startsWith("/settings") ? "page" : undefined}><SlidersIcon /></Link>
        ) : null}
        <div className="menu-wrap" ref={menuRef}>
          <button className="avatar-btn" onClick={() => setMenuOpen((o) => !o)} aria-haspopup="menu" aria-expanded={menuOpen} aria-label="Account menu">{user.initials}</button>
          {menuOpen ? (
            <div className="menu" role="menu">
              <div className="menu-head">
                <div className="who">{user.name}<span className="role">{user.role}</span></div>
                <div className="mail">{user.email}</div>
              </div>
              <Link role="menuitem" href="/?tab=mine" className="menu-item" onClick={() => setMenuOpen(false)}>My proposals</Link>
              {isAdmin ? <Link role="menuitem" href="/settings" className="menu-item" onClick={() => setMenuOpen(false)}>Admin settings</Link> : null}
              <form action={logout}><button role="menuitem" type="submit" className="menu-item danger">Sign out</button></form>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
