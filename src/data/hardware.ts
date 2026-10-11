import catalogue from "./hardware.json";
import type { Accelerator, HardwareDisclosure, HardwareSource, ServerSystem } from "@/lib/hardware-schema";

export const accelerators = catalogue.accelerators as Accelerator[];
export const serverSystems = catalogue.systems as ServerSystem[];
export const hardwareDisclosures = catalogue.disclosures as HardwareDisclosure[];
export const hardwareReferences = catalogue.referenceSources as HardwareSource[];