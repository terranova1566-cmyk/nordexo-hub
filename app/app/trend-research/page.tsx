"use client";

import {
  Badge,
  Button,
  Card,
  Checkbox,
  Dropdown,
  Field,
  Input,
  Option,
  Popover,
  PopoverSurface,
  PopoverTrigger,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  makeStyles,
  mergeClasses,
  tokens,
} from "@fluentui/react-components";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { formatCurrency } from "@/lib/format";

type CategoryNode = {
  name: string;
  children?: CategoryNode[];
};

type TrendItem = {
  provider: string;
  product_id: string;
  title: string | null;
  product_url: string | null;
  image_url: string | null;
  sold_today: number | null;
  sold_7d: number | null;
  sold_all_time: number | null;
  trending_score: number | null;
  price: number | null;
};

type TrendResponse = {
  chart: {
    groups: Array<{ label: string; value: number }>;
    metric: string;
    groupLevel: string;
  };
  topItems: TrendItem[];
};

const useStyles = makeStyles({
  layout: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  controls: {
    padding: "12px 16px",
    borderRadius: "var(--app-radius)",
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
    alignItems: "flex-end",
  },
  filterField: {
    minWidth: "180px",
  },
  dropdownCompact: {
    minWidth: "unset",
    width: "auto",
    maxWidth: "100%",
  },
  categoryTrigger: {
    justifyContent: "space-between",
    width: "100%",
    textAlign: "left",
    fontWeight: tokens.fontWeightRegular,
  },
  categoryPopover: {
    padding: "12px",
    minWidth: "520px",
  },
  categorySearch: {
    marginBottom: "10px",
  },
  categoryColumns: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(220px, 1fr))",
    gap: "12px",
    alignItems: "start",
  },
  categoryColumn: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    maxHeight: "420px",
    overflowY: "auto",
    paddingRight: "8px",
  },
  categoryColumnTitle: {
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
  },
  categoryItem: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "4px 6px",
    borderRadius: "6px",
    width: "100%",
    boxSizing: "border-box",
    backgroundColor: "transparent",
    transition: "background-color 0.12s ease",
    cursor: "pointer",
    "&:hover": {
      backgroundColor: "#f1f1f1",
    },
  },
  categoryItemActive: {
    color: tokens.colorBrandForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },
  categoryActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "8px",
    marginTop: "12px",
  },
  chartCard: {
    padding: "16px",
    borderRadius: "var(--app-radius)",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  chartRow: {
    display: "grid",
    gridTemplateColumns: "160px 1fr 80px",
    gap: "12px",
    alignItems: "center",
  },
  chartTrack: {
    height: "10px",
    borderRadius: "999px",
    backgroundColor: tokens.colorNeutralBackground3,
    overflow: "hidden",
  },
  chartFill: {
    height: "100%",
    borderRadius: "999px",
    backgroundColor: tokens.colorBrandBackground,
  },
  chartLabel: {
    fontSize: tokens.fontSizeBase200,
  },
  chartValue: {
    textAlign: "right",
    fontSize: tokens.fontSizeBase200,
  },
  bestCard: {
    padding: "16px",
    borderRadius: "var(--app-radius)",
  },
  providerBadge: {
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground2,
  },
  table: {
    width: "100%",
  },
  emptyState: {
    color: tokens.colorNeutralForeground3,
  },
});

const providerOptions = [
  { value: "cdon", label: "CDON" },
  { value: "fyndiq", label: "Fyndiq" },
];
const providerValues = providerOptions.map((option) => option.value);

