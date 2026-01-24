import stringsData from "@/i18n/strings.json";

export type Locale = "en" | "sv" | "zh-Hans";

type SourceEntry = {
  key: string;
  text: string;
};

const entries = (stringsData.strings ?? []) as SourceEntry[];

export const sourceStrings = entries.reduce<Record<string, string>>((acc, entry) => {
  acc[entry.key] = entry.text;
  return acc;
}, {});

export const defaultLocale: Locale = "en";
