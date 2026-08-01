import Link from "next/link";
import { logout } from "./actions";

const TABS = [
  { href: "/", key: "log", label: "Log hours" },
  { href: "/leaderboard", key: "week", label: "This week" },
  { href: "/season", key: "season", label: "Season" },
  { href: "/vote", key: "vote", label: "Weekly vote" },
  { href: "/categories", key: "categories", label: "Categories" },
] as const;

export type Tab = (typeof TABS)[number]["key"];

export default function Shell({
  active,
  user,
  title,
  subtitle,
  actions,
  children,
}: {
  active: Tab;
  user: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">
          Academic Rivals
          <span>Weekly productivity league</span>
        </div>

        <nav>
          {TABS.map((tab) => (
            <Link
              key={tab.key}
              href={tab.href}
              className={active === tab.key ? "active" : ""}
            >
              {tab.label}
            </Link>
          ))}
        </nav>

        <div className="foot">
          <b>{user}</b>
          <form action={logout}>
            <button type="submit" className="linkbtn">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="main">
        <div className="page-head">
          <div>
            <h1>{title}</h1>
            {subtitle ? <div className="sub">{subtitle}</div> : null}
          </div>
          {actions}
        </div>
        {children}
      </main>
    </div>
  );
}
