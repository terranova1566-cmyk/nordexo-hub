import { dedupeStrings, normalizeSearchText, tokenizeSearchText } from "@/lib/campaign-search/normalization";

const MIN_PART_LENGTH = 2;

function isSupportedTerm(term: string, lexicon: Set<string>, support: Set<string>) {
  return lexicon.has(term) || support.has(term);
}

export function generateJoinedCompoundVariants(
  inputs: string[],
  lexicon: Set<string>,
  support: Set<string>,
  maxItems = 8
): string[] {
  const output: string[] = [];

  inputs.forEach((input) => {
    const tokens = tokenizeSearchText(input);
    for (let index = 0; index < tokens.length - 1; index += 1) {
      const left = tokens[index];
      const right = tokens[index + 1];
      if (left.length < MIN_PART_LENGTH || right.length < MIN_PART_LENGTH) continue;
      const joined = `${left}${right}`;
      if (joined.length < 5) continue;
      if (!isSupportedTerm(joined, lexicon, support)) continue;
      output.push(joined);
      if (output.length >= maxItems) return;
    }
  });

  return dedupeStrings(output, maxItems);
}

export function generateSplitCompoundVariants(
  inputs: string[],
  lexicon: Set<string>,
  support: Set<string>,
  maxItems = 8
): string[] {
  const output: string[] = [];

  inputs.forEach((input) => {
    const term = normalizeSearchText(input);
    if (!term || term.includes(" ") || term.length < 7) return;

    const candidates: Array<{ value: string; score: number }> = [];
    for (let index = 2; index <= term.length - 2; index += 1) {
      const left = term.slice(0, index);
      const right = term.slice(index);
      if (left.length < MIN_PART_LENGTH || right.length < MIN_PART_LENGTH) continue;
      if (!isSupportedTerm(left, lexicon, support) || !isSupportedTerm(right, lexicon, support)) {
        continue;
      }

      const supportScore =
        Number(support.has(left)) +
        Number(support.has(right)) +
        Number(lexicon.has(term)) +
        Number(support.has(term));
      const balanceScore = 1 - Math.abs(left.length - right.length) / term.length;
      candidates.push({
        value: `${left} ${right}`,
        score: supportScore + balanceScore,
      });
    }

    candidates
      .sort((left, right) => right.score - left.score || left.value.localeCompare(right.value))
      .slice(0, 2)
      .forEach((candidate) => output.push(candidate.value));
  });

  return dedupeStrings(output, maxItems);
}

export function buildCompoundSupportSet(values: string[]): Set<string> {
  return new Set(values.map((value) => normalizeSearchText(value)).filter(Boolean));
}
