import { type AssetTemplate } from "./types";

type VmwareCredentials = {
  vcenterUrl?: string;
  username?: string;
  password?: string;
  verifyTls?: boolean;
};

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

export async function scanVmware(_creds: VmwareCredentials): Promise<AssetTemplate[]> {
  return [
    {
      name: "vcenter-ssl-cert",
      assetType: "certificate",
      algorithm: "SHA256withRSA",
      keyLength: 2048,
      issuer: "CN=VMware CA, O=VMware",
      subject: "CN=vcenter.acmecorp.internal",
      expiresAt: daysFromNow(15),
      riskLevel: "critical",
      riskReason: "vCenter certificate expires in 15 days. Immediate renewal required to prevent management plane outage.",
      remediationAdvice: "Use VMware Certificate Manager to replace certificate immediately. Coordinate maintenance window.",
      isQuantumSafe: false,
      location: "vcenter.acmecorp.internal/ssl/machine-cert",
      tags: ["vcenter", "management", "expiring-critical"],
    },
    {
      name: "esxi-host-01-cert",
      assetType: "certificate",
      algorithm: "SHA256withRSA",
      keyLength: 2048,
      issuer: "CN=VMware CA, O=VMware",
      subject: "CN=esxi-01.acmecorp.internal",
      expiresAt: daysFromNow(15),
      riskLevel: "critical",
      riskReason: "ESXi host certificate expires in 15 days.",
      remediationAdvice: "Renew ESXi host certificate via vCenter Certificate Manager.",
      isQuantumSafe: false,
      location: "esxi-01.acmecorp.internal/ssl/host-cert",
      tags: ["esxi", "host", "expiring-critical"],
    },
    {
      name: "vmware-datastore-encryption",
      assetType: "symmetric_key",
      algorithm: "AES-256-XTS",
      keyLength: 256,
      issuer: "vSphere Key Provider",
      subject: null,
      expiresAt: null,
      riskLevel: "low",
      riskReason: null,
      remediationAdvice: null,
      isQuantumSafe: true,
      location: "vsphere/datastores/prod-datastore/encryption-key",
      tags: ["vsphere", "datastore", "encryption"],
    },
    {
      name: "nsx-t-tls-config",
      assetType: "tls_config",
      algorithm: "TLSv1.2",
      keyLength: null,
      issuer: null,
      subject: null,
      expiresAt: null,
      riskLevel: "low",
      riskReason: null,
      remediationAdvice: null,
      isQuantumSafe: false,
      location: "nsxt-manager.acmecorp.internal/api/ssl-config",
      tags: ["nsx-t", "network", "tls"],
    },
    {
      name: "vsan-encryption-key",
      assetType: "kms_key",
      algorithm: "AES-256",
      keyLength: 256,
      issuer: "vSphere Native Key Provider",
      subject: null,
      expiresAt: null,
      riskLevel: "info",
      riskReason: null,
      remediationAdvice: null,
      isQuantumSafe: true,
      location: "vsphere/vsan/encryption-key",
      tags: ["vsan", "storage", "encryption"],
    },
  ];
}
