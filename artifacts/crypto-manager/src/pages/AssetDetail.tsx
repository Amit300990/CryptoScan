import { Link, useParams } from "wouter";
import {
  useGetAsset,
  getGetAssetQueryKey,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ShieldCheck, ShieldOff, Calendar, MapPin, Tag } from "lucide-react";
import { SiGooglecloud, SiVmware } from "react-icons/si";
import { FaAws, FaMicrosoft } from "react-icons/fa";
import { Server } from "lucide-react";
import { format } from "date-fns";

const RISK_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#3b82f6",
  info: "#6b7280",
};

const ASSET_TYPE_LABELS: Record<string, string> = {
  certificate: "Certificate",
  symmetric_key: "Symmetric Key",
  asymmetric_key: "Asymmetric Key",
  tls_config: "TLS Config",
  ssh_key: "SSH Key",
  code_signing_key: "Code Signing Key",
  kms_key: "KMS Key",
  secret: "Secret",
};

const ENV_TYPE_LABELS: Record<string, string> = {
  on_premises: "On-Premises",
  aws: "Amazon Web Services",
  azure: "Microsoft Azure",
  gcp: "Google Cloud Platform",
  vmware: "VMware vSphere",
};

function EnvIcon({ type }: { type: string }) {
  const cls = "h-4 w-4";
  switch (type) {
    case "aws": return <FaAws className={cls} style={{ color: "#FF9900" }} />;
    case "azure": return <FaMicrosoft className={cls} style={{ color: "#0078D4" }} />;
    case "gcp": return <SiGooglecloud className={cls} style={{ color: "#4285F4" }} />;
    case "vmware": return <SiVmware className={cls} style={{ color: "#607078" }} />;
    default: return <Server className={`${cls} text-cyan-400`} />;
  }
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-2.5 border-b border-border/40 last:border-0">
      <p className="text-[11px] font-medium text-muted-foreground/60 w-36 shrink-0 uppercase tracking-wide pt-0.5">
        {label}
      </p>
      <div className="flex-1 text-sm text-foreground">{value}</div>
    </div>
  );
}

