"use client";

import {
  Button,
  Dropdown,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Option,
  Text,
  Toolbar,
  ToolbarButton,
  Tooltip,
  mergeClasses,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/components/i18n-provider";
import { SavedProductsProvider } from "@/components/saved-products-context";

const useStyles = makeStyles({
  shell: {
    display: "flex",
    flexDirection: "column",
    minHeight: "100vh",
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    fontWeight: 600,
  },
  brandLink: {
    color: "inherit",
    textDecorationLine: "none",
    display: "inline-flex",
    alignItems: "center",
  },
  brandLogo: {
    height: "22px",
    width: "auto",
    display: "block",
  },
  brandText: {
    letterSpacing: "0.02em",
  },
  header: {
    position: "sticky",
    top: 0,
    zIndex: 10,
    padding: "20px 32px 12px",
    backgroundColor: tokens.colorNeutralBackground2,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "24px",
    flexWrap: "wrap",
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    flexWrap: "wrap",
  },
  navGroup: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
  },
  navButton: {
    gap: "8px",
  },
  navLabel: {
    display: "inline-flex",
    alignItems: "center",
  },
  navMenuItem: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    justifyContent: "space-between",
    width: "100%",
  },
  menuPopover: {
    minWidth: "220px",
  },
  researchIcon: {
    display: "inline-flex",
    marginLeft: "4px",
    color: "inherit",
  },
  researchButton: {
    "&:hover .researchIcon": {
      color: "#6732d3",
    },
    "&[data-active='true'] .researchIcon": {
      color: tokens.colorNeutralForegroundOnBrand,
    },
    "&[data-active='true']:hover .researchIcon": {
      color: tokens.colorNeutralForegroundOnBrand,
    },
  },
  languageDropdown: {
    minWidth: "0",
    width: "max-content",
    "> button": {
      fontSize: tokens.fontSizeBase200,
      minHeight: "28px",
      paddingInline: "6px",
    },
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  toolbarIconButton: {
    color: tokens.colorNeutralForeground3,
    "&:hover": {
      color: tokens.colorBrandForeground1,
    },
    "& svg": {
      color: "inherit",
    },
  },
  toolbarIcon: {
    fontSize: "26px",
    width: "26px",
    height: "26px",
  },
  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
  },
  content: {
    padding: "24px 32px 40px",
    display: "flex",
    flexDirection: "column",
    gap: "24px",
  },
});

const navItems = [
  { label: "nav.digidealCampaigns", href: "/app/digideal-campaigns" },
  { label: "nav.trendResearch", href: "/app/trend-research" },
  { label: "nav.uiKit", href: "/app/ui-kit" },
];

const productMenuItems = [
  { label: "nav.allProducts", href: "/app/products?view=all" },
  { label: "nav.saved", href: "/app/saved" },
  { label: "nav.exports", href: "/app/exports" },
  { label: "nav.pricing", href: "/app/products/pricing", adminOnly: true },
];

const discoveryMenuItems = [
  { label: "nav.productFinder", href: "/app/discovery" },
  { label: "nav.myLists", href: "/app/my-lists" },
];

const ordersMenuItems = [
  { label: "nav.ordersView", href: "/app/orders" },
  { label: "nav.ordersResend", href: "/app/orders/resend" },
  { label: "nav.ordersImport", href: "/app/orders/import" },
];

const emailMenuItems = [
  { label: "nav.sendEmail", href: "/app/email/send" },
  { label: "nav.emailAutomations", href: "/app/email/automations" },
];

const productionMenuItems = [
  { label: "nav.productionQueue", href: "/app/production" },
  { label: "nav.bulkProcessing", href: "/app/production/bulk-processing" },
  { label: "nav.draftExplorer", href: "/app/production/draft-explorer" },
];

const shopifyMenuItems = [
  { label: "nav.shopifyStoreSettings", href: "/app/shopify/store-settings" },
  { label: "nav.shopifyWebshopTexts", href: "/app/shopify/webshop-texts" },
];

