import { useState } from "react";
import {
  useListScanJobs,
  useListEnvironments,
  getListScanJobsQueryKey,
  getListEnvironmentsQueryKey,
} from "@workspace/api-client-react";
import type { ScanJob } from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { SiGooglecloud, SiVmware } from "react-icons/si";
import { FaAws, FaMicrosoft } from "react-icons/fa";
import { Server, CheckCircle2, XCircle, Loader2, Clock, Package, AlertTriangle } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

const ENV_TYPE_ICONS: Record<string, React.ElementType> = {
  aws: FaAws,
  azure: FaMicrosoft,
  gcp: SiGooglecloud,
  vmware: SiVmware,
};

const ENV_TYPE_COLORS: Record<string, string> = {
  aws: "#FF9900",
  azure: "#0078D4",
  gcp: "#4285F4",
  vmware: "#607078",
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType; spin?: boolean }> = {
  pending: { label: "Pending", color: "#94a3b8", icon: Clock },
  running: { label: "Running", color: "#22d3ee", icon: Loader2, spin: true },
  completed: { label: "Completed", color: "#10b981", icon: CheckCircle2 },
  failed: { label: "Failed", color: "#ef4444", icon: XCircle },
};

function ScanJobRow({ job, envType }: { job: ScanJob; envType?: string }) {
  const conf = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.pending;
  const StatusIcon = conf.icon;
  const EnvIcon = envType ? (ENV_TYPE_ICONS[envType] ?? Server) : Server;
  const envColor = envType ? (ENV_TYPE_COLORS[envType] ?? "#22d3ee") : "#22d3ee";

  const duration =
    job.startedAt && job.completedAt
      ? Math.round(
          (new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()) / 1000,
        )
      : null;

  return (
    <div
      className="flex items-center gap-4 px-4 py-3 border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors"
      data-testid={`scan-job-${job.id}`}
    >
      {/* Status indicator */}
      <div className="flex items-center gap-1.5 w-28 shrink-0">
        <StatusIcon
          className="h-3.5 w-3.5 shrink-0"
          style={{
            color: conf.color,
            ...(conf.spin ? { animation: "spin 1.5s linear infinite" } : {}),
          }}
        />
        <span className="text-[11px] font-medium" style={{ color: conf.color }}>
          {conf.label}
        </span>
      </div>

      {/* Environment */}
      <div className="flex items-center gap-2 w-48 shrink-0">
        <EnvIcon className="h-3.5 w-3.5 shrink-0" style={{ color: envColor }} />
        <span className="text-sm text-foreground truncate">{job.environmentName}</span>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-5 flex-1">
        <div className="flex items-center gap-1.5">
          <Package className="h-3 w-3 text-muted-foreground/40" />
          <span className="text-xs tabular-nums text-muted-foreground/70">
            {job.assetsDiscovered} assets
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <AlertTriangle className="h-3 w-3 text-muted-foreground/40" />
          <span className="text-xs tabular-nums text-muted-foreground/70">
            {job.findingsGenerated} findings
          </span>
        </div>
        {duration !== null && (
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3 text-muted-foreground/40" />
            <span className="text-xs tabular-nums text-muted-foreground/70">{duration}s</span>
          </div>
        )}
      </div>

      {/* Time */}
      <div className="text-right shrink-0">
        {job.startedAt ? (
          <>
            <p className="text-[11px] text-foreground/80">
              {format(new Date(job.startedAt), "MMM d, yyyy")}
            </p>
            <p className="text-[10px] text-muted-foreground/50">
              {formatDistanceToNow(new Date(job.startedAt), { addSuffix: true })}
            </p>
          </>
        ) : (
          <p className="text-[11px] text-muted-foreground/40">Not started</p>
        )}
      </div>
    </div>
  );
}

export function ScanHistory() {
  const [envId, setEnvId] = useState("");

  const { data: environments } = useListEnvironments({
    query: { queryKey: getListEnvironmentsQueryKey(), refetchInterval: 3000 },
  });

  const hasActiveScan = environments?.some((e) => e.status === "scanning") ?? false;

  const params = {
    environmentId: envId ? Number(envId) : undefined,
  };

  const { data: jobs, isLoading } = useListScanJobs(params, {
    query: {
      queryKey: getListScanJobsQueryKey(params),
      refetchInterval: (query) => {
        if (hasActiveScan) return 1500;
        const data = query.state.data;
        if (!data) return false;
        const hasRunning = data.some((j: { status: string }) => j.status === "running" || j.status === "pending");
        return hasRunning ? 1500 : false;
      },
    },
  });

  // Build env type lookup
  const envTypeMap: Record<number, string> = {};
  environments?.forEach((e) => { envTypeMap[e.id] = e.type; });

  const completedCount = jobs?.filter((j) => j.status === "completed").length ?? 0;
  const totalAssets = jobs?.reduce((sum, j) => sum + (j.assetsDiscovered ?? 0), 0) ?? 0;
  const totalFindings = jobs?.reduce((sum, j) => sum + (j.findingsGenerated ?? 0), 0) ?? 0;

  return (
    <div className="p-6" data-testid="scan-history-page">
      <div className="mb-5">
        <h1 className="text-lg font-bold text-foreground">Scan History</h1>
        <p className="text-xs text-muted-foreground/60 mt-0.5">
          Historical record of all environment scans
        </p>
      </div>

      {/* Summary stat row */}
      {!isLoading && jobs && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-card border border-card-border rounded-sm p-3">
            <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wide">Total Scans</p>
            <p className="text-2xl font-bold tabular-nums text-foreground mt-0.5">{jobs.length}</p>
          </div>
          <div className="bg-card border border-card-border rounded-sm p-3">
            <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wide">Assets Found</p>
            <p className="text-2xl font-bold tabular-nums text-primary mt-0.5">{totalAssets}</p>
          </div>
          <div className="bg-card border border-card-border rounded-sm p-3">
            <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wide">Findings Generated</p>
            <p className="text-2xl font-bold tabular-nums text-orange-400 mt-0.5">{totalFindings}</p>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-2 mb-4">
        <Select value={envId} onValueChange={(v) => setEnvId(v === "all" ? "" : v)}>
          <SelectTrigger className="h-8 w-52 text-xs" data-testid="env-filter">
            <SelectValue placeholder="All environments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All environments</SelectItem>
            {environments?.map((e) => (
              <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {jobs && (
          <span className="text-xs text-muted-foreground/50 ml-1">
            {jobs.length} scan{jobs.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Table */}
      <div className="bg-card border border-card-border rounded-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-4 px-4 py-2 bg-muted/20 border-b border-border/60">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 w-28 shrink-0">Status</p>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 w-48 shrink-0">Environment</p>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 flex-1">Results</p>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 shrink-0">Started</p>
        </div>

        {isLoading ? (
          <div>
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-none border-b border-border/40" />
            ))}
          </div>
        ) : jobs && jobs.length > 0 ? (
          jobs.map((job) => (
            <ScanJobRow
              key={job.id}
              job={job}
              envType={envTypeMap[job.environmentId]}
            />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground/40">
            <Clock className="h-7 w-7 mb-2" />
            <p className="text-sm">No scans found</p>
          </div>
        )}
      </div>
    </div>
  );
}
