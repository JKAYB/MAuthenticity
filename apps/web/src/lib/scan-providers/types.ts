export type ProviderTone = "safe" | "risk" | "neutral" | "attribution";

export type ProviderKind = "reality_defender" | "hive";

export type ProviderSignal = {
  label: string;
  score: number;
  tone: ProviderTone;
  rawLabel?: string;
};

export type ProviderVerdict = {
  tone: ProviderTone;
  label: string;
  summary?: string;
  score?: number;
};

export type ProviderInsightGroup = {
  id: string;
  title: string;
  signals: ProviderSignal[];
  collapsed?: boolean;
};

export type ProviderSection = {
  kind: ProviderKind;
  title: string;
  subtitle?: string;
  verdict?: ProviderVerdict;
  signals: ProviderSignal[];
  groups?: ProviderInsightGroup[];
};
