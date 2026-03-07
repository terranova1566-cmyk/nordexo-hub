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
  const [
    { evaluateCampaignSearchFixture, loadCampaignSearchFixtures },
    { previewCampaignSearch },
    { analyzeCampaignSearchTuning },
  ] = await Promise.all([
    import("@/lib/campaign-search/evaluation"),
    import("@/lib/campaign-search/service"),
    import("@/lib/campaign-search/tuning-analyst"),
  ]);

  const fixtureFilter = readFlagValue("--fixture");
  const useAi = process.argv.slice(2).includes("--ai");
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
    const report = evaluateCampaignSearchFixture(fixture, preview);

    if (useAi) {
      const ai = await analyzeCampaignSearchTuning({
        campaignText: fixture.inputText,
        fingerprint: preview.fingerprint,
        topResults: report.top50,
        knownRelevant: report.expectedMatches,
        knownIrrelevant: report.irrelevantMatches,
        scoreBreakdowns: preview.segments.flatMap((segment) =>
          segment.results.slice(0, 5).map((result) => ({
            segmentKey: segment.plan.key,
            productId: result.productId,
            spu: result.product?.spu ?? null,
            title: result.product?.title ?? null,
            scoreBreakdown: result.scoreBreakdown,
          }))
        ),
      });

      reports.push({
        ...report,
        ai,
      });
    } else {
      reports.push(report);
    }
  }

  if (asJson) {
    console.log(JSON.stringify(reports, null, 2));
    return;
  }

  for (const report of reports) {
    console.log(`\n[${report.fixture.key}]`);
    console.log("heuristic tuning:");
    console.log(JSON.stringify(report.tuning, null, 2));
    if ("ai" in report) {
      console.log("ai tuning:");
      console.log(JSON.stringify(report.ai, null, 2));
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
