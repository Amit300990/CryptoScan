import {
  useGetDashboardSummary,
  useGetRiskByEnvironment,
  useGetAssetsByType,
  useGetExpiringCerts,
  useGetQuantumReadiness,
  useListEnvironments,
  getGetDashboardSummaryQueryKey,
  getGetRiskByEnvironmentQueryKey,
  getGetAssetsByTypeQueryKey,
  getGetExpiringCertsQueryKey,
  getGetQuantumReadinessQueryKey,
  getListEnvironmentsQueryKey,
} from "@workspace/api-client-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  Clock,
  Server,
  Package,
  ShieldOff,
  Atom,
  TrendingUp,
} from "lucide-react";
import { format } from "date-fns";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#3b82f6",
  info: "#6b7280",
};

const ASSET_TYPE_COLORS = [
  "#22d3ee", "#6366f1", "#10b981", "#f59e0b", "#f43f5e", "#8b5cf6", "#14b8a6", "#64748b",
];

const ENV_TYPE_LABELS: Record<string, string> = {
  on_premises: "On-Prem",
  aws: "AWS",
  azure: "Azure",
  gcp: "GCP",
  vmware: "VMware",
};

const ASSET_TYPE_LABELS: Record<string, string> = {
  certificate: "Certificate",
  symmetric_key: "Symmetric Key",
  asymmetric_key: "Asymmetric Key",
  tls_config: "TLS Config",
  ssh_key: "SSH Key",
  code_signing_key: "Code Signing",
  kms_key: "KMS Key",
  secret: "Secret",
};

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  accent?: string;
}) {
  return (
    <div className="bg-card border border-card-border rounded-sm p-4 flex items-start gap-4">
      <div
        className="flex items-center justify-center w-9 h-9 rounded-sm shrink-0"
        style={{ background: accent ? `${accent}18` : undefined }}
      >
        <Icon className="h-4.5 w-4.5" style={{ color: accent ?? "currentColor" }} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground/70 uppercase tracking-wide font-medium mb-0.5">
          {label}
        </p>
        <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
        {sub && <p className="text-xs text-muted-foreground/60 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {sub && <p className="text-xs text-muted-foreground/60 mt-0.5">{sub}</p>}
    </div>
  );
}

export function Dashboard() {
  const { data: environments } = useListEnvironments({
    query: {
      queryKey: getListEnvironmentsQueryKey(),
      refetchInterval: 3000,
    },
  });

  const hasActiveScan = environments?.some((e) => e.status === "scanning") ?? false;
  const pollInterval = hasActiveScan ? 2000 : false as const;

  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey(), refetchInterval: pollInterval },
  });

  const { data: riskByEnv, isLoading: riskLoading } = useGetRiskByEnvironment({
    query: { queryKey: getGetRiskByEnvironmentQueryKey(), refetchInterval: pollInterval },
  });

  const { data: assetsByType, isLoading: typesLoading } = useGetAssetsByType({
    query: { queryKey: getGetAssetsByTypeQueryKey(), refetchInterval: pollInterval },
  });

  const { data: expiringCerts, isLoading: expiringLoading } = useGetExpiringCerts(
    { days: 90 },
    { query: { queryKey: getGetExpiringCertsQueryKey({ days: 90 }), refetchInterval: pollInterval } },
  );

  const { data: quantum, isLoading: quantumLoading } = useGetQuantumReadiness({
    query: { queryKey: getGetQuantumReadinessQueryKey(), refetchInterval: pollInterval },
  });

  return (
    <div className="p-6 space-y-6" data-testid="dashboard-page">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-foreground">Dashboard</h1>
          <p className="text-xs text-muted-foreground/60 mt-0.5">
            Cryptographic posture overview across all environments
          </p>
        </div>
        {summary?.lastScanAt && (
          <p className="text-xs text-muted-foreground/50">
            Last scan: {format(new Date(summary.lastScanAt), "MMM d, yyyy HH:mm")}
          </p>
        )}
      </div>

      {/* Stat cards */}
      {summaryLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-sm" />
          ))}
        </div>
      ) : summary ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Total Assets"
            value={summary.totalAssets}
            sub={`${summary.totalEnvironments} environments`}
            icon={Package}
            accent="#22d3ee"
          />
          <StatCard
            label="Critical Findings"
            value={summary.criticalFindings}
            sub={`${summary.totalFindings} total findings`}
            icon={AlertTriangle}
            accent="#ef4444"
          />
          <StatCard
            label="Expiring (30d)"
            value={summary.expiringIn30Days}
            sub={`${summary.expiringIn90Days} within 90 days`}
            icon={Clock}
            accent="#f97316"
          />
          <StatCard
            label="Risk Score"
            value={`${summary.overallRiskScore}%`}
            sub="Overall cryptographic risk"
            icon={TrendingUp}
            accent={summary.overallRiskScore > 70 ? "#ef4444" : summary.overallRiskScore > 40 ? "#f97316" : "#10b981"}
          />
          <StatCard
            label="Active Environments"
            value={summary.activeEnvironments}
            sub={`of ${summary.totalEnvironments} connected`}
            icon={Server}
            accent="#22d3ee"
          />
          <StatCard
            label="High Findings"
            value={summary.highFindings}
            sub={`${summary.mediumFindings} medium`}
            icon={AlertTriangle}
            accent="#f97316"
          />
          <StatCard
            label="Quantum Vulnerable"
            value={summary.quantumVulnerableAssets}
            sub={`${summary.quantumSafeAssets} quantum-safe`}
            icon={ShieldOff}
            accent="#f43f5e"
          />
          <StatCard
            label="Quantum Ready"
            value={`${summary.quantumSafeAssets}`}
            sub="Post-quantum safe assets"
            icon={Atom}
            accent="#10b981"
          />
        </div>
      ) : null}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Risk by environment bar chart */}
        <div className="bg-card border border-card-border rounded-sm p-4">
          <SectionHeader title="Risk by Environment" sub="Risk score per connected environment" />
          {riskLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : riskByEnv && riskByEnv.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={riskByEnv.map((e) => ({
                  name: ENV_TYPE_LABELS[e.environmentType] ?? e.environmentName,
                  risk: e.riskScore,
                  critical: e.criticalCount,
                  high: e.highCount,
                }))}
                margin={{ top: 4, right: 8, left: -16, bottom: 4 }}
              >
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  domain={[0, 100]}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(222 47% 14%)",
                    border: "1px solid hsl(217 32% 17%)",
                    borderRadius: "4px",
                    fontSize: "12px",
                    color: "#e2e8f0",
                  }}
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                />
                <Bar dataKey="risk" name="Risk Score" fill="#22d3ee" radius={[2, 2, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-48 text-muted-foreground/40 text-sm">
              No data available
            </div>
          )}
        </div>

        {/* Asset types donut chart */}
        <div className="bg-card border border-card-border rounded-sm p-4">
          <SectionHeader title="Assets by Type" sub="Distribution of cryptographic asset types" />
          {typesLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : assetsByType && assetsByType.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={assetsByType.map((a) => ({
                    name: ASSET_TYPE_LABELS[a.assetType] ?? a.assetType,
                    value: a.count,
                  }))}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {assetsByType.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={ASSET_TYPE_COLORS[index % ASSET_TYPE_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "hsl(222 47% 14%)",
                    border: "1px solid hsl(217 32% 17%)",
                    borderRadius: "4px",
                    fontSize: "12px",
                    color: "#e2e8f0",
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: "11px", color: "#94a3b8" }}
                  iconType="circle"
                  iconSize={8}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-48 text-muted-foreground/40 text-sm">
              No data available
            </div>
          )}
        </div>
      </div>

      {/* Bottom row: expiring certs + quantum readiness */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Expiring certs */}
        <div className="bg-card border border-card-border rounded-sm p-4">
          <SectionHeader title="Expiring Certificates" sub="Certificates expiring within 90 days" />
          {expiringLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : expiringCerts && expiringCerts.length > 0 ? (
            <div className="space-y-1 max-h-52 overflow-y-auto">
              {expiringCerts.slice(0, 8).map((cert) => {
                const daysLeft = cert.expiresAt
                  ? Math.ceil(
                      (new Date(cert.expiresAt).getTime() - Date.now()) / 86400000,
                    )
                  : null;
                return (
                  <div
                    key={cert.id}
                    className="flex items-center justify-between py-1.5 px-2 rounded-sm hover:bg-muted/30 transition-colors"
                    data-testid={`expiring-cert-${cert.id}`}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{cert.name}</p>
                      <p className="text-[10px] text-muted-foreground/60">{cert.environmentName}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      {daysLeft !== null && (
                        <span
                          className={`text-[10px] font-semibold tabular-nums ${
                            daysLeft <= 30
                              ? "text-red-400"
                              : daysLeft <= 60
                              ? "text-orange-400"
                              : "text-yellow-400"
                          }`}
                        >
                          {daysLeft}d
                        </span>
                      )}
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0"
                        style={{
                          borderColor: SEVERITY_COLORS[cert.riskLevel] + "40",
                          color: SEVERITY_COLORS[cert.riskLevel],
                        }}
                      >
                        {cert.riskLevel}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-muted-foreground/40 text-sm">
              No certificates expiring soon
            </div>
          )}
        </div>

        {/* Quantum readiness */}
        <div className="bg-card border border-card-border rounded-sm p-4">
          <SectionHeader title="Quantum Readiness" sub="Post-quantum cryptography assessment" />
          {quantumLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : quantum ? (
            <div className="space-y-4">
              {/* Score bar */}
              <div>
                <div className="flex justify-between mb-1.5">
                  <span className="text-xs text-muted-foreground/70">Readiness Score</span>
                  <span className="text-xs font-bold tabular-nums" style={{
                    color: quantum.readinessScore > 70 ? "#10b981" : quantum.readinessScore > 40 ? "#f97316" : "#ef4444"
                  }}>
                    {quantum.readinessScore}%
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${quantum.readinessScore}%`,
                      background: quantum.readinessScore > 70 ? "#10b981" : quantum.readinessScore > 40 ? "#f97316" : "#ef4444",
                    }}
                  />
                </div>
                <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground/50">
                  <span>{quantum.quantumSafeCount} safe</span>
                  <span>{quantum.vulnerableCount} vulnerable</span>
                </div>
              </div>

              {/* Vulnerable algorithms */}
              {quantum.vulnerableAlgorithms.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/50 mb-1.5">
                    Vulnerable Algorithms
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {quantum.vulnerableAlgorithms.map((alg) => (
                      <span
                        key={alg}
                        className="text-[10px] px-1.5 py-0.5 rounded-sm bg-red-950/40 text-red-400 border border-red-500/20 font-mono"
                      >
                        {alg}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Top recommendation */}
              {quantum.recommendations.length > 0 && (
                <div className="bg-primary/5 border border-primary/15 rounded-sm p-2.5">
                  <p className="text-[10px] font-semibold text-primary/80 mb-0.5">Top Recommendation</p>
                  <p className="text-xs text-muted-foreground/70">{quantum.recommendations[0]}</p>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
