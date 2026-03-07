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

async function main() {
  loadLocalEnv();
  const [{ evaluateCampaignSearchFixture, loadCampaignSearchFixtures }, { previewCampaignSearch }] =
    await Promise.all([
      import("@/lib/campaign-search/evaluation"),
      import("@/lib/campaign-search/service"),
    ]);
  const fixtureFilter = readFlagValue("--fixture");
  const asJson = process.argv.slice(2).includes("--json");
  const fixtures = (await loadCampaignSearchFixtures()).filter((fixture) =>
    fixtureFilter ? fixture.key === fixtureFilter : true
  );

  const reports = [];
  for (const fixture of fixtures) {
    const preview = await previewCampaignSearch({
      inputText: fixture.inputText,
      fingerprintOverride: fixture.fingerprintOverride,
    });
    reports.push(evaluateCampaignSearchFixture(fixture, preview));
  }

  if (asJson) {
    console.log(JSON.stringify(reports, null, 2));
    return;
  }

  for (const report of reports) {
    console.log(`\n[${report.fixture.key}] ${report.fixture.description}`);
    console.log(
      `segments: ${report.preview.segments.length}` +
        (typeof report.fixture.expectedSegmentCount === "number"
          ? ` (expected ${report.fixture.expectedSegmentCount})`
          : "")
    );

    console.log("top 10:");
    report.top10.forEach((item) => {
      console.log(
        `  [${item.segmentKey} #${item.rank}] ${item.spu ?? "-"} ${item.title ?? "-"} | score=${item.finalScore.toFixed(2)} | ${item.retrievalSources.join("+")}`
      );
    });

    console.log("expected:");
    report.expectedMatches.forEach((item) => {
      console.log(
        `  ${item.label}: ${item.matched ? `hit rank ${item.rank} (${item.spu ?? "-"})` : "missing"}`
      );
    });

    console.log("known irrelevant:");
    report.irrelevantMatches.forEach((item) => {
      console.log(
        `  ${item.label}: ${item.matched ? `appears rank ${item.rank} (${item.spu ?? "-"})` : "not seen"}`
      );
    });

    console.log("score samples:");
    report.preview.segments.slice(0, 2).forEach((segment) => {
      segment.results.slice(0, 2).forEach((result) => {
        console.log(
          `  ${segment.plan.key}/${result.rank}: ${result.product?.spu ?? result.productId} ${JSON.stringify(result.scoreBreakdown)}`
        );
      });
    });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
