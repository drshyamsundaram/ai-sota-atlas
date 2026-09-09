import rawTokenConfig from "../../pipeline/token_config.json";

export type TokenKpi = {
  id: string;
  label: string;
  unit: string;
  higher_is_better: boolean;
  description: string;
};

export type TokenSlice = { id: string; label: string; url: string };

export const tokenSpec = rawTokenConfig.token_utilization_spec as {
  description: string;
  refresh_with_primary: boolean;
  max_models_per_slice: number;
  kpis: TokenKpi[];
  slices: TokenSlice[];
  developer_country: Record<string, string>;
  default_country: string;
};

export const tokenRules = rawTokenConfig.rules as string[];
export const tokenKpis = tokenSpec.kpis;
export const tokenSlices = tokenSpec.slices;

export const countryFor = (developer: string) =>
  tokenSpec.developer_country[developer.toLowerCase()] ?? tokenSpec.default_country;
