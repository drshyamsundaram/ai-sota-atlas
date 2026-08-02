import rawConfig from "../../pipeline/config.json";

export type CategoryConfig = {
  id: string;
  title: string;
  sources?: string[];
  metrics?: string[];
  model_families?: string[];
  evaluation_dimensions?: string[];
  distinct_families?: string[];
};

export const spec = rawConfig.llm_status_spec as {
  priority: string[];
  report_fields: string[];
  max_items_per_category: number;
  categories: CategoryConfig[];
};

export const rules = rawConfig.rules as string[];
export const categories = spec.categories;

export const categoryTitle = (id: string) =>
  categories.find((c) => c.id === id)?.title ?? id;
