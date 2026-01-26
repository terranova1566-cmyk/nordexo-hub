"use client";

import {
  Button,
  Card,
  Checkbox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogSurface,
  DialogTitle,
  Dropdown,
  Field,
  Input,
  MessageBar,
  Option,
  Popover,
  PopoverSurface,
  PopoverTrigger,
  Slider,
  Spinner,
  Tab,
  TabList,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Tag,
  TagGroup,
  Text,
  Avatar,
  makeStyles,
  mergeClasses,
  tokens,
} from "@fluentui/react-components";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { useI18n } from "@/components/i18n-provider";
import { formatDateTime } from "@/lib/format";

type CategoryNode = {
  name: string;
  children: CategoryNode[];
};

type CategorySelection = {
  level: "l1" | "l2" | "l3";
  value: string;
};

type SystemInfo = {
  timestamp: string;
  hostname: string;
  platform: string;
  cpuCount: number;
  loadAvg: {
    one: number;
    five: number;
    fifteen: number;
  };
  loadPercent: {
    one: number;
    five: number;
    fifteen: number;
  };
  uptimeSeconds: number;
  memory: {
    total: number;
    free: number;
    used: number;
    usedPercent: number;
  };
  process: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
  };
  disk?: {
    total: number;
    used: number;
    free: number;
    usedPercent: number | null;
    mount: string;
  } | null;
  services?: ServiceStatus[];
};

type ServiceStatus = {
  id: "supabase" | "meilisearch";
  status: "healthy" | "down" | "unknown";
  detail?: string | null;
  checkedAt: string;
};

const createImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => reject(error));
    image.setAttribute("crossOrigin", "anonymous");
    image.src = url;
  });

const getCroppedImage = async (imageSrc: string, crop: Area) => {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Unable to crop image.");
  }

  const pixelRatio = window.devicePixelRatio || 1;
  canvas.width = Math.round(crop.width * pixelRatio);
  canvas.height = Math.round(crop.height * pixelRatio);
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.imageSmoothingQuality = "high";

  ctx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height
  );

  return canvas.toDataURL("image/jpeg", 0.9);
};

const useStyles = makeStyles({
  page: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  heading: {
    fontWeight: tokens.fontWeightSemibold,
  },
  tabsCard: {
    padding: "8px 16px",
    borderRadius: "var(--app-radius)",
  },
  sectionGrid: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  discoveryRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
    gap: "16px",
    alignItems: "start",
    "@media (max-width: 980px)": {
      gridTemplateColumns: "minmax(0, 1fr)",
    },
  },
  productionRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
    gap: "16px",
    alignItems: "start",
    "@media (max-width: 980px)": {
      gridTemplateColumns: "minmax(0, 1fr)",
    },
  },
  card: {
    padding: "16px",
    borderRadius: "var(--app-radius)",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  helperText: {
    color: tokens.colorNeutralForeground3,
  },
  categoryTrigger: {
    justifyContent: "space-between",
    width: "100%",
    textAlign: "left",
    fontWeight: tokens.fontWeightRegular,
  },
  categoryPopover: {
    padding: "12px",
    minWidth: "680px",
    maxWidth: "820px",
  },
  categorySearch: {
    marginBottom: "10px",
  },
  categoryColumns: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(210px, 1fr))",
    gap: "12px",
    alignItems: "start",
  },
  categoryColumn: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    maxHeight: "520px",
    overflowY: "auto",
    paddingRight: "12px",
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
  },
  categoryItemInteractive: {
    cursor: "pointer",
    "&:hover": {
      backgroundColor: "#f1f1f1",
    },
    "&:focus-visible": {
      outline: `2px solid ${tokens.colorBrandStroke1}`,
      outlineOffset: "1px",
    },
  },
  categoryNavButton: {
    border: "none",
    backgroundColor: "transparent",
    padding: 0,
    cursor: "pointer",
    textAlign: "left",
    color: tokens.colorNeutralForeground1,
    fontSize: tokens.fontSizeBase200,
  },
  categoryNavActive: {
    color: tokens.colorBrandForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },
  categoryCheckbox: {
    fontSize: tokens.fontSizeBase200,
    display: "flex",
    alignItems: "center",
  },
  categoryActions: {
    display: "flex",
    justifyContent: "space-between",
    gap: "8px",
    marginTop: "12px",
    alignItems: "center",
  },
  categoryFilters: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "8px",
  },
  keywordRow: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    alignItems: "center",
  },
  keywordInput: {
    minWidth: "240px",
  },
  keywordsGroup: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
  },
  saveRow: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "8px",
  },
  infoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "12px",
  },
  avatarRow: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    flexWrap: "wrap",
  },
  avatarActions: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  fileInputHidden: {
    display: "none",
  },
  dialogSurface: {
    padding: "24px",
    width: "min(520px, 92vw)",
  },
  dialogActions: {
    marginTop: "12px",
  },
  cropperWrap: {
    position: "relative",
    width: "100%",
    height: "320px",
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: "12px",
    overflow: "hidden",
  },
  cropperControls: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  cropperLabel: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  systemHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
  },
  metricLabel: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  metricValue: {
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
  },
  metricsTable: {
    borderRadius: "12px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    overflow: "hidden",
    backgroundColor: tokens.colorNeutralBackground1,
  },
  metricsHeader: {
    backgroundColor: tokens.colorNeutralBackground2,
  },
  serviceSection: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  serviceBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "999px",
    padding: "2px 10px",
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    border: `1px solid transparent`,
  },
  serviceHealthy: {
    backgroundColor: tokens.colorStatusSuccessBackground1,
    color: tokens.colorStatusSuccessForeground1,
    border: `1px solid ${tokens.colorStatusSuccessBackground1}`,
  },
  serviceDown: {
    backgroundColor: tokens.colorStatusDangerBackground1,
    color: tokens.colorStatusDangerForeground1,
    border: `1px solid ${tokens.colorStatusDangerBackground1}`,
  },
  serviceUnknown: {
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  serviceDetail: {
    color: tokens.colorNeutralForeground3,
  },
  systemContent: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  fileInput: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "8px",
    padding: "6px 8px",
    backgroundColor: tokens.colorNeutralBackground1,
    minWidth: "240px",
  },
  uploadRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
    alignItems: "flex-end",
  },
  downloadRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
    alignItems: "flex-end",
  },
});

