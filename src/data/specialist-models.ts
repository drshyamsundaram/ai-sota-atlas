import raw from "./specialist-models.json";

export type SpecialistEvidence = "self_reported" | "reference" | "platform" | "ranked_elsewhere";
export type SpecialistModel = {
  name: string;
  developer: string;
  country: string;
  category: string;
  kind: string;
  benchmarks: string[];
  evidence: SpecialistEvidence;
  claim?: string;
  url: string;
};

export const specialistNote = raw.note;
export const specialistModels = raw.entries as SpecialistModel[];
export const EVIDENCE_LABEL: Record<SpecialistEvidence, string> = {
  self_reported: "Self-reported",
  reference: "Reference only",
  platform: "Platform / product",
  ranked_elsewhere: "Ranked in leaderboards",
};