export default function TrendResearchPage() {
  const styles = useStyles();
  const { t } = useI18n();
  const [providers, setProviders] = useState<string[]>(providerValues);
  const [range, setRange] = useState("7d");
  const [bestMode, setBestMode] = useState("7d");
  const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [activeL1, setActiveL1] = useState<string | null>(null);
  const [activeL2, setActiveL2] = useState<string | null>(null);
  const [categoryDraft, setCategoryDraft] = useState<{
    level: "l1" | "l2" | null;
    value: string | null;
  }>({ level: null, value: null });
  const [categorySelection, setCategorySelection] = useState<{
    level: "l1" | "l2" | null;
    value: string | null;
  }>({ level: null, value: null });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartGroups, setChartGroups] = useState<TrendResponse["chart"]["groups"]>([]);
  const [topItems, setTopItems] = useState<TrendItem[]>([]);

  const providerLabel =
    providers.length === providerValues.length
      ? t("trend.providers.all")
      : providers
          .map(
            (value) =>
              providerOptions.find((option) => option.value === value)?.label ??
              value
          )
          .join(", ");

  const categorySearchNormalized = categorySearch.trim().toLowerCase();
  const categoryTokens = useMemo(
    () => categorySearchNormalized.split(/\s+/).filter(Boolean),
    [categorySearchNormalized]
  );
  const matchCategoryTokens = (value: string) => {
    if (categoryTokens.length === 0) return true;
    const normalized = value.toLowerCase();
    return categoryTokens.some((token) => normalized.includes(token));
  };

  const filteredCategories = useMemo(() => {
    if (categoryTokens.length === 0) return categories;
    return categories.filter((l1) => {
      if (matchCategoryTokens(l1.name)) {
        return true;
      }
      return (l1.children ?? []).some((l2) => {
        if (matchCategoryTokens(l2.name)) {
          return true;
        }
        return (l2.children ?? []).some((l3) => matchCategoryTokens(l3.name));
      });
    });
  }, [categories, categoryTokens.length, categoryTokens]);

  const filteredL2Nodes = useMemo(() => {
    const l1Node = filteredCategories.find((node) => node.name === activeL1);
    const nodes = l1Node?.children ?? [];
    if (categoryTokens.length === 0) return nodes;
    return nodes.filter(
      (l2) =>
        matchCategoryTokens(l2.name) ||
        (l2.children ?? []).some((l3) => matchCategoryTokens(l3.name))
    );
  }, [filteredCategories, activeL1, categoryTokens.length, categoryTokens]);

  useEffect(() => {
    const controller = new AbortController();
    const loadCategories = async () => {
      setCategoriesLoading(true);
      try {
        const response = await fetch("/api/discovery/categories", {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(t("trend.error.categories"));
        }
        const payload = await response.json();
        setCategories(payload.categories ?? []);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError((err as Error).message);
        }
      } finally {
        setCategoriesLoading(false);
      }
    };
    loadCategories();
    return () => controller.abort();
  }, [t]);

  useEffect(() => {
    if (filteredCategories.length === 0) {
      setActiveL1(null);
      return;
    }
    if (!activeL1 || !filteredCategories.some((node) => node.name === activeL1)) {
      setActiveL1(filteredCategories[0].name);
    }
  }, [activeL1, filteredCategories]);

  useEffect(() => {
    if (filteredL2Nodes.length === 0) {
      setActiveL2(null);
      return;
    }
    setActiveL2((prev) =>
      prev && filteredL2Nodes.some((node) => node.name === prev)
        ? prev
        : filteredL2Nodes[0].name
    );
  }, [filteredL2Nodes]);

  useEffect(() => {
    if (categoryPopoverOpen) {
      setCategoryDraft(categorySelection);
    }
  }, [categoryPopoverOpen, categorySelection]);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (providers.length !== providerValues.length) {
          params.set("provider", providers.join(","));
        } else {
          params.set("provider", "all");
        }
        if (categorySelection.level && categorySelection.value) {
          params.set("categoryLevel", categorySelection.level);
          params.set("categoryValue", categorySelection.value);
        }
        params.set("range", range);
        params.set("best", bestMode);

        const response = await fetch(`/api/trend-research?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(t("trend.error.load"));
        }
        const payload = (await response.json()) as TrendResponse;
        setChartGroups(payload.chart?.groups ?? []);
        setTopItems(payload.topItems ?? []);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError((err as Error).message);
        }
      } finally {
        setIsLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, [providers, range, bestMode, categorySelection, t]);

  const chartMax = Math.max(1, ...chartGroups.map((group) => group.value));
  const categorySummary =
    categorySelection.level && categorySelection.value
      ? categorySelection.value
      : t("trend.categories.all");

  const bestModeLabel =
    bestMode === "all"
      ? t("trend.best.allTime")
      : bestMode === "trending"
        ? t("trend.best.trending")
        : t("trend.best.sevenDays");

  return (
    <div className={styles.layout}>
      <div>
        <Text size={600} weight="semibold">
          {t("trend.title")}
        </Text>
        <Text size={200} className={styles.emptyState}>
          {t("trend.subtitle")}
        </Text>
      </div>
      <Card className={styles.controls}>
        <Field label={t("trend.filters.category")} className={styles.filterField}>
          <Popover
            open={categoryPopoverOpen}
            onOpenChange={(_, data) => setCategoryPopoverOpen(data.open)}
            positioning={{ position: "below", align: "start", offset: { mainAxis: 6 } }}
          >
            <PopoverTrigger disableButtonEnhancement>
              <Button appearance="outline" className={styles.categoryTrigger}>
                {categorySummary}
              </Button>
            </PopoverTrigger>
            <PopoverSurface className={styles.categoryPopover}>
              {categoriesLoading ? (
                <Spinner label={t("trend.loading")} />
              ) : (
                <>
                  <Input
                    value={categorySearch}
                    onChange={(_, data) => setCategorySearch(data.value)}
                    placeholder={t("trend.categories.searchPlaceholder")}
                    className={styles.categorySearch}
                  />
                  <div className={styles.categoryColumns}>
                    <div className={styles.categoryColumn}>
                      <Text className={styles.categoryColumnTitle}>
                        {t("trend.categories.level1")}
                      </Text>
                      {filteredCategories.map((l1) => {
                        const selected =
                          categoryDraft.level === "l1" &&
                          categoryDraft.value === l1.name;
                        return (
                          <div
                            key={l1.name}
                            className={mergeClasses(
                              styles.categoryItem,
                              selected ? styles.categoryItemActive : undefined
                            )}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              setActiveL1(l1.name);
                              setCategoryDraft({ level: "l1", value: l1.name });
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setActiveL1(l1.name);
                                setCategoryDraft({ level: "l1", value: l1.name });
                              }
                            }}
                          >
                            <Checkbox
                              checked={selected}
                              onChange={() =>
                                setCategoryDraft({ level: "l1", value: l1.name })
                              }
                              onClick={(event) => event.stopPropagation()}
                              aria-label={t("common.selectItem", { item: l1.name })}
                            />
                            <span>{l1.name}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className={styles.categoryColumn}>
                      <Text className={styles.categoryColumnTitle}>
                        {t("trend.categories.level2")}
                      </Text>
                      {filteredL2Nodes.map((l2) => {
                        const selected =
                          categoryDraft.level === "l2" &&
                          categoryDraft.value === l2.name;
                        return (
                          <div
                            key={l2.name}
                            className={mergeClasses(
                              styles.categoryItem,
                              selected ? styles.categoryItemActive : undefined
                            )}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              setActiveL2(l2.name);
                              setCategoryDraft({ level: "l2", value: l2.name });
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setActiveL2(l2.name);
                                setCategoryDraft({ level: "l2", value: l2.name });
                              }
                            }}
                          >
                            <Checkbox
                              checked={selected}
                              onChange={() =>
                                setCategoryDraft({ level: "l2", value: l2.name })
                              }
                              onClick={(event) => event.stopPropagation()}
                              aria-label={t("common.selectItem", { item: l2.name })}
                            />
                            <span>{l2.name}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
              <div className={styles.categoryActions}>
                <Button
                  appearance="subtle"
                  onClick={() => {
                    setCategoryDraft({ level: null, value: null });
                    setCategorySelection({ level: null, value: null });
                    setCategoryPopoverOpen(false);
                  }}
                >
                  {t("common.clear")}
                </Button>
                <Button
                  appearance="primary"
                  onClick={() => {
                    setCategorySelection(categoryDraft);
                    setCategoryPopoverOpen(false);
                  }}
                >
                  {t("common.done")}
                </Button>
              </div>
            </PopoverSurface>
          </Popover>
        </Field>
        <Field label={t("trend.filters.provider")} className={styles.filterField}>
          <Dropdown
            multiselect
            value={providerLabel}
            selectedOptions={providers}
            onOptionSelect={(_, data) => {
              const next = (data.selectedOptions ?? []) as string[];
              if (next.length === 0) {
                setProviders(providerValues);
                return;
              }
              setProviders(next);
            }}
            className={styles.dropdownCompact}
          >
            {providerOptions.map((option) => (
              <Option key={option.value} value={option.value}>
                {option.label}
              </Option>
            ))}
          </Dropdown>
        </Field>
        <Field label={t("trend.filters.range")} className={styles.filterField}>
          <Dropdown
            value={
              range === "1d"
                ? t("trend.range.oneDay")
                : t("trend.range.sevenDays")
            }
            selectedOptions={[range]}
            onOptionSelect={(_, data) => setRange(String(data.optionValue))}
            className={styles.dropdownCompact}
          >
            <Option value="1d">{t("trend.range.oneDay")}</Option>
            <Option value="7d">{t("trend.range.sevenDays")}</Option>
          </Dropdown>
        </Field>
        <Field label={t("trend.filters.bestMode")} className={styles.filterField}>
          <Dropdown
            value={bestModeLabel}
            selectedOptions={[bestMode]}
            onOptionSelect={(_, data) => setBestMode(String(data.optionValue))}
            className={styles.dropdownCompact}
          >
            <Option value="7d">{t("trend.best.sevenDays")}</Option>
            <Option value="all">{t("trend.best.allTime")}</Option>
            <Option value="trending">{t("trend.best.trending")}</Option>
          </Dropdown>
        </Field>
      </Card>

      <Card className={styles.chartCard}>
        <Text weight="semibold">{t("trend.chart.title")}</Text>
        <Text size={200} className={styles.emptyState}>
          {t("trend.chart.subtitle", { category: categorySummary })}
        </Text>
        {isLoading ? (
          <Spinner label={t("trend.loading")} />
        ) : chartGroups.length === 0 ? (
          <Text className={styles.emptyState}>{t("trend.chart.empty")}</Text>
        ) : (
          chartGroups.map((group) => {
            const label =
              group.label === "__uncategorized__"
                ? t("common.notAvailable")
                : group.label;
            return (
              <div key={label} className={styles.chartRow}>
                <Text className={styles.chartLabel}>{label}</Text>
                <div className={styles.chartTrack}>
                  <div
                    className={styles.chartFill}
                    style={{ width: `${(group.value / chartMax) * 100}%` }}
                  />
                </div>
                <Text className={styles.chartValue}>{group.value}</Text>
              </div>
            );
          })
        )}
      </Card>

      <Card className={styles.bestCard}>
        <Text weight="semibold">{t("trend.best.title", { mode: bestModeLabel })}</Text>
        {isLoading ? (
          <Spinner label={t("trend.loading")} />
        ) : topItems.length === 0 ? (
          <Text className={styles.emptyState}>{t("trend.best.empty")}</Text>
        ) : (
          <Table size="small" className={styles.table}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>{t("trend.best.table.product")}</TableHeaderCell>
                <TableHeaderCell>{t("trend.best.table.provider")}</TableHeaderCell>
                <TableHeaderCell>{t("trend.best.table.sales")}</TableHeaderCell>
                <TableHeaderCell>{t("trend.best.table.price")}</TableHeaderCell>
                <TableHeaderCell>{t("trend.best.table.link")}</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topItems.map((item) => {
                const title = item.title ?? item.product_id;
                const providerLabel =
                  providerOptions.find((option) => option.value === item.provider)
                    ?.label ?? item.provider;
                const rawSalesValue =
                  bestMode === "all"
                    ? item.sold_all_time ?? 0
                    : bestMode === "trending"
                      ? item.trending_score ?? 0
                      : item.sold_7d ?? 0;
                const salesValue =
                  bestMode === "trending"
                    ? Number(rawSalesValue).toFixed(1)
                    : Math.round(Number(rawSalesValue));
                const priceLabel =
                  item.price !== null && item.price !== undefined
                    ? formatCurrency(item.price, "SEK")
                    : t("common.notAvailable");
                return (
                  <TableRow key={`${item.provider}-${item.product_id}`}>
                    <TableCell>{title}</TableCell>
                    <TableCell>
                      <Badge appearance="tint" className={styles.providerBadge}>
                        {providerLabel}
                      </Badge>
                    </TableCell>
                    <TableCell>{salesValue}</TableCell>
                    <TableCell>{priceLabel}</TableCell>
                    <TableCell>
                      {item.product_url ? (
                        <Button
                          appearance="subtle"
                          onClick={() => window.open(item.product_url ?? "", "_blank")}
                        >
                          {t("common.view")}
                        </Button>
                      ) : (
                        t("common.notAvailable")
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {error ? <Text className={styles.emptyState}>{error}</Text> : null}
    </div>
  );
}
