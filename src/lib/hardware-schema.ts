export type Workload = "inference" | "lora" | "qlora" | "finetuning" | "pretraining";
export const WORKLOADS: { id: Workload; label: string }[] = [
  { id: "inference", label: "Inference" }, { id: "lora", label: "LoRA" },
  { id: "qlora", label: "QLoRA" }, { id: "finetuning", label: "Full fine-tuning" },
  { id: "pretraining", label: "Pretraining / continued" },
];
export type HardwareSource = { label: string; url: string; verified: string };
export type Accelerator = {
  id: string; name: string; vendor: string; architecture: string; form: string;
  memoryGb: number; memoryType: string; bandwidthTb: number | null; powerW: number | null;
  interconnect: string; compute: string; software: string; precision: string;
  availability: string; cloud: string; workloads: Workload[]; source: HardwareSource;
};
export type ServerSystem = {
  id: string; name: string; vendor: string; acceleratorId: string; count: number;
  cpu: string; ram: string; storage: string; network: string; topology: string;
  powerCooling: string; cloud: string; source: HardwareSource;
};
export type HardwareDisclosure = {
  model: string; acceleratorId: string; phase: "trained_on" | "finetuned_on" | "served_on";
  detail: string; source: HardwareSource;
};
export type HardwareMeasurement = {
  id: string; model: string; system: string; submitter: string; round: string;
  scenario: string; division: string; precision: string; accelerators: string;
  value: number; unit: string; sourceUrl: string; retrievedAt: string;
};
export type HardwareFeed = {
  measurements: HardwareMeasurement[]; checkedAt: string; sourceUrl: string | null;
  status: "ok" | "unavailable"; error?: string;
};