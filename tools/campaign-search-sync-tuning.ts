import fs from "node:fs/promises";

import { createAdminSupabase } from "@/lib/supabase/admin";
import { loadLocalEnv } from "@/tools/load-local-env";

type SynonymSeed = {
  locale?: string;
  canonical: string;
  alias: string;
  strength?: number;
  notes?: string;
};

type TaxonomyAliasSeed = {
  locale?: string;
  alias: string;
  taxonomyL1?: string | null;
  taxonomyL2?: string | null;
  confidence?: number;
  notes?: string;
};

async function main() {
  loadLocalEnv();
  const adminClient = createAdminSupabase();
  const [synonymText, taxonomyAliasText] = await Promise.all([
    fs.readFile("/srv/nordexo-hub/data/campaign-search/synonyms.seed.json", "utf8"),
    fs.readFile("/srv/nordexo-hub/data/campaign-search/taxonomy-aliases.seed.json", "utf8"),
  ]);

  const synonymSeeds = JSON.parse(synonymText) as SynonymSeed[];
  const taxonomyAliasSeeds = JSON.parse(taxonomyAliasText) as TaxonomyAliasSeed[];

  if (synonymSeeds.length > 0) {
    const { error } = await adminClient.from("search_synonyms").upsert(
      synonymSeeds.map((seed) => ({
        locale: seed.locale ?? "sv",
        canonical: seed.canonical,
        alias: seed.alias,
        strength: seed.strength ?? 1,
        active: true,
        notes: seed.notes ?? null,
      })),
      {
        onConflict: "locale,canonical,alias",
        ignoreDuplicates: false,
      }
    );

    if (error) throw new Error(error.message);
  }

  if (taxonomyAliasSeeds.length > 0) {
    const { error } = await adminClient.from("search_taxonomy_aliases").upsert(
      taxonomyAliasSeeds.map((seed) => ({
        locale: seed.locale ?? "sv",
        alias: seed.alias,
        taxonomy_l1: seed.taxonomyL1 ?? null,
        taxonomy_l2: seed.taxonomyL2 ?? null,
        confidence: seed.confidence ?? 0.9,
        active: true,
        notes: seed.notes ?? null,
      })),
      {
        onConflict: "locale,alias,taxonomy_l1,taxonomy_l2",
        ignoreDuplicates: false,
      }
    );

    if (error) throw new Error(error.message);
  }

  console.log(
    JSON.stringify(
      {
        synonymsUpserted: synonymSeeds.length,
        taxonomyAliasesUpserted: taxonomyAliasSeeds.length,
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