const normalizeKeyword = (value: string) =>
  value.trim().toLowerCase();

export default function SettingsPage() {
  const styles = useStyles();
  const { t, locale, setLocale } = useI18n();
  const [activeTab, setActiveTab] = useState("discovery");

  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);

  const [categorySelections, setCategorySelections] = useState<CategorySelection[]>([]);
  const [categoryDraft, setCategoryDraft] = useState<CategorySelection[]>([]);
  const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [showHiddenOnly, setShowHiddenOnly] = useState(false);
  const [activeL1, setActiveL1] = useState<string | null>(null);
  const [activeL2, setActiveL2] = useState<string | null>(null);

  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState("");
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [profileEmail, setProfileEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [preferredLocale, setPreferredLocale] = useState(locale);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [profileSaveSuccess, setProfileSaveSuccess] = useState(false);
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropImage, setCropImage] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [isCropping, setIsCropping] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [systemLoading, setSystemLoading] = useState(false);
  const [systemError, setSystemError] = useState<string | null>(null);
  const [systemForbidden, setSystemForbidden] = useState(false);
  const [serviceRestarting, setServiceRestarting] = useState<
    Record<string, boolean>
  >({});
  const [serviceRestartError, setServiceRestartError] = useState<string | null>(
    null
  );
  const [spuUploadFile, setSpuUploadFile] = useState<File | null>(null);
  const [spuUploadLoading, setSpuUploadLoading] = useState(false);
  const [spuUploadError, setSpuUploadError] = useState<string | null>(null);
  const [spuUploadSuccess, setSpuUploadSuccess] = useState(false);
  const [spuDownloadStatus, setSpuDownloadStatus] = useState("all");
  const spuUploadRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let isActive = true;
    const loadCategories = async () => {
      setCategoriesLoading(true);
      setCategoriesError(null);
      try {
        const response = await fetch("/api/discovery/categories?provider=all");
        if (!response.ok) {
          throw new Error(t("discovery.error.categories"));
        }
        const payload = await response.json();
        if (!isActive) return;
        setCategories(payload.categories ?? []);
      } catch (err) {
        if (!isActive) return;
        setCategoriesError((err as Error).message);
      } finally {
        if (isActive) setCategoriesLoading(false);
      }
    };

    loadCategories();

    return () => {
      isActive = false;
    };
  }, [t]);

  const loadSystemInfo = useCallback(async () => {
    setSystemLoading(true);
    setSystemError(null);
    setSystemForbidden(false);
    try {
      const response = await fetch("/api/settings/system");
      if (response.status === 403 || response.status === 401) {
        setSystemForbidden(true);
        setSystemInfo(null);
        return;
      }
      if (!response.ok) {
        throw new Error(t("settings.system.error"));
      }
      const payload = await response.json();
      setSystemInfo(payload as SystemInfo);
    } catch (err) {
      setSystemError((err as Error).message);
    } finally {
      setSystemLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (activeTab !== "system") return;
    loadSystemInfo();
  }, [activeTab, loadSystemInfo]);

  const handleSpuUpload = async () => {
    if (!spuUploadFile) return;
    setSpuUploadLoading(true);
    setSpuUploadError(null);
    setSpuUploadSuccess(false);
    try {
      const formData = new FormData();
      formData.append("file", spuUploadFile);
      const response = await fetch("/api/production/spu-pool/upload", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || t("settings.production.uploadError"));
      }
      setSpuUploadSuccess(true);
      setSpuUploadFile(null);
      if (spuUploadRef.current) {
        spuUploadRef.current.value = "";
      }
      setTimeout(() => setSpuUploadSuccess(false), 2500);
    } catch (err) {
      setSpuUploadError((err as Error).message);
    } finally {
      setSpuUploadLoading(false);
    }
  };

  const handleSpuDownload = () => {
    const status =
      spuDownloadStatus === "free" || spuDownloadStatus === "used"
        ? spuDownloadStatus
        : "all";
    window.open(
      `/api/production/spu-pool/download?status=${encodeURIComponent(status)}`,
      "_blank"
    );
  };

  const serviceLabels = useMemo(
    () => ({
      supabase: t("settings.system.services.supabase"),
      meilisearch: t("settings.system.services.meilisearch"),
    }),
    [t]
  );

  const serviceStatusLabels = useMemo(
    () => ({
      healthy: t("settings.system.services.status.healthy"),
      down: t("settings.system.services.status.down"),
      unknown: t("settings.system.services.status.unknown"),
    }),
    [t]
  );

  const handleServiceRestart = async (serviceId: ServiceStatus["id"]) => {
    setServiceRestartError(null);
    setServiceRestarting((prev) => ({ ...prev, [serviceId]: true }));
    try {
      const response = await fetch("/api/settings/system/restart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service: serviceId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || t("settings.system.services.restartError"));
      }
      await loadSystemInfo();
    } catch (err) {
      setServiceRestartError((err as Error).message);
    } finally {
      setServiceRestarting((prev) => ({ ...prev, [serviceId]: false }));
    }
  };

  const formatBytes = (value?: number | null) => {
    if (value === null || value === undefined) return "-";
    if (!Number.isFinite(value)) return "-";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let size = value;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024;
      unit += 1;
    }
    const digits = size >= 10 || unit === 0 ? 0 : 1;
    return `${size.toFixed(digits)} ${units[unit]}`;
  };

  const formatPercent = (value?: number | null) => {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return "-";
    }
    return `${Math.round(value)}%`;
  };

  const formatUptime = (seconds?: number | null) => {
    if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) {
      return "-";
    }
    const total = Math.max(0, Math.floor(seconds));
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    return `${days}d ${String(hours).padStart(2, "0")}h ${String(
      minutes
    ).padStart(2, "0")}m`;
  };

  useEffect(() => {
    let isActive = true;
    const loadProfile = async () => {
      setProfileLoading(true);
      setProfileError(null);
      try {
        const response = await fetch("/api/settings/profile");
        if (!response.ok) {
          throw new Error(t("settings.user.error"));
        }
        const payload = await response.json();
        if (!isActive) return;
        setProfileEmail(payload.email ?? "");
        setFullName(payload.full_name ?? "");
        setCompanyName(payload.company_name ?? "");
        setJobTitle(payload.job_title ?? "");
        setAvatarUrl(payload.avatar_url ?? "");
        setPreferredLocale(payload.preferred_locale ?? locale);
      } catch (err) {
        if (!isActive) return;
        setProfileError((err as Error).message);
      } finally {
        if (isActive) setProfileLoading(false);
      }
    };

    loadProfile();

    return () => {
      isActive = false;
    };
  }, [locale, t]);

  useEffect(() => {
    let isActive = true;
    const loadSettings = async () => {
      setSettingsLoading(true);
      setSettingsError(null);
      try {
        const response = await fetch("/api/settings/discovery");
        if (!response.ok) {
          throw new Error(t("settings.discovery.error"));
        }
        const payload = await response.json();
        if (!isActive) return;
        setCategorySelections(payload.categories ?? []);
        setKeywords(payload.keywords ?? []);
      } catch (err) {
        if (!isActive) return;
        setSettingsError((err as Error).message);
      } finally {
        if (isActive) setSettingsLoading(false);
      }
    };

    loadSettings();

    return () => {
      isActive = false;
    };
  }, [t]);

  useEffect(() => {
    if (categoryPopoverOpen) {
      setCategoryDraft(categorySelections);
    }
  }, [categoryPopoverOpen, categorySelections]);

  const categorySearchNormalized = categorySearch.trim().toLowerCase();
  const categoryTokens = useMemo(
    () => categorySearchNormalized.split(/\s+/).filter(Boolean),
    [categorySearchNormalized]
  );
  const matchCategoryTokens = useCallback(
    (value: string) => {
      if (categoryTokens.length === 0) return true;
      const normalized = value.toLowerCase();
      return categoryTokens.some((token) => normalized.includes(token));
    },
    [categoryTokens]
  );

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
        return (l2.children ?? []).some((l3) =>
          matchCategoryTokens(l3.name)
        );
      });
    });
  }, [categories, categoryTokens.length, matchCategoryTokens]);

  const draftKeySet = useMemo(
    () => new Set(categoryDraft.map((item) => `${item.level}:${item.value}`)),
    [categoryDraft]
  );

  const visibleCategories = useMemo(() => {
    if (!showHiddenOnly) return filteredCategories;

    const hasSelection = (level: CategorySelection["level"], value: string) =>
      draftKeySet.has(`${level}:${value}`);

    return filteredCategories
      .map((l1) => {
        const l1Selected = hasSelection("l1", l1.name);
        const l2Children = (l1.children ?? [])
          .map((l2) => {
            const l2Selected = hasSelection("l2", l2.name);
            const l3Children = (l2.children ?? []).filter((l3) =>
              hasSelection("l3", l3.name)
            );
            if (l2Selected || l3Children.length > 0) {
              return { ...l2, children: l3Children };
            }
            return null;
          })
          .filter((entry): entry is CategoryNode => Boolean(entry));

        if (l1Selected || l2Children.length > 0) {
          return { ...l1, children: l2Children };
        }
        return null;
      })
      .filter((entry): entry is CategoryNode => Boolean(entry));
  }, [filteredCategories, showHiddenOnly, draftKeySet]);

  useEffect(() => {
    if (!categoryPopoverOpen) return;
    if (visibleCategories.length === 0) return;
    if (!activeL1 || !visibleCategories.some((node) => node.name === activeL1)) {
      setActiveL1(visibleCategories[0]?.name ?? null);
      setActiveL2(null);
    }
  }, [categoryPopoverOpen, visibleCategories, activeL1]);

  useEffect(() => {
    if (!categoryPopoverOpen || !activeL1) return;
    const l1Node = visibleCategories.find((node) => node.name === activeL1);
    const l2Nodes = l1Node?.children ?? [];
    if (l2Nodes.length === 0) {
      setActiveL2(null);
      return;
    }
    if (!activeL2 || !l2Nodes.some((node) => node.name === activeL2)) {
      setActiveL2(l2Nodes[0]?.name ?? null);
    }
  }, [categoryPopoverOpen, visibleCategories, activeL1, activeL2]);

  const filteredL2Nodes = useMemo(() => {
    const l1Node = visibleCategories.find((node) => node.name === activeL1);
    return l1Node?.children ?? [];
  }, [visibleCategories, activeL1]);

  const filteredL3Nodes = useMemo(() => {
    const l1Node = visibleCategories.find((node) => node.name === activeL1);
    const l2Node = (l1Node?.children ?? []).find((child) => child.name === activeL2);
    return l2Node?.children ?? [];
  }, [visibleCategories, activeL1, activeL2]);

  const toggleDraftCategory = useCallback(
    (level: CategorySelection["level"], value: string) => {
      setCategoryDraft((prev) => {
        const key = `${level}:${value}`;
        if (prev.some((item) => `${item.level}:${item.value}` === key)) {
          return prev.filter((item) => `${item.level}:${item.value}` !== key);
        }
        return [...prev, { level, value }];
      });
    },
    []
  );

  const clearDraftCategories = () => {
    setCategoryDraft([]);
  };

  const handleAddKeyword = () => {
    const trimmed = keywordInput.trim();
    if (!trimmed) return;
    const normalized = normalizeKeyword(trimmed);
    const existing = new Set(keywords.map((keyword) => normalizeKeyword(keyword)));
    if (existing.has(normalized)) {
      setKeywordInput("");
      return;
    }
    setKeywords((prev) => [...prev, trimmed]);
    setKeywordInput("");
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const response = await fetch("/api/settings/discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categories: categorySelections,
          keywords,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || t("settings.discovery.saveError"));
      }
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
      }, 2500);
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setAvatarError(t("settings.user.avatar.invalid"));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setAvatarError(t("settings.user.avatar.tooLarge"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAvatarError(null);
      const result = String(reader.result ?? "");
      if (!result) return;
      setCropImage(result);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedArea(null);
      setCropOpen(true);
    };
    reader.readAsDataURL(file);
  };

  const handleCropSave = async () => {
    if (!cropImage || !croppedArea) return;
    setIsCropping(true);
    try {
      const cropped = await getCroppedImage(cropImage, croppedArea);
      setAvatarUrl(cropped);
      setCropOpen(false);
    } catch (err) {
      setAvatarError((err as Error).message);
    } finally {
      setIsCropping(false);
    }
  };

  const handleProfileSave = async () => {
    setIsProfileSaving(true);
    setProfileSaveError(null);
    setProfileSaveSuccess(false);
    try {
      const response = await fetch("/api/settings/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          company_name: companyName,
          job_title: jobTitle,
          avatar_url: avatarUrl || null,
          preferred_locale: preferredLocale,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || t("settings.user.saveError"));
      }
      setProfileSaveSuccess(true);
      if (preferredLocale !== locale) {
        setLocale(preferredLocale as typeof locale);
      }
      setTimeout(() => {
        setProfileSaveSuccess(false);
      }, 2500);
    } catch (err) {
      setProfileSaveError((err as Error).message);
    } finally {
      setIsProfileSaving(false);
    }
  };

  const categorySummary =
    categorySelections.length === 0
      ? t("settings.discovery.categories.none")
      : t("settings.discovery.categories.count", {
          count: categorySelections.length,
        });

  return (
    <div className={styles.page}>
      <Text size={700} className={styles.heading}>
        {t("settings.title")}
      </Text>

      <Card className={styles.tabsCard}>
        <TabList
          selectedValue={activeTab}
          onTabSelect={(_, data) => setActiveTab(String(data.value))}
        >
          <Tab value="discovery">{t("settings.discovery.tab")}</Tab>
          <Tab value="user">{t("settings.user.tab")}</Tab>
          <Tab value="production">{t("settings.production.tab")}</Tab>
          <Tab value="system">{t("settings.system.tab")}</Tab>
        </TabList>
      </Card>

      {activeTab === "discovery" ? (
        <div className={styles.sectionGrid}>
          <div className={styles.discoveryRow}>
            <Card className={styles.card}>
              <Text weight="semibold">
                {t("settings.discovery.categories.title")}
              </Text>
              <Text size={200} className={styles.helperText}>
                {t("settings.discovery.categories.helper")}
              </Text>
              {settingsError ? (
                <MessageBar>{settingsError}</MessageBar>
              ) : null}
              <Field
                label={t("settings.discovery.categories.label")}
              >
                <Popover
                  open={categoryPopoverOpen}
                  onOpenChange={(_, data) => setCategoryPopoverOpen(data.open)}
                  positioning={{
                    position: "below",
                    align: "start",
                    offset: { mainAxis: 6 },
                  }}
                >
                  <PopoverTrigger disableButtonEnhancement>
                    <Button appearance="outline" className={styles.categoryTrigger}>
                      {categorySummary}
                    </Button>
                  </PopoverTrigger>
                  <PopoverSurface className={styles.categoryPopover}>
                    {categoriesLoading ? (
                      <Spinner label={t("discovery.categories.loading")} />
                    ) : categoriesError ? (
                      <MessageBar>{categoriesError}</MessageBar>
                    ) : categories.length === 0 ? (
                      <Text>{t("discovery.categories.empty")}</Text>
                    ) : (
                      <>
                        <Input
                          value={categorySearch}
                          onChange={(_, data) => setCategorySearch(data.value)}
                          placeholder={t("discovery.categories.searchPlaceholder")}
                          className={styles.categorySearch}
                        />
                        <div className={styles.categoryFilters}>
                          <Checkbox
                            checked={showHiddenOnly}
                            onChange={(_, data) =>
                              setShowHiddenOnly(Boolean(data.checked))
                            }
                            label={t("settings.discovery.categories.showHidden")}
                          />
                        </div>
                        <div className={styles.categoryColumns}>
                          <div className={styles.categoryColumn}>
                            <Text className={styles.categoryColumnTitle}>
                              {t("discovery.categories.level1")}
                            </Text>
                            {visibleCategories.map((l1) => (
                              <div
                                key={l1.name}
                                className={mergeClasses(
                                  styles.categoryItem,
                                  styles.categoryItemInteractive
                                )}
                                role="button"
                                tabIndex={0}
                                onClick={() => setActiveL1(l1.name)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    setActiveL1(l1.name);
                                  }
                                }}
                              >
                                <Checkbox
                                  checked={draftKeySet.has(`l1:${l1.name}`)}
                                  className={styles.categoryCheckbox}
                                  aria-label={t("common.selectItem", { item: l1.name })}
                                  onChange={() => toggleDraftCategory("l1", l1.name)}
                                  onClick={(event) => event.stopPropagation()}
                                />
                                <span
                                  className={mergeClasses(
                                    styles.categoryNavButton,
                                    activeL1 === l1.name ? styles.categoryNavActive : undefined
                                  )}
                                >
                                  {l1.name}
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className={styles.categoryColumn}>
                            <Text className={styles.categoryColumnTitle}>
                              {t("discovery.categories.level2")}
                            </Text>
                            {filteredL2Nodes.map((l2) => (
                              <div
                                key={l2.name}
                                className={mergeClasses(
                                  styles.categoryItem,
                                  styles.categoryItemInteractive
                                )}
                                role="button"
                                tabIndex={0}
                                onClick={() => setActiveL2(l2.name)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    setActiveL2(l2.name);
                                  }
                                }}
                              >
                                <Checkbox
                                  checked={draftKeySet.has(`l2:${l2.name}`)}
                                  className={styles.categoryCheckbox}
                                  aria-label={t("common.selectItem", { item: l2.name })}
                                  onChange={() => toggleDraftCategory("l2", l2.name)}
                                  onClick={(event) => event.stopPropagation()}
                                />
                                <span
                                  className={mergeClasses(
                                    styles.categoryNavButton,
                                    activeL2 === l2.name ? styles.categoryNavActive : undefined
                                  )}
                                >
                                  {l2.name}
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className={styles.categoryColumn}>
                            <Text className={styles.categoryColumnTitle}>
                              {t("discovery.categories.level3")}
                            </Text>
                            {filteredL3Nodes.map((l3) => (
                              <div
                                key={l3.name}
                                className={mergeClasses(
                                  styles.categoryItem,
                                  styles.categoryItemInteractive
                                )}
                                role="button"
                                tabIndex={0}
                                onClick={() => toggleDraftCategory("l3", l3.name)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    toggleDraftCategory("l3", l3.name);
                                  }
                                }}
                              >
                                <Checkbox
                                  checked={draftKeySet.has(`l3:${l3.name}`)}
                                  className={styles.categoryCheckbox}
                                  aria-label={t("common.selectItem", { item: l3.name })}
                                  onChange={() => toggleDraftCategory("l3", l3.name)}
                                  onClick={(event) => event.stopPropagation()}
                                />
                                <span className={styles.categoryNavButton}>{l3.name}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                    <div className={styles.categoryActions}>
                      <Button
                        appearance="subtle"
                        onClick={clearDraftCategories}
                        disabled={categoryDraft.length === 0}
                      >
                        {t("settings.discovery.categories.unhideAll")}
                      </Button>
                      <Button
                        appearance="primary"
                        onClick={() => {
                          setCategorySelections(categoryDraft);
                          setCategoryPopoverOpen(false);
                        }}
                      >
                        {t("common.done")}
                      </Button>
                    </div>
                  </PopoverSurface>
                </Popover>
              </Field>
            </Card>

            <Card className={styles.card}>
              <Text weight="semibold">
                {t("settings.discovery.keywords.title")}
              </Text>
              <Text size={200} className={styles.helperText}>
                {t("settings.discovery.keywords.helper")}
              </Text>
              <div className={styles.keywordRow}>
                <Input
                  value={keywordInput}
                  onChange={(_, data) => setKeywordInput(data.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleAddKeyword();
                    }
                  }}
                  placeholder={t("settings.discovery.keywords.placeholder")}
                  className={styles.keywordInput}
                  disabled={settingsLoading}
                />
                <Button
                  appearance="outline"
                  onClick={handleAddKeyword}
                  disabled={settingsLoading}
                >
                  {t("settings.discovery.keywords.add")}
                </Button>
              </div>
              {keywords.length > 0 ? (
                <TagGroup
                  dismissible
                  onDismiss={(_, data) =>
                    setKeywords((prev) =>
                      prev.filter((keyword) => keyword !== String(data.value))
                    )
                  }
                  className={styles.keywordsGroup}
                >
                  {keywords.map((keyword) => (
                    <Tag
                      key={keyword}
                      value={keyword}
                      dismissible
                      appearance="outline"
                      size="small"
                    >
                      {keyword}
                    </Tag>
                  ))}
                </TagGroup>
              ) : null}
            </Card>
          </div>

          {saveError ? <MessageBar>{saveError}</MessageBar> : null}
          {saveSuccess ? (
            <MessageBar>{t("settings.discovery.saveSuccess")}</MessageBar>
          ) : null}

          <div className={styles.saveRow}>
            <Button
              appearance="primary"
              onClick={handleSave}
              disabled={isSaving || settingsLoading}
            >
              {isSaving ? t("settings.discovery.saving") : t("common.save")}
            </Button>
          </div>
        </div>
      ) : null}

      {activeTab === "production" ? (
        <div className={styles.sectionGrid}>
          <div className={styles.productionRow}>
            <Card className={styles.card}>
              <Text weight="semibold">
                {t("settings.production.upload.title")}
              </Text>
              <Text size={200} className={styles.helperText}>
                {t("settings.production.upload.helper")}
              </Text>
              {spuUploadError ? (
                <MessageBar>{spuUploadError}</MessageBar>
              ) : null}
              {spuUploadSuccess ? (
                <MessageBar intent="success">
                  {t("settings.production.upload.success")}
                </MessageBar>
              ) : null}
              <div className={styles.uploadRow}>
                <Field label={t("settings.production.upload.label")}>
                  <input
                    type="file"
                    accept=".txt,.csv,.xlsx,.xls"
                    className={styles.fileInput}
                    ref={spuUploadRef}
                    onChange={(event) =>
                      setSpuUploadFile(event.target.files?.[0] ?? null)
                    }
                  />
                </Field>
                <Button
                  appearance="primary"
                  onClick={handleSpuUpload}
                  disabled={!spuUploadFile || spuUploadLoading}
                >
                  {spuUploadLoading ? (
                    <Spinner size="tiny" />
                  ) : (
                    t("settings.production.upload.button")
                  )}
                </Button>
              </div>
            </Card>

            <Card className={styles.card}>
              <Text weight="semibold">
                {t("settings.production.download.title")}
              </Text>
              <Text size={200} className={styles.helperText}>
                {t("settings.production.download.helper")}
              </Text>
              <div className={styles.downloadRow}>
                <Field label={t("settings.production.download.label")}>
                  <Dropdown
                    selectedOptions={[spuDownloadStatus]}
                    onOptionSelect={(_, data) =>
                      setSpuDownloadStatus(
                        String(data.optionValue ?? data.selectedOptions?.[0] ?? "all")
                      )
                    }
                  >
                    <Option value="all">
                      {t("settings.production.download.all")}
                    </Option>
                    <Option value="free">
                      {t("settings.production.download.free")}
                    </Option>
                    <Option value="used">
                      {t("settings.production.download.used")}
                    </Option>
                  </Dropdown>
                </Field>
                <Button appearance="outline" onClick={handleSpuDownload}>
                  {t("settings.production.download.button")}
                </Button>
              </div>
            </Card>
          </div>
        </div>
      ) : null}

      {activeTab === "user" ? (
        <div className={styles.sectionGrid}>
          <Card className={styles.card}>
            <Text weight="semibold">{t("settings.user.basic.title")}</Text>
            <Text size={200} className={styles.helperText}>
              {t("settings.user.basic.helper")}
            </Text>
            {profileLoading ? <Spinner /> : null}
            {profileError ? <MessageBar>{profileError}</MessageBar> : null}
            <div className={styles.infoGrid}>
              <Field label={t("settings.user.basic.name")}>
                <Input
                  value={fullName}
                  onChange={(_, data) => setFullName(data.value)}
                  disabled={profileLoading}
                />
              </Field>
              <Field label={t("settings.user.basic.company")}>
                <Input
                  value={companyName}
                  onChange={(_, data) => setCompanyName(data.value)}
                  disabled={profileLoading}
                />
              </Field>
              <Field label={t("settings.user.basic.role")}>
                <Input
                  value={jobTitle}
                  onChange={(_, data) => setJobTitle(data.value)}
                  disabled={profileLoading}
                />
              </Field>
              <Field label={t("settings.user.basic.email")}>
                <Input value={profileEmail} disabled />
              </Field>
            </div>
          </Card>

          <Card className={styles.card}>
            <Text weight="semibold">{t("settings.user.avatar.title")}</Text>
            <Text size={200} className={styles.helperText}>
              {t("settings.user.avatar.helper")}
            </Text>
            <div className={styles.avatarRow}>
              <Avatar
                name={fullName || profileEmail}
                image={avatarUrl ? { src: avatarUrl } : undefined}
                size={64}
              />
              <div className={styles.avatarActions}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className={styles.fileInputHidden}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) handleAvatarFile(file);
                    event.currentTarget.value = "";
                  }}
                />
                <Button
                  appearance="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={profileLoading}
                >
                  {t("settings.user.avatar.upload")}
                </Button>
                {avatarUrl ? (
                  <Button
                    appearance="subtle"
                    onClick={() => setAvatarUrl("")}
                    disabled={profileLoading}
                  >
                    {t("settings.user.avatar.remove")}
                  </Button>
                ) : null}
              </div>
            </div>
            {avatarError ? <MessageBar>{avatarError}</MessageBar> : null}
          </Card>

          <Dialog
            open={cropOpen}
            onOpenChange={(_, data) => {
              setCropOpen(data.open);
              if (!data.open) {
                setCropImage(null);
              }
            }}
          >
            <DialogSurface className={styles.dialogSurface}>
              <DialogBody>
                <DialogTitle>{t("settings.user.avatar.cropTitle")}</DialogTitle>
                <div className={styles.cropperWrap}>
                  {cropImage ? (
                    <Cropper
                      image={cropImage}
                      crop={crop}
                      zoom={zoom}
                      aspect={1}
                      onCropChange={setCrop}
                      onZoomChange={setZoom}
                      onCropComplete={(_, areaPixels) =>
                        setCroppedArea(areaPixels)
                      }
                      showGrid={false}
                    />
                  ) : null}
                </div>
                <div className={styles.cropperControls}>
                  <Text size={200} className={styles.cropperLabel}>
                    {t("settings.user.avatar.cropZoom")}
                  </Text>
                  <Slider
                    min={1}
                    max={3}
                    step={0.1}
                    value={zoom}
                    onChange={(_, data) => setZoom(Number(data.value))}
                  />
                </div>
                <DialogActions className={styles.dialogActions}>
                  <Button
                    appearance="subtle"
                    onClick={() => setCropOpen(false)}
                    disabled={isCropping}
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    appearance="primary"
                    onClick={handleCropSave}
                    disabled={isCropping || !croppedArea}
                  >
                    {isCropping
                      ? t("settings.user.avatar.cropping")
                      : t("settings.user.avatar.crop")}
                  </Button>
                </DialogActions>
              </DialogBody>
            </DialogSurface>
          </Dialog>

          <Card className={styles.card}>
            <Text weight="semibold">{t("settings.user.preferences.title")}</Text>
            <Text size={200} className={styles.helperText}>
              {t("settings.user.preferences.helper")}
            </Text>
            <Field label={t("settings.user.preferences.language")}>
              <Dropdown
                value={
                  preferredLocale === "zh-Hans"
                    ? "中文"
                    : t(
                        preferredLocale === "sv"
                          ? "language.swedish"
                          : "language.english"
                      )
                }
                selectedOptions={[preferredLocale]}
                onOptionSelect={(_, data) => {
                  const nextLocale = String(data.optionValue) as typeof locale;
                  setPreferredLocale(nextLocale);
                }}
              >
                <Option value="en">{t("language.english")}</Option>
                <Option value="sv">{t("language.swedish")}</Option>
                <Option value="zh-Hans">中文</Option>
              </Dropdown>
            </Field>
          </Card>

          {profileSaveError ? <MessageBar>{profileSaveError}</MessageBar> : null}
          {profileSaveSuccess ? (
            <MessageBar>{t("settings.user.saveSuccess")}</MessageBar>
          ) : null}

          <div className={styles.saveRow}>
            <Button
              appearance="primary"
              onClick={handleProfileSave}
              disabled={isProfileSaving || profileLoading}
            >
              {isProfileSaving ? t("settings.user.saving") : t("common.save")}
            </Button>
          </div>
        </div>
      ) : null}

      {activeTab === "system" ? (
        <div className={styles.sectionGrid}>
          <Card className={styles.card}>
            <div className={styles.systemHeader}>
              <Text weight="semibold">{t("settings.system.title")}</Text>
              <Button
                appearance="subtle"
                onClick={loadSystemInfo}
                disabled={systemLoading}
              >
                {t("settings.system.refresh")}
              </Button>
            </div>
            <Text size={200} className={styles.helperText}>
              {t("settings.system.helper")}
            </Text>

            {systemForbidden ? (
              <MessageBar>{t("settings.system.forbidden")}</MessageBar>
            ) : systemError ? (
              <MessageBar>{systemError}</MessageBar>
            ) : null}
            {serviceRestartError ? (
              <MessageBar>{serviceRestartError}</MessageBar>
            ) : null}

            {systemLoading ? (
              <Spinner label={t("settings.system.loading")} />
            ) : systemInfo ? (
              <div className={styles.systemContent}>
                {systemInfo.services && systemInfo.services.length > 0 ? (
                  <div className={styles.serviceSection}>
                    <Text weight="semibold">
                      {t("settings.system.services.title")}
                    </Text>
                    <Table size="small" className={styles.metricsTable}>
                      <TableHeader>
                        <TableRow className={styles.metricsHeader}>
                          <TableHeaderCell>
                            {t("settings.system.services.table.service")}
                          </TableHeaderCell>
                          <TableHeaderCell>
                            {t("settings.system.services.table.status")}
                          </TableHeaderCell>
                          <TableHeaderCell>
                            {t("settings.system.services.table.detail")}
                          </TableHeaderCell>
                          <TableHeaderCell>
                            {t("settings.system.services.table.actions")}
                          </TableHeaderCell>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {systemInfo.services.map((service) => {
                          const label =
                            serviceLabels[service.id] ?? service.id;
                          const statusLabel =
                            serviceStatusLabels[service.status] ??
                            service.status;
                          const statusClass =
                            service.status === "healthy"
                              ? styles.serviceHealthy
                              : service.status === "down"
                                ? styles.serviceDown
                                : styles.serviceUnknown;
                          const canRestart = service.id === "meilisearch";
                          const isRestarting = Boolean(
                            serviceRestarting[service.id]
                          );
                          return (
                            <TableRow key={service.id}>
                              <TableCell>{label}</TableCell>
                              <TableCell>
                                <span
                                  className={mergeClasses(
                                    styles.serviceBadge,
                                    statusClass
                                  )}
                                >
                                  {statusLabel}
                                </span>
                              </TableCell>
                              <TableCell className={styles.serviceDetail}>
                                {service.detail ?? "-"}
                              </TableCell>
                              <TableCell>
                                {canRestart ? (
                                  <Button
                                    size="small"
                                    appearance="outline"
                                    disabled={isRestarting}
                                    onClick={() => handleServiceRestart(service.id)}
                                  >
                                    {isRestarting
                                      ? t("settings.system.services.actions.restarting")
                                      : t("settings.system.services.actions.restart")}
                                  </Button>
                                ) : (
                                  "-"
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : null}

                <Table size="small" className={styles.metricsTable}>
                  <TableHeader>
                    <TableRow className={styles.metricsHeader}>
                      <TableHeaderCell>
                        {t("settings.system.table.metric")}
                      </TableHeaderCell>
                      <TableHeaderCell>
                        {t("settings.system.table.value")}
                      </TableHeaderCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell>{t("settings.system.metrics.hostname")}</TableCell>
                      <TableCell>{systemInfo.hostname}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>{t("settings.system.metrics.platform")}</TableCell>
                      <TableCell>{systemInfo.platform}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>{t("settings.system.metrics.uptime")}</TableCell>
                      <TableCell>{formatUptime(systemInfo.uptimeSeconds)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>{t("settings.system.metrics.cpu")}</TableCell>
                      <TableCell>{systemInfo.cpuCount}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>{t("settings.system.metrics.load")}</TableCell>
                      <TableCell>
                        {systemInfo.loadAvg.one.toFixed(2)} /{" "}
                        {systemInfo.loadAvg.five.toFixed(2)} /{" "}
                        {systemInfo.loadAvg.fifteen.toFixed(2)} (
                        {formatPercent(systemInfo.loadPercent.one)} /{" "}
                        {formatPercent(systemInfo.loadPercent.five)} /{" "}
                        {formatPercent(systemInfo.loadPercent.fifteen)})
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>{t("settings.system.metrics.memory")}</TableCell>
                      <TableCell>
                        {formatBytes(systemInfo.memory.used)} /{" "}
                        {formatBytes(systemInfo.memory.total)} (
                        {formatPercent(systemInfo.memory.usedPercent)})
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>
                        {t("settings.system.metrics.processMemory")}
                      </TableCell>
                      <TableCell>
                        {formatBytes(systemInfo.process.rss)} /{" "}
                        {formatBytes(systemInfo.process.heapUsed)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>{t("settings.system.metrics.disk")}</TableCell>
                      <TableCell>
                        {systemInfo.disk
                          ? `${formatBytes(systemInfo.disk.used)} / ${formatBytes(
                              systemInfo.disk.total
                            )} (${formatPercent(systemInfo.disk.usedPercent)})`
                          : "-"}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>{t("settings.system.metrics.updated")}</TableCell>
                      <TableCell>{formatDateTime(systemInfo.timestamp)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            ) : null}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
