import type { Scan } from "@/lib/mock-data";
import { getProviderDisplayName } from "../constants/providerLabels";
import type {
  AdaptedScanProvidersViewModel,
  ProviderResultViewModel,
  ProviderTabViewModel,
} from "../types/providerViewModels";
import { adaptHiveProvider } from "./adaptHiveProvider";
import { adaptRealityDefenderProvider } from "./adaptRealityDefenderProvider";
import { adaptUnknownProvider } from "./adaptUnknownProvider";

function normalizeProviderId(id: string): string {
  const normalized = String(id || "")
    .trim()
    .toLowerCase();
  if (normalized === "real") return "reality_defender";
  return normalized;
}

function buildTabs(scan: Scan): ProviderTabViewModel[] {
  const processors =
    scan.resultPayload &&
    typeof scan.resultPayload === "object" &&
    !Array.isArray(scan.resultPayload)
      ? (scan.resultPayload as { processors?: Record<string, unknown> }).processors || {}
      : {};
  const ids = new Set<string>();
  for (const p of scan.providerExecution || []) {
    if (p?.id) ids.add(normalizeProviderId(p.id));
  }
  for (const key of Object.keys(processors)) {
    ids.add(normalizeProviderId(key));
  }
  return [...ids].map((id) => {
    const match = (scan.providerExecution || []).find((p) => normalizeProviderId(p.id) === id);
    return {
      id,
      name: match?.name || getProviderDisplayName(id),
      status: match?.status || (id in processors ? "completed" : "queued"),
    };
  });
}

function getProviderData(scan: Scan, providerId: string): unknown {
  if (
    !scan.resultPayload ||
    typeof scan.resultPayload !== "object" ||
    Array.isArray(scan.resultPayload)
  ) {
    return null;
  }
  const processors =
    (scan.resultPayload as { processors?: Record<string, unknown> }).processors || {};
  if (providerId in processors) return processors[providerId];
  if (providerId === "reality_defender" && "real" in processors) return processors.real;
  if (providerId === "real" && "reality_defender" in processors) return processors.reality_defender;
  return null;
}

function adaptProvider(params: {
  scan: Scan;
  tab: ProviderTabViewModel;
  providerData: unknown;
}): ProviderResultViewModel {
  const id = normalizeProviderId(params.tab.id);
  if (id === "reality_defender") {
    return adaptRealityDefenderProvider({
      id,
      name: params.tab.name,
      status: params.tab.status,
      providerData: params.providerData,
      scan: params.scan,
    });
  }
  if (id === "hive") {
    return adaptHiveProvider({
      id,
      name: params.tab.name,
      status: params.tab.status,
      providerData: params.providerData,
      scan: params.scan,
    });
  }
  return adaptUnknownProvider({
    id,
    name: params.tab.name,
    status: params.tab.status,
    providerData: params.providerData,
  });
}

export function adaptScanProviders(scan: Scan): AdaptedScanProvidersViewModel {
  const tabs = buildTabs(scan);
  const viewsById: Record<string, ProviderResultViewModel> = {};
  for (const tab of tabs) {
    const id = normalizeProviderId(tab.id);
    viewsById[id] = adaptProvider({
      scan,
      tab: { ...tab, id },
      providerData: getProviderData(scan, id),
    });
  }

  const preferred = scan.primaryProvider ? normalizeProviderId(scan.primaryProvider) : "";
  const defaultProviderId =
    (preferred && tabs.some((t) => normalizeProviderId(t.id) === preferred) ? preferred : "") ||
    (tabs[0] ? normalizeProviderId(tabs[0].id) : "");

  return {
    tabs: tabs.map((t) => ({ ...t, id: normalizeProviderId(t.id) })),
    defaultProviderId,
    viewsById,
  };
}
