export type BundleId =
  | "starter_single"
  | "starter_3"
  | "growth_single"
  | "growth_8"
  | "scale_single"
  | "scale_20"
  | "enterprise_custom";

export const BUNDLES: Record<
  BundleId,
  { label: string; price: number; credits: number }
> = {
  starter_single: { label: "Starter: 1 job", price: 199, credits: 1 },
  starter_3: { label: "Starter Bundle: 3 jobs", price: 499, credits: 3 },

  growth_single: { label: "Growth: 1 job", price: 169, credits: 1 },
  growth_8: { label: "Growth Bundle: 8 jobs", price: 1199, credits: 8 },

  scale_single: { label: "Scale: 1 job", price: 149, credits: 1 },
  scale_20: { label: "Scale Bundle: 20 jobs", price: 2499, credits: 20 },

  enterprise_custom: {
    label: "Enterprise (21+ credits / deposit)",
    price: 2999,
    credits: 21,
  },
};
