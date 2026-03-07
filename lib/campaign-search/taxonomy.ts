import { normalizeSearchText } from "@/lib/campaign-search/normalization";
import type {
  CatalogTaxonomyOption,
  SearchTaxonomyAliasRow,
  TaxonomyMatch,
} from "@/lib/campaign-search/types";

const tokenize = (value: string) =>
  normalizeSearchText(value)
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean);

const scoreTokenOverlap = (hint: string, candidate: string) => {
  const hintTokens = new Set(tokenize(hint));
  const candidateTokens = tokenize(candidate);
  if (hintTokens.size === 0 || candidateTokens.length === 0) return 0;
  const overlap = candidateTokens.filter((token) => hintTokens.has(token)).length;
  return overlap / Math.max(hintTokens.size, candidateTokens.length);
};

export function mapTaxonomyHints(
  hints: string[],
  options: CatalogTaxonomyOption[],
  aliases: SearchTaxonomyAliasRow[] = []
): TaxonomyMatch {
  const l1Scores = new Map<string, number>();
  const l2Scores = new Map<string, number>();
  const reasoning: string[] = [];

  const normalizedHints = hints
    .map((hint) => String(hint || "").trim())
    .filter(Boolean);

  normalizedHints.forEach((hint) => {
    const normalizedHint = normalizeSearchText(hint);
    if (!normalizedHint) return;

    const pathParts = hint.split(">").map((part) => part.trim()).filter(Boolean);
    const hintedL1 = pathParts[0] ? normalizeSearchText(pathParts[0]) : null;
    const hintedL2 = pathParts[1] ? normalizeSearchText(pathParts[1]) : null;

    aliases.forEach((aliasRow) => {
      const alias = normalizeSearchText(aliasRow.alias);
      if (!alias) return;

      let score = 0;
      if (normalizedHint === alias) {
        score = aliasRow.confidence;
      } else if (normalizedHint.includes(alias) || alias.includes(normalizedHint)) {
        score = Math.min(0.88, aliasRow.confidence * 0.9);
      } else {
        score =
          Math.max(scoreTokenOverlap(normalizedHint, alias), scoreTokenOverlap(alias, normalizedHint)) *
          aliasRow.confidence;
      }

      if (score < 0.48) return;
      if (aliasRow.taxonomyL1) {
        l1Scores.set(aliasRow.taxonomyL1, Math.max(score, l1Scores.get(aliasRow.taxonomyL1) ?? 0));
      }
      if (aliasRow.taxonomyL2) {
        l2Scores.set(aliasRow.taxonomyL2, Math.max(score, l2Scores.get(aliasRow.taxonomyL2) ?? 0));
      }
      reasoning.push(
        `Alias "${aliasRow.alias}" matched "${hint}" -> ${[aliasRow.taxonomyL1, aliasRow.taxonomyL2]
          .filter(Boolean)
          .join(" > ")} at ${score.toFixed(2)}`
      );
    });

    options.forEach((option) => {
      const l1 = String(option.taxonomyL1 || "").trim();
      const l2 = String(option.taxonomyL2 || "").trim();
      if (!l1 && !l2) return;

      const normalizedL1 = normalizeSearchText(l1);
      const normalizedL2 = normalizeSearchText(l2);
      const combined = [normalizedL1, normalizedL2].filter(Boolean).join(" ");

      let score = 0;
      if (hintedL1 && hintedL2 && hintedL1 === normalizedL1 && hintedL2 === normalizedL2) {
        score = 1;
      } else if (normalizedHint === normalizedL2 && normalizedL2) {
        score = 0.94;
      } else if (normalizedHint === normalizedL1 && normalizedL1) {
        score = 0.82;
      } else if (
        normalizedL2 &&
        (normalizedHint.includes(normalizedL2) || normalizedL2.includes(normalizedHint))
      ) {
        score = 0.72;
      } else if (
        normalizedL1 &&
        (normalizedHint.includes(normalizedL1) || normalizedL1.includes(normalizedHint))
      ) {
        score = 0.64;
      } else {
        score = Math.max(scoreTokenOverlap(normalizedHint, combined), scoreTokenOverlap(combined, normalizedHint));
        if (score < 0.45) score = 0;
      }

      if (score <= 0) return;
      if (normalizedL1) {
        l1Scores.set(l1, Math.max(score, l1Scores.get(l1) ?? 0));
      }
      if (normalizedL2) {
        const l2Score = score + (option.productCount > 0 ? Math.min(option.productCount / 1000, 0.04) : 0);
        l2Scores.set(l2, Math.max(l2Score, l2Scores.get(l2) ?? 0));
      }
    });
  });

  const taxonomyL2 = [...l2Scores.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 4)
    .map(([value, score]) => {
      reasoning.push(`L2 "${value}" matched at ${score.toFixed(2)}`);
      return value;
    });

  const taxonomyL1 = [...l1Scores.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 4)
    .map(([value, score]) => {
      reasoning.push(`L1 "${value}" matched at ${score.toFixed(2)}`);
      return value;
    });

  const confidence = Math.min(
    1,
    Math.max(
      taxonomyL2.length > 0 ? l2Scores.get(taxonomyL2[0]) ?? 0 : 0,
      taxonomyL1.length > 0 ? l1Scores.get(taxonomyL1[0]) ?? 0 : 0
    )
  );

  return {
    taxonomyL1,
    taxonomyL2,
    confidence,
    reasoning,
  };
}
