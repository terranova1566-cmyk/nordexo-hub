import { loadLocalEnv } from "@/tools/load-local-env";

function readFlagValue(flag: string) {
  const argv = process.argv.slice(2);
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === flag) {
      return argv[index + 1] ?? "";
    }
    if (token.startsWith(`${flag}=`)) {
      return token.slice(flag.length + 1);
    }
  }
  return "";
}

function hasFlag(flag: string) {
  return process.argv.slice(2).includes(flag);
}

function parseList(input: string) {
  return String(input || "")
    .split(/[,\s]+/g)
    .map((value) => value.trim())
    .filter(Boolean);
}

async function main() {
  loadLocalEnv();
  const [{ CAMPAIGN_SEARCH_EMBEDDING_BATCH_SIZE }, { backfillCampaignSearchEmbeddings, rebuildCampaignSearchIndex }] =
    await Promise.all([
      import("@/lib/campaign-search/constants"),
      import("@/lib/campaign-search/service"),
    ]);

  const limitValue = Number(readFlagValue("--limit") || 0);
  const batchSize = Math.max(
    1,
    Math.min(Number(readFlagValue("--batch-size") || CAMPAIGN_SEARCH_EMBEDDING_BATCH_SIZE), 128)
  );
  const productIds = parseList(readFlagValue("--product-ids"));
  const embedAll = hasFlag("--all");

  const indexStatus = await rebuildCampaignSearchIndex();
  let remaining = limitValue > 0 ? limitValue : embedAll ? Number.POSITIVE_INFINITY : batchSize;
  let totalQueued = 0;
  let totalEmbedded = 0;
  let iterations = 0;

  while (remaining > 0) {
    const currentLimit = Math.min(batchSize, remaining);
    const result = await backfillCampaignSearchEmbeddings({
      limit: currentLimit,
      productIds: productIds.length > 0 ? productIds : undefined,
    });
    totalQueued += result.queued;
    totalEmbedded += result.embedded;
    iterations += 1;

    if (result.queued === 0) break;
    if (!embedAll && limitValue <= 0) break;
    remaining -= currentLimit;
  }

  console.log(
    JSON.stringify(
      {
        indexStatus,
        batchSize,
        iterations,
        totalQueued,
        totalEmbedded,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
