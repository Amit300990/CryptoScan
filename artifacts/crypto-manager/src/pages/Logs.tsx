import { useState } from "react";
import {
  useListLogs,
  useListEnvironments,
  getListLogsQueryKey,
  getListEnvironmentsQueryKey,
} from "@workspace/api-client-react";
import type { SystemLog, ListLogsLevel, ListLogsCategory } from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollText, Info, AlertTriangle, XCircle } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

const LEVEL_CONFIG = {
  info:  { label: "INFO",  color: "#22d3ee", Icon: Info },
  warn:  { label: "WARN",  color: "#eab308", Icon: AlertTriangle },
  error: { label: "ERROR", color: "#ef4444", Icon: XCircle },
} satisfies Record<string, { label: string; color: string; Icon: React.ElementType }>;

const CATEGORY_COLORS: Record<string, string> = {
  scan:        "#6366f1",
  finding:     "#f97316",
  policy:      "#8b5cf6",
  environment: "#22d3ee",
  connection:  "#10b981",
  system:      "#94a3b8",
};

function LevelBadge({ level }: { level: string }) {
  const conf = LEVEL_CONFIG[level as keyof typeof LEVEL_CONFIG] ?? LEVEL_CONFIG.info;
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide w-14 shrink-0"
      style={{ color: conf.color }}
    >
      <conf.Icon className="h-3 w-3 shrink-0" />
      {conf.label}
    </span>
  );
}

function CategoryPill({ category }: { category: string }) {
  const color = CATEGORY_COLORS[category] ?? "#94a3b8";
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide shrink-0"
      style={{ background: color + "18", color, border: `1px solid ${color}30` }}
    >
      {category}
    </span>
  );
}

function LogRow({ entry }: { entry: SystemLog }) {
  return (
    <div
      className="flex items-start gap-3 px-4 py-2.5 border-b border-border/30 last:border-0 hover:bg-muted/10 transition-colors font-mono"
      data-testid={`log-row-${entry.id}`}
    >
      <LevelBadge level={entry.level} />
      <CategoryPill category={entry.category} />
      <p className="flex-1 text-xs text-foreground/80 leading-relaxed min-w-0 break-words">
        {entry.message}
      </p>
      {entry.environmentName && (
        <span className="text-[10px] text-muted-foreground/40 shrink-0 hidden lg:block truncate max-w-[120px]">
          {entry.environmentName}
        </span>
      )}
      <div className="text-right shrink-0 min-w-[90px]">
        <p className="text-[10px] text-muted-foreground/50">
          {format(new Date(entry.createdAt), "MMM d HH:mm:ss")}
        </p>
        <p className="text-[10px] text-muted-foreground/30">
          {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
        </p>
      </div>
    </div>
  );
}

export function Logs() {
  const [level, setLevel] = useState("");
  const [category, setCategory] = useState("");
  const [envId, setEnvId] = useState("");

  const { data: environments } = useListEnvironments({
    query: { queryKey: getListEnvironmentsQueryKey() },
  });

  const params = {
    level: (level || undefined) as ListLogsLevel | undefined,
    category: (category || undefined) as ListLogsCategory | undefined,
    environmentId: envId ? Number(envId) : undefined,
    limit: 200,
  };

  const { data: logs, isLoading } = useListLogs(params, {
    query: {
      queryKey: getListLogsQueryKey(params),
      refetchInterval: 10_000,
    },
  });

  const errorCount  = logs?.filter((l) => l.level === "error").length ?? 0;
  const warnCount   = logs?.filter((l) => l.level === "warn").length ?? 0;
  const infoCount   = logs?.filter((l) => l.level === "info").length ?? 0;

  return (
    <div className="p-6" data-testid="logs-page">
      <div className="mb-5">
        <h1 className="text-lg font-bold text-foreground">System Logs</h1>
        <p className="text-xs text-muted-foreground/60 mt-0.5">
          Read-only audit trail of scan events, policy changes, and platform activity
        </p>
      </div>

      {/* Summary counters */}
      {!isLoading && logs && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-card border border-card-border rounded-sm p-3">
            <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wide">Info</p>
            <p className="text-2xl font-bold tabular-nums text-cyan-400 mt-0.5">{infoCount}</p>
          </div>
          <div className="bg-card border border-card-border rounded-sm p-3">
            <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wide">Warnings</p>
            <p className="text-2xl font-bold tabular-nums text-yellow-400 mt-0.5">{warnCount}</p>
          </div>
          <div className="bg-card border border-card-border rounded-sm p-3">
            <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wide">Errors</p>
            <p className="text-2xl font-bold tabular-nums text-red-400 mt-0.5">{errorCount}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Select value={level} onValueChange={(v) => setLevel(v === "all" ? "" : v)}>
          <SelectTrigger className="h-8 w-36 text-xs" data-testid="level-filter">
            <SelectValue placeholder="All levels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All levels</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warn">Warn</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>

        <Select value={category} onValueChange={(v) => setCategory(v === "all" ? "" : v)}>
          <SelectTrigger className="h-8 w-40 text-xs" data-testid="category-filter">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            <SelectItem value="scan">Scan</SelectItem>
            <SelectItem value="finding">Finding</SelectItem>
            <SelectItem value="policy">Policy</SelectItem>
            <SelectItem value="environment">Environment</SelectItem>
            <SelectItem value="connection">Connection</SelectItem>
            <SelectItem value="system">System</SelectItem>
          </SelectContent>
        </Select>

        <Select value={envId} onValueChange={(v) => setEnvId(v === "all" ? "" : v)}>
          <SelectTrigger className="h-8 w-48 text-xs" data-testid="env-filter">
            <SelectValue placeholder="All environments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All environments</SelectItem>
            {environments?.map((e) => (
              <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {logs && (
          <span className="text-xs text-muted-foreground/50 ml-1">
            {logs.length} entr{logs.length !== 1 ? "ies" : "y"}
          </span>
        )}

        <span className="text-[10px] text-muted-foreground/30 ml-auto">
          Refreshes every 10s · read-only
        </span>
      </div>

      {/* Log table */}
      <div className="bg-card border border-card-border rounded-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-2 bg-muted/20 border-b border-border/60">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 w-14 shrink-0">Level</p>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 w-20 shrink-0">Category</p>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 flex-1">Message</p>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 hidden lg:block w-[120px] shrink-0">Environment</p>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 shrink-0">Time</p>
        </div>

        {isLoading ? (
          <div>
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-none border-b border-border/30" />
            ))}
          </div>
        ) : logs && logs.length > 0 ? (
          logs.map((entry) => <LogRow key={entry.id} entry={entry} />)
        ) : (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground/40">
            <ScrollText className="h-7 w-7 mb-2" />
            <p className="text-sm">No log entries match your filters</p>
            <p className="text-xs mt-1">Logs are written when scans run, findings update, and policies change</p>
          </div>
        )}
      </div>
    </div>
  );
}
