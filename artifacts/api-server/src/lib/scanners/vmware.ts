import { type AssetTemplate } from "./types";

type VmwareCredentials = {
  vcenterUrl?: string;
  username?: string;
  password?: string;
  verifyTls?: boolean;
};

// VMware vSphere REST API integration is not yet implemented.
// Returning an empty asset list rather than mock data to avoid
// polluting production databases with fictional assets.
export async function scanVmware(_creds: VmwareCredentials): Promise<AssetTemplate[]> {
  return [];
}
