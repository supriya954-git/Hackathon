import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  ChevronDown,
  Droplets,
  Languages,
  LogIn,
  LogOut,
  Menu,
  Moon,
  Phone,
  ShieldCheck,
  Sun,
  User,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n, type TKey } from "@/lib/i18n";
import { ROLE_LABEL, useAuth } from "@/lib/auth";
import { useNotifications } from "@/hooks/use-data";
import { api } from "@/services/api";

const PRIMARY_NAV: { to: string; key: TKey }[] = [
  { to: "/", key: "nav.home" },
  { to: "/request-help", key: "nav.help" },
  { to: "/shelters", key: "nav.shelters" },
  { to: "/recovery", key: "nav.recovery" },
];
const REPORT_LINKS: { to: string; key: TKey }[] = [
  { to: "/map", key: "nav.viewReports" },
  { to: "/report-hazard", key: "nav.reportHazard" },
];
const MORE_LINKS: { to: string; key: TKey }[] = [
  { to: "/map", key: "nav.openMap" },
  { to: "/dashboard", key: "nav.disasterDashboard" },
  { to: "/relief", key: "nav.relief" },
  { to: "/preparedness", key: "nav.preparedness" },
  { to: "/track", key: "nav.track" },
  { to: "/about", key: "nav.about" },
];

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 font-bold tracking-tight">
    <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
        <Droplets className="size-5" />
      </span>
      <span className="text-base font-extrabold sm:text-lg">JalRakshak</span>
    </Link>
  );
}

function LangToggle() {
  const { lang, setLang } = useI18n();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setLang(lang === "en" ? "ne" : "en")}
      aria-label="Switch language / भाषा बदल्नुहोस्"
      className="text-muted-foreground hover:text-foreground"
    >
      <Languages /> {lang === "en" ? "नेपाली" : "English"}
    </Button>
  );
}

function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("jalrakshak-theme") === "dark";
    setDark(saved);
    document.documentElement.dataset.theme = saved ? "dark" : "light";
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    window.localStorage.setItem("jalrakshak-theme", next ? "dark" : "light");
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      aria-pressed={dark}
      aria-label={dark ? "Switch to Light Mode" : "Switch to Dark Mode"}
      title={dark ? "Light Mode" : "Dark Mode"}
      className={dark ? "bg-muted text-foreground ring-1 ring-ring" : undefined}
    >
      {dark ? <Sun /> : <Moon />}
      <span className="hidden xl:inline">{dark ? "Light Mode" : "Dark Mode"}</span>
    </Button>
  );
}