function ResearchSparkIcon({ className }: { className?: string }) {
  return (
    <span className={className} aria-hidden="true">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <path d="M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" />
        <path d="M12 18c-.328 0 -.652 -.017 -.97 -.05c-3.172 -.332 -5.85 -2.315 -8.03 -5.95c2.4 -4 5.4 -6 9 -6c3.465 0 6.374 1.853 8.727 5.558" />
        <path d="M15 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" />
        <path d="M20.2 20.2l1.8 1.8" />
      </svg>
    </span>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065" />
      <path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
    </svg>
  );
}

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M14 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2" />
      <path d="M9 12h12l-3 -3" />
      <path d="M18 15l3 -3" />
    </svg>
  );
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  const pathname = usePathname();
  const router = useRouter();
  const { locale, setLocale, t } = useI18n();
  const supabase = useMemo(() => createClient(), []);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const isProductsActive = useMemo(
    () =>
      ["/app/products", "/app/saved", "/app/exports"].some((path) =>
        pathname.startsWith(path)
      ) || pathname.startsWith("/app/products/pricing"),
    [pathname]
  );
  const isDiscoveryActive = useMemo(
    () => ["/app/discovery", "/app/my-lists"].some((path) => pathname.startsWith(path)),
    [pathname]
  );
  const isProductionActive = useMemo(
    () => pathname.startsWith("/app/production"),
    [pathname]
  );
  const isEmailActive = useMemo(
    () => pathname.startsWith("/app/email"),
    [pathname]
  );
  const isShopifyActive = useMemo(
    () => pathname.startsWith("/app/shopify"),
    [pathname]
  );

  useEffect(() => {
    let isActive = true;

    const load = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) {
        if (isActive) setIsAdmin(false);
        return;
      }
      const { data: settings } = await supabase
        .from("partner_user_settings")
        .select("is_admin, preferred_locale")
        .eq("user_id", user.id)
        .maybeSingle();
      if (isActive) {
        setIsAdmin(Boolean(settings?.is_admin));
        if (settings?.preferred_locale) {
          setLocale(settings.preferred_locale);
        }
        setUserId(user.id);
      }
    };

    load();

    return () => {
      isActive = false;
    };
  }, [supabase]);

  const visibleNavItems = useMemo(
    () => navItems.filter((item) => (item.href === "/app/ui-kit" ? isAdmin : true)),
    [isAdmin]
  );

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const handleLocaleChange = async (nextLocale: string) => {
    if (nextLocale === locale) return;
    setLocale(nextLocale as typeof locale);
    if (!userId) return;
    await supabase.from("partner_user_settings").upsert(
      {
        user_id: userId,
        preferred_locale: nextLocale,
      },
      { onConflict: "user_id" }
    );
  };

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerRow}>
          <div className={styles.headerLeft}>
            <Link href="/app" className={styles.brandLink}>
              <div className={styles.brand}>
                <img
                  src="/brand/LogoFull.png"
                  alt={t("app.brand")}
                  className={styles.brandLogo}
                />
                <Text size={600} weight="semibold" className={styles.brandText}>
                  HUB
                </Text>
              </div>
            </Link>
            <div className={styles.navGroup}>
              <Menu openOnHover hoverDelay={0}>
                <MenuTrigger disableButtonEnhancement>
                  <Button
                    appearance={isProductsActive ? "primary" : "subtle"}
                    className={styles.navButton}
                  >
                    {t("nav.products")}
                  </Button>
                </MenuTrigger>
                <MenuPopover className={styles.menuPopover}>
                  <MenuList>
                    {productMenuItems
                      .filter((item) => (!item.adminOnly ? true : isAdmin))
                      .map((item) => (
                      <MenuItem
                        key={item.href}
                        onClick={() => router.push(item.href)}
                      >
                        <span className={styles.navMenuItem}>
                          {t(item.label)}
                        </span>
                      </MenuItem>
                    ))}
                  </MenuList>
                </MenuPopover>
              </Menu>
              <Menu openOnHover hoverDelay={0}>
                <MenuTrigger disableButtonEnhancement>
                  <Button
                    appearance={isDiscoveryActive ? "primary" : "subtle"}
                    className={styles.navButton}
                  >
                    {t("nav.productDiscovery")}
                  </Button>
                </MenuTrigger>
                <MenuPopover className={styles.menuPopover}>
                  <MenuList>
                    {discoveryMenuItems.map((item) => (
                      <MenuItem
                        key={item.href}
                        onClick={() => router.push(item.href)}
                      >
                        <span className={styles.navMenuItem}>{t(item.label)}</span>
                      </MenuItem>
                    ))}
                  </MenuList>
                </MenuPopover>
              </Menu>
              {isAdmin ? (
                <Menu openOnHover hoverDelay={0}>
                  <MenuTrigger disableButtonEnhancement>
                    <Button
                      appearance={pathname.startsWith("/app/orders") ? "primary" : "subtle"}
                      className={styles.navButton}
                    >
                      {t("nav.orders")}
                    </Button>
                  </MenuTrigger>
                  <MenuPopover className={styles.menuPopover}>
                    <MenuList>
                      {ordersMenuItems.map((item) => (
                        <MenuItem
                          key={item.href}
                          onClick={() => router.push(item.href)}
                        >
                          <span className={styles.navMenuItem}>{t(item.label)}</span>
                        </MenuItem>
                      ))}
                    </MenuList>
                  </MenuPopover>
                </Menu>
              ) : null}
              {isAdmin ? (
                <Menu openOnHover hoverDelay={0}>
                  <MenuTrigger disableButtonEnhancement>
                    <Button
                      appearance={isEmailActive ? "primary" : "subtle"}
                      className={styles.navButton}
                    >
                      {t("nav.email")}
                    </Button>
                  </MenuTrigger>
                  <MenuPopover className={styles.menuPopover}>
                    <MenuList>
                      {emailMenuItems.map((item) => (
                        <MenuItem
                          key={item.href}
                          onClick={() => router.push(item.href)}
                        >
                          <span className={styles.navMenuItem}>{t(item.label)}</span>
                        </MenuItem>
                      ))}
                    </MenuList>
                  </MenuPopover>
                </Menu>
              ) : null}
              {isAdmin ? (
                <Menu openOnHover hoverDelay={0}>
                  <MenuTrigger disableButtonEnhancement>
                    <Button
                      appearance={isProductionActive ? "primary" : "subtle"}
                      className={styles.navButton}
                    >
                      {t("nav.production")}
                    </Button>
                  </MenuTrigger>
                  <MenuPopover className={styles.menuPopover}>
                    <MenuList>
                      {productionMenuItems.map((item) => (
                        <MenuItem
                          key={item.href}
                          onClick={() => router.push(item.href)}
                        >
                          <span className={styles.navMenuItem}>
                            {t(item.label)}
                          </span>
                        </MenuItem>
                      ))}
                    </MenuList>
                  </MenuPopover>
                </Menu>
              ) : null}
              {isAdmin ? (
                <Menu openOnHover hoverDelay={0}>
                  <MenuTrigger disableButtonEnhancement>
                    <Button
                      appearance={isShopifyActive ? "primary" : "subtle"}
                      className={styles.navButton}
                    >
                      {t("nav.shopify")}
                    </Button>
                  </MenuTrigger>
                  <MenuPopover className={styles.menuPopover}>
                    <MenuList>
                      {shopifyMenuItems.map((item) => (
                        <MenuItem
                          key={item.href}
                          onClick={() => router.push(item.href)}
                        >
                          <span className={styles.navMenuItem}>
                            {t(item.label)}
                          </span>
                        </MenuItem>
                      ))}
                    </MenuList>
                  </MenuPopover>
                </Menu>
              ) : null}
              {visibleNavItems.map((item) => {
                const active = item.href ? pathname.startsWith(item.href) : false;
                const isResearch = item.href === "/app/trend-research";
                return (
                  <Button
                    key={item.href ?? item.label}
                    appearance={active ? "primary" : "subtle"}
                    data-active={active ? "true" : "false"}
                    className={mergeClasses(
                      styles.navButton,
                      isResearch ? styles.researchButton : undefined
                    )}
                    onClick={item.href ? () => router.push(item.href) : undefined}
                  >
                    {isResearch ? (
                      <span className={styles.navLabel}>
                        {t(item.label)}
                        <ResearchSparkIcon
                          className={mergeClasses(
                            styles.researchIcon,
                            "researchIcon"
                          )}
                        />
                      </span>
                    ) : (
                      t(item.label)
                    )}
                  </Button>
                );
              })}
            </div>
          </div>
          <Toolbar className={styles.toolbar}>
            <Dropdown
              aria-label={t("actions.language")}
              value={
                locale === "sv" ? "SV" : locale === "zh-Hans" ? "中文" : "EN"
              }
              selectedOptions={[locale]}
              onOptionSelect={(_, data) =>
                handleLocaleChange(String(data.optionValue))
              }
              className={styles.languageDropdown}
            >
              <Option value="en">EN</Option>
              <Option value="sv">SV</Option>
              <Option value="zh-Hans">中文</Option>
            </Dropdown>
            <Tooltip content={t("settings.title")} relationship="label">
              <ToolbarButton
                appearance="subtle"
                className={styles.toolbarIconButton}
                aria-label={t("settings.title")}
                icon={<SettingsIcon className={styles.toolbarIcon} />}
                onClick={() => router.push("/app/settings")}
              />
            </Tooltip>
            <Tooltip content={t("actions.signOut")} relationship="label">
              <ToolbarButton
                appearance="subtle"
                className={styles.toolbarIconButton}
                aria-label={t("actions.signOut")}
                icon={<LogoutIcon className={styles.toolbarIcon} />}
                onClick={handleSignOut}
              />
            </Tooltip>
          </Toolbar>
        </div>
      </header>
      <div className={styles.main}>
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SavedProductsProvider>
      <ShellInner>{children}</ShellInner>
    </SavedProductsProvider>
  );
}
