const normalizeSellerName = (value: string) =>
  value
    .normalize("NFKC")
    .trim()
    .replace(/['’‘`´]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();

export const DEFAULT_UNSELECTED_SELLERS: string[] = [
  "Beauty Innovations SL",
  "Dyson",
  "Ecoride",
  "EyeAtHome.com",
  "FinFlicka Barnbutik",
  "Finsmakarna Norden AB",
  "Gothenburg Meraquel Massage & Relaxation",
  "HappySweeds",
  "Huusk",
  "iSecrets AB",
  "Jesterhead Entmt AB",
  "Kunskapsplattan AB",
  "Let's deal AB",
  "Linnotti",
  "Migy AB",
  "Morgan Madison AB",
  "Officepaketet.se",
  "ONBUY",
  "Quercia Interior",
  "StylingAgenten",
  "Sufraco Savon de Marseille AB",
  "Tennisshopen Scandinavia AB",
  "Tesniva",
  "UK LABS",
  "Underwear Sweden AB",
  "Vesterålen’s",
  "We run profil AB",
  "White One",
  "www.personalizedgiftsnow.com",
  "YCZ Fragrance",
];

const DEFAULT_UNSELECTED_SELLER_SET = new Set(
  DEFAULT_UNSELECTED_SELLERS.map(normalizeSellerName)
);

export const isDefaultUnselectedSeller = (sellerName: string) =>
  DEFAULT_UNSELECTED_SELLER_SET.has(normalizeSellerName(sellerName));

export const buildDefaultSellerFilters = (allSellerNames: string[]): string[] => {
  const seen = new Set<string>();
  const unique = allSellerNames
    .map((name) => String(name ?? "").trim())
    .filter(Boolean)
    .filter((name) => {
      const key = normalizeSellerName(name);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const selected = unique.filter((name) => !isDefaultUnselectedSeller(name));
  return selected.length === unique.length ? [] : selected;
};
