import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import {
  LayoutDashboard,
  Server,
  Package,
  AlertTriangle,
  Shield,
  History,
  ShieldCheck,
  ChevronRight,
  ScrollText,
  Settings2,
  LogOut,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Environments", href: "/environments", icon: Server },
  { label: "Asset Inventory", href: "/assets", icon: Package },
  { label: "Risk & Compliance", href: "/findings", icon: AlertTriangle },
  { label: "Policy Rules", href: "/policies", icon: Shield },
  { label: "Scan History", href: "/scan-history", icon: History },
  { label: "System Logs", href: "/logs", icon: ScrollText },
];

const BOTTOM_NAV = [
  { label: "Settings", href: "/settings", icon: Settings2 },
];

function NavItem({
  label,
  href,
  icon: Icon,
}: {
  label: string;
  href: string;
  icon: React.ElementType;
}) {
  const [location] = useLocation();
  const isActive = href === "/" ? location === "/" : location.startsWith(href);

  return (
    <Link
      href={href}
      data-testid={`nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
      className={cn(
        "group flex items-center gap-3 px-4 py-2.5 rounded-sm text-sm font-medium transition-all duration-150",
        isActive
          ? "bg-sidebar-accent text-primary border-l-2 border-primary pl-[14px]"
          : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 border-l-2 border-transparent pl-[14px]",
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 transition-colors",
          isActive ? "text-primary" : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80",
        )}
      />
      <span className="flex-1 truncate">{label}</span>
      {isActive && <ChevronRight className="h-3 w-3 text-primary/60" />}
    </Link>
  );
}

function UserProfile() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();

  if (!user) return null;

  const initials = user.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : user.email.slice(0, 2).toUpperCase();

  return (
    <div className="px-3 py-3 border-t border-sidebar-border">
      <div className="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-sidebar-accent/50 group">
        <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/20 border border-primary/30 text-primary text-xs font-bold shrink-0">
          {initials || <User className="h-3.5 w-3.5" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground truncate">{user.name ?? user.email}</p>
          {user.name && <p className="text-[10px] text-muted-foreground/60 truncate">{user.email}</p>}
        </div>
        <button
          onClick={() => { logout(); setLocation("/sign-in"); }}
          title="Sign out"
          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-sidebar-accent text-muted-foreground hover:text-foreground transition"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="fixed left-0 top-0 h-full w-60 bg-sidebar border-r border-sidebar-border flex flex-col z-20">
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-sidebar-border">
          <div className="flex items-center justify-center w-7 h-7 rounded bg-primary/10 border border-primary/30">
            <ShieldCheck className="h-4 w-4 text-primary" />
          </div>
          <div>
            <span className="text-sm font-bold tracking-wide text-foreground">CryptoGuard</span>
            <p className="text-[10px] text-muted-foreground/60 leading-none mt-0.5">v1.0 — Enterprise</p>
          </div>
        </div>

        <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
          <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">
            Operations
          </p>
          {NAV_ITEMS.map((item) => (
            <NavItem key={item.href} {...item} />
          ))}
          <p className="px-4 pt-4 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">
            System
          </p>
          {BOTTOM_NAV.map((item) => (
            <NavItem key={item.href} {...item} />
          ))}
        </nav>

        <div className="px-4 py-3 border-t border-sidebar-border">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green-500 ring-2 ring-green-500/20 shrink-0" />
            <span className="text-xs text-muted-foreground/60">All systems operational</span>
          </div>
        </div>

        <UserProfile />
      </aside>

      <main className="ml-60 flex-1 min-h-screen bg-background overflow-auto">
        {children}
      </main>
    </div>
  );
}