export function AssetDetail() {
  const { id } = useParams<{ id: string }>();
  const numId = Number(id);

  const { data: asset, isLoading, isError } = useGetAsset(numId, {
    query: { enabled: !!numId, queryKey: getGetAssetQueryKey(numId) },
  });

  return (
    <div className="p-6" data-testid="asset-detail-page">
      <div className="mb-5">
        <Link href="/assets">
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground -ml-2 mb-3">
            <ChevronLeft className="h-3.5 w-3.5" />
            Back to Assets
          </Button>
        </Link>
        {isLoading ? (
          <Skeleton className="h-7 w-64" />
        ) : asset ? (
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-foreground">{asset.name}</h1>
            <Badge
              variant="outline"
              className="text-[10px] px-2 py-0.5 font-semibold uppercase tracking-wide"
              style={{
                borderColor: RISK_COLORS[asset.riskLevel] + "40",
                color: RISK_COLORS[asset.riskLevel],
                background: RISK_COLORS[asset.riskLevel] + "10",
              }}
            >
              {asset.riskLevel}
            </Badge>
          </div>
        ) : null}
        {asset && (
          <p className="text-xs text-muted-foreground/60 mt-0.5">
            {ASSET_TYPE_LABELS[asset.assetType] ?? asset.assetType}
            {" · "}
            {asset.environmentName}
          </p>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-64 w-full rounded-sm" />
          <Skeleton className="h-40 w-full rounded-sm" />
        </div>
      ) : isError ? (
        <div className="flex items-center justify-center h-64 text-muted-foreground/40 text-sm">
          Asset not found
        </div>
      ) : asset ? (
        <div className="space-y-4">
          {/* Main details card */}
          <div className="bg-card border border-card-border rounded-sm p-5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40 mb-3">
              Cryptographic Details
            </p>
            <div>
              <MetaRow label="Asset Type" value={ASSET_TYPE_LABELS[asset.assetType] ?? asset.assetType} />
              {asset.algorithm && (
                <MetaRow
                  label="Algorithm"
                  value={
                    <span className="font-mono text-sm text-primary">{asset.algorithm}</span>
                  }
                />
              )}
              {asset.keyLength && (
                <MetaRow label="Key Length" value={`${asset.keyLength} bits`} />
              )}
              {asset.subject && (
                <MetaRow label="Subject" value={<span className="font-mono text-xs break-all">{asset.subject}</span>} />
              )}
              {asset.issuer && (
                <MetaRow label="Issuer" value={<span className="font-mono text-xs break-all">{asset.issuer}</span>} />
              )}
              <MetaRow
                label="Quantum Safe"
                value={
                  <div className="flex items-center gap-1.5">
                    {asset.isQuantumSafe ? (
                      <>
                        <ShieldCheck className="h-4 w-4 text-green-500" />
                        <span className="text-green-400 text-sm">Yes — Post-quantum safe</span>
                      </>
                    ) : (
                      <>
                        <ShieldOff className="h-4 w-4 text-red-500" />
                        <span className="text-red-400 text-sm">No — Quantum vulnerable</span>
                      </>
                    )}
                  </div>
                }
              />
              {asset.expiresAt && (
                <MetaRow
                  label="Expires"
                  value={
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground/50" />
                      <span>{format(new Date(asset.expiresAt), "MMMM d, yyyy")}</span>
                    </div>
                  }
                />
              )}
              {asset.location && (
                <MetaRow
                  label="Location"
                  value={
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground/50" />
                      <span className="font-mono text-xs">{asset.location}</span>
                    </div>
                  }
                />
              )}
              {asset.tags && asset.tags.length > 0 && (
                <MetaRow
                  label="Tags"
                  value={
                    <div className="flex flex-wrap gap-1">
                      {asset.tags.map((tag) => (
                        <span key={tag} className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-sm bg-muted/60 text-muted-foreground/70 border border-border/50">
                          <Tag className="h-2.5 w-2.5" />{tag}
                        </span>
                      ))}
                    </div>
                  }
                />
              )}
            </div>
          </div>

          {/* Environment card */}
          <div className="bg-card border border-card-border rounded-sm p-5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40 mb-3">
              Environment
            </p>
            <div className="flex items-center gap-3">
              <EnvIcon type={asset.environmentType} />
              <div>
                <p className="text-sm font-medium">{asset.environmentName}</p>
                <p className="text-xs text-muted-foreground/60">{ENV_TYPE_LABELS[asset.environmentType] ?? asset.environmentType}</p>
              </div>
            </div>
          </div>

          {/* Risk card */}
          {(asset.riskReason || asset.remediationAdvice) && (
            <div className="bg-card border border-card-border rounded-sm p-5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40 mb-3">
                Risk Assessment
              </p>
              {asset.riskReason && (
                <div className="mb-3">
                  <p className="text-xs font-medium text-muted-foreground/70 mb-1">Risk Reason</p>
                  <p className="text-sm text-foreground/80">{asset.riskReason}</p>
                </div>
              )}
              {asset.remediationAdvice && (
                <div className="bg-primary/5 border border-primary/15 rounded-sm p-3">
                  <p className="text-[10px] font-semibold text-primary/80 mb-1">Remediation Advice</p>
                  <p className="text-xs text-muted-foreground/70">{asset.remediationAdvice}</p>
                </div>
              )}
            </div>
          )}

          {/* Timestamps */}
          <div className="bg-card border border-card-border rounded-sm p-5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40 mb-3">
              Record
            </p>
            <MetaRow label="Discovered" value={format(new Date(asset.createdAt), "MMM d, yyyy HH:mm")} />
            <MetaRow label="Last Updated" value={format(new Date(asset.updatedAt), "MMM d, yyyy HH:mm")} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