function AccountMenu() {
  const { user, role, signOut } = useAuth();
  const { t } = useI18n();
  if (!user)
    return (
      <Button variant="outline" size="sm" asChild>
        <Link to="/login">
          <LogIn /> {t("nav.login")}
        </Link>
      </Button>
    );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" aria-label="Account menu" className="border-border/80 bg-card">
          <User /> <span className="hidden xl:inline">{ROLE_LABEL[role]}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>
          <div className="text-sm">{user.email}</div>
          <div className="text-xs font-normal text-muted-foreground">
            {ROLE_LABEL[role]} · prototype mode
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/recovery">My recovery applications</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/track">{t("nav.track")}</Link>
        </DropdownMenuItem>
        {role === "admin" || role === "responder" ? (
          <DropdownMenuItem asChild>
            <Link to="/admin">
              <ShieldCheck /> {t("nav.admin")}
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut}>
          <LogOut /> {t("nav.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NavDropdown({
  label,
  links,
  linkCls,
}: {
  label: string;
  links: { to: string; key: TKey }[];
  linkCls: string;
}) {
  const { t } = useI18n();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const active = links.some((link) => link.to === pathname);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`${linkCls} ${active ? "bg-muted text-foreground" : ""}`}
        >
          {label} <ChevronDown className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {links.map((link) => (
          <DropdownMenuItem key={link.to} asChild>
            <Link to={link.to} activeProps={{ className: "font-semibold text-teal" }}>
              {t(link.key)}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Notifications() {
  const { user } = useAuth();
  const query = useNotifications(Boolean(user));
  const unread = (query.data ?? []).filter((item) => !item.read).length;
  const markRead = async (id: string) => {
    await api.markNotificationRead(id);
    void query.refetch();
  };
  if (!user) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
          <Bell />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {query.isLoading ? (
          <DropdownMenuItem disabled>Loading…</DropdownMenuItem>
        ) : query.isError ? (
          <DropdownMenuItem disabled>Unable to load notifications.</DropdownMenuItem>
        ) : (query.data ?? []).length === 0 ? (
          <DropdownMenuItem disabled>No notifications yet.</DropdownMenuItem>
        ) : (
          query.data?.slice(0, 8).map((item) => (
            <DropdownMenuItem
              key={item.id}
              className="items-start gap-2 whitespace-normal"
              onClick={() => {
                if (!item.read) void markRead(item.id);
              }}
            >
              <span className={item.read ? "text-muted-foreground" : "font-semibold"}>
                {item.title}
                <br />
                <span className="text-xs font-normal text-muted-foreground">{item.message}</span>
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SiteHeader() {
  const { t } = useI18n();
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const linkCls =
    "min-h-10 rounded-md px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground";
  const active = { className: "bg-accent text-accent-foreground" };
  return (
    <header className="sticky top-0 z-40 border-b-2 border-primary/15 bg-card/95 shadow-sm backdrop-blur">
      <div className="mx-auto flex h-[4.25rem] max-w-7xl items-center gap-2 px-3 sm:gap-3 sm:px-6">
        <Logo />
        <nav aria-label="Main" className="ml-2 hidden items-center gap-0.5 xl:ml-4 lg:flex">
          {PRIMARY_NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className={linkCls}
              activeProps={active}
              activeOptions={{ exact: n.to === "/" }}
            >
              {t(n.key)}
            </Link>
          ))}
          <NavDropdown label={t("nav.reports")} links={REPORT_LINKS} linkCls={linkCls} />
          <NavDropdown label={t("nav.more")} links={MORE_LINKS} linkCls={linkCls} />
          {can("admin", "responder") && (
            <Link to="/admin" className={linkCls} activeProps={active}>
              {t("nav.admin")}
            </Link>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-1 lg:flex xl:gap-2">
            <LangToggle />
            <ThemeToggle />
            <Notifications />
            <AccountMenu />
          </div>
          <Button variant="sos" size="sm" asChild>
            <Link to="/request-help">
              <Phone /> <span className="hidden 2xl:inline">{t("nav.sosLong")}</span>
              <span className="hidden sm:inline 2xl:hidden">{t("nav.sos")}</span>
              <span className="sm:hidden">{t("nav.sos")}</span>
            </Link>
          </Button>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label={t("nav.menu")}>
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-80">
              <SheetHeader>
                <SheetTitle>JalRakshak</SheetTitle>
              </SheetHeader>
              <nav
                aria-label="Mobile"
                className="flex flex-col gap-1 px-4"
                onClick={() => setOpen(false)}
              >
                {PRIMARY_NAV.map((n) => (
                  <Link
                    key={n.to}
                    to={n.to}
                    className={linkCls}
                    activeProps={active}
                    activeOptions={{ exact: n.to === "/" }}
                  >
                    {t(n.key)}
                  </Link>
                ))}
                <p className="px-2.5 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("nav.reports")}
                </p>
                {REPORT_LINKS.map((n) => (
                  <Link key={n.to} to={n.to} className={linkCls} activeProps={active}>
                    {t(n.key)}
                  </Link>
                ))}
                <p className="px-2.5 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("nav.more")}
                </p>
                {MORE_LINKS.map((n) => (
                  <Link key={n.to} to={n.to} className={linkCls} activeProps={active}>
                    {t(n.key)}
                  </Link>
                ))}
                {can("admin", "responder") && (
                  <Link to="/admin" className={linkCls}>
                    {t("nav.admin")}
                  </Link>
                )}
              </nav>
              <div className="mt-4 flex flex-wrap gap-2 px-4">
                <LangToggle />
                <ThemeToggle />
                <Notifications />
                <AccountMenu />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
