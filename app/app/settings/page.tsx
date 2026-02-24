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
  Textarea,
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
import UIKitShowcase from "@/components/ui-kit-showcase";
import { formatDateTime } from "@/lib/format";
import ShopifySyncerPanel from "./shopify-syncer-panel";

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

type ZImageSettings = {
  base_url: string;
  resolution: string;
  format: string;
  final_size: number;
  auto_center: boolean;
  cookie: {
    is_set: boolean;
    preview: string;
  };
  api_key: {
    is_set: boolean;
    preview: string;
  };
};

type AIImageEditSettings = {
  chatgpt_prompt_template: string;
  gemini_prompt_template: string;
  digideal_main_prompt_template: string;
  enviorment_scene_image_prompt_template: string;
  product_collection_image_prompt_template: string;
};

type AIImageEditPromptMeta = {
  source?: string | null;
  updated_at?: string | null;
};

type AIImageEditSettingsResponse = AIImageEditSettings & {
  meta?: {
    chatgpt_prompt_template?: AIImageEditPromptMeta;
    gemini_prompt_template?: AIImageEditPromptMeta;
    digideal_main_prompt_template?: AIImageEditPromptMeta;
    enviorment_scene_image_prompt_template?: AIImageEditPromptMeta;
    product_collection_image_prompt_template?: AIImageEditPromptMeta;
  };
};

type AIImagePromptKey =
  | "chatgpt"
  | "gemini"
  | "digideal_main"
  | "enviorment_scene"
  | "product_collection"
  | `custom:${string}`;

type AIImageEditCustomPrompt = {
  prompt_id: string;
  name: string;
  usage?: string | null;
  description?: string | null;
  address?: string | null;
  template_text?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type AIImageEditPromptVersion = {
  id: string;
  prompt_id: string;
  template_text: string;
  created_at: string;
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
    backgroundColor: "#fafafa",
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
    backgroundColor: "#fafafa",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  uiAuditGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
    gap: "12px",
  },
  uiAuditItem: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "12px",
    borderRadius: "10px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  uiAuditLinks: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
  },
  uiAuditRoute: {
    fontFamily: tokens.fontFamilyMonospace,
    color: tokens.colorNeutralForeground3,
  },
  uiAuditNote: {
    color: tokens.colorNeutralForeground3,
  },
  helperText: {
    color: tokens.colorNeutralForeground3,
  },
  sectionTitleBlock: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    minWidth: 0,
  },
  sectionSubtitle: {
    marginTop: "-2px",
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
  aiImageGuideDialogSurface: {
    padding: "24px",
    width: "min(920px, 94vw)",
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
  textArea: {
    width: "100%",
    minHeight: "220px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "8px",
    padding: "10px",
    fontFamily: "monospace",
    fontSize: tokens.fontSizeBase200,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    resize: "vertical",
  },
  aiImageGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(300px, 25%) minmax(0, 1fr)",
    gap: "16px",
    alignItems: "stretch",
    "@media (max-width: 980px)": {
      gridTemplateColumns: "minmax(0, 1fr)",
    },
  },
  aiImageSidebar: {
    borderRadius: "12px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
  },
  aiImageSidebarHeader: {
    padding: "12px 12px 10px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: "#fafafa",
  },
  aiImageSidebarHeaderRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
  },
  aiImageSidebarSearch: {
    marginTop: "8px",
  },
  fullWidthControl: {
    width: "100%",
  },
  aiImagePromptList: {
    display: "flex",
    flexDirection: "column",
    overflowY: "auto",
    flex: "1 1 auto",
    minHeight: 0,
  },
  aiImageSidebarFooter: {
    padding: "12px",
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: "#fafafa",
    display: "flex",
    justifyContent: "flex-end",
  },
  aiImagePromptItem: {
    border: "none",
    background: "transparent",
    textAlign: "left",
    cursor: "pointer",
    padding: "12px 12px 10px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    transition: "background-color 0.12s ease",
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground2,
    },
    "&:focus-visible": {
      outline: `2px solid ${tokens.colorBrandStroke1}`,
      outlineOffset: "-2px",
    },
  },
  aiImagePromptItemActive: {
    backgroundColor: "#edf6ff",
  },
  aiImagePromptTopRow: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: "10px",
  },
  aiImagePromptUpdated: {
    fontSize: tokens.fontSizeBase100,
    lineHeight: tokens.lineHeightBase100,
    color: tokens.colorNeutralForeground3,
    whiteSpace: "nowrap",
  },
  aiImagePromptUsage: {
    marginTop: "4px",
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
  },
  aiImagePromptDescription: {
    marginTop: "2px",
    color: tokens.colorNeutralForeground4,
    fontSize: tokens.fontSizeBase100,
    lineHeight: tokens.lineHeightBase200,
  },
  highlight: {
    backgroundColor: "#fff6bf",
    borderRadius: "2px",
    padding: "0 1px",
  },
  aiImageGuideContent: {
    marginTop: "12px",
    padding: "12px",
    borderRadius: "10px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    whiteSpace: "pre-wrap",
    overflowY: "auto",
    maxHeight: "min(70vh, 680px)",
  },
  aiImageEditor: {
    borderRadius: "12px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    // Allow the editor to grow with the prompt so the page can scroll naturally.
    overflow: "visible",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
  },
  aiImageEditorHeader: {
    padding: "12px 12px 10px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: "#fafafa",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap",
  },
  aiImageEditorHeaderControls: {
    display: "flex",
    alignItems: "flex-end",
    gap: "12px",
    flexWrap: "wrap",
  },
  aiImageEditorMeta: {
    padding: "12px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  promptNameInput: {
    // Fluent Input feels tall in dialogs; tighten to match other fields in the app.
    minHeight: "34px",
  },
  aiImageEditorHeaderText: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    minWidth: 0,
  },
  aiImageEditorTextArea: {
    flex: "0 0 auto",
    minHeight: "520px",
    border: "none",
    borderRadius: 0,
    resize: "none",
    padding: "12px",
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: "hidden",
  },
  aiImageEditorHighlightedText: {
    margin: 0,
    padding: "12px",
    fontFamily: "monospace",
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  aiImageEditorActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "8px",
    padding: "12px",
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: "#fafafa",
  },
  revertButton: {
    backgroundColor: tokens.colorNeutralBackground1,
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground2,
    },
  },
  deleteButton: {
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorStatusDangerForeground1,
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground2,
    },
  },
  monoInline: {
    fontFamily: "monospace",
  },
});

const normalizeKeyword = (value: string) =>
  value.trim().toLowerCase();

const normalizeSearchQuery = (value: string) => value.trim().toLowerCase();

const splitForHighlight = (text: string, query: string) => {
  const q = normalizeSearchQuery(query);
  const t = String(text || "");
  if (!q) return [{ text: t, hit: false }];
  const lower = t.toLowerCase();
  const parts: Array<{ text: string; hit: boolean }> = [];
  let idx = 0;
  while (idx < t.length) {
    const next = lower.indexOf(q, idx);
    if (next === -1) {
      parts.push({ text: t.slice(idx), hit: false });
      break;
    }
    if (next > idx) {
      parts.push({ text: t.slice(idx, next), hit: false });
    }
    parts.push({ text: t.slice(next, next + q.length), hit: true });
    idx = next + q.length;
  }
  return parts;
};

const SETTINGS_TAB_VALUES = [
  "discovery",
  "user",
  "production",
  "zimage",
  "ai-image-edit",
  "uikit",
  "ui-audit",
  "shopify-syncer",
  "system",
] as const;

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
  const [zimageBaseUrl, setZimageBaseUrl] = useState("");
  const [zimageResolution, setZimageResolution] = useState("4k");
  const [zimageFormat, setZimageFormat] = useState("jpeg");
  const [zimageFinalSize, setZimageFinalSize] = useState("1000");
  const [zimageAutoCenter, setZimageAutoCenter] = useState(true);
  const [zimageCookie, setZimageCookie] = useState("");
  const [zimageApiKey, setZimageApiKey] = useState("");
  const [zimageCookieIsSet, setZimageCookieIsSet] = useState(false);
  const [zimageCookiePreview, setZimageCookiePreview] = useState("");
  const [zimageApiKeyIsSet, setZimageApiKeyIsSet] = useState(false);
  const [zimageApiKeyPreview, setZimageApiKeyPreview] = useState("");
  const [zimageLoading, setZimageLoading] = useState(false);
  const [zimageError, setZimageError] = useState<string | null>(null);
  const [zimageForbidden, setZimageForbidden] = useState(false);
  const [zimageSaving, setZimageSaving] = useState(false);
  const [zimageSaveError, setZimageSaveError] = useState<string | null>(null);
  const [zimageSaveSuccess, setZimageSaveSuccess] = useState(false);
  const [aiImageChatgptPrompt, setAiImageChatgptPrompt] = useState("");
  const [aiImageGeminiPrompt, setAiImageGeminiPrompt] = useState("");
  const [aiImageDigiDealMainPrompt, setAiImageDigiDealMainPrompt] = useState("");
  const [aiImageEnviormentScenePrompt, setAiImageEnviormentScenePrompt] = useState("");
  const [aiImageProductCollectionPrompt, setAiImageProductCollectionPrompt] =
    useState("");
  const [aiImageSelectedPrompt, setAiImageSelectedPrompt] =
    useState<AIImagePromptKey>("chatgpt");
  const [aiImagePromptSearch, setAiImagePromptSearch] = useState("");
  const [aiImageCustomPrompts, setAiImageCustomPrompts] = useState<
    AIImageEditCustomPrompt[]
  >([]);
  const [aiImageCustomOriginalById, setAiImageCustomOriginalById] = useState<
    Record<string, AIImageEditCustomPrompt>
  >({});
  const [aiImageVersions, setAiImageVersions] = useState<
    AIImageEditPromptVersion[]
  >([]);
  const [aiImageSelectedVersionId, setAiImageSelectedVersionId] = useState("");
  const [aiImageVersionsLoading, setAiImageVersionsLoading] = useState(false);
  const [aiImageVersionsError, setAiImageVersionsError] = useState<string | null>(
    null
  );
  const [aiImageMeta, setAiImageMeta] =
    useState<AIImageEditSettingsResponse["meta"] | null>(null);
  const [aiImageOriginal, setAiImageOriginal] = useState<AIImageEditSettings | null>(
    null
  );
  const [aiImageLoading, setAiImageLoading] = useState(false);
  const [aiImageError, setAiImageError] = useState<string | null>(null);
  const [aiImageForbidden, setAiImageForbidden] = useState(false);
  const [aiImageSaving, setAiImageSaving] = useState(false);
  const [aiImageSaveError, setAiImageSaveError] = useState<string | null>(null);
  const [aiImageSaveSuccess, setAiImageSaveSuccess] = useState(false);
  const [aiImageDeleteSaving, setAiImageDeleteSaving] = useState(false);
  const [aiImageDeleteError, setAiImageDeleteError] = useState<string | null>(
    null
  );
  const [aiImageDeleteSuccess, setAiImageDeleteSuccess] = useState(false);
  const [aiImageNewPromptOpen, setAiImageNewPromptOpen] = useState(false);
  const [aiImageNewPromptName, setAiImageNewPromptName] = useState("");
  const [aiImageNewPromptDescription, setAiImageNewPromptDescription] =
    useState("");
  const [aiImageNewPromptSeedText, setAiImageNewPromptSeedText] = useState("");
  const [aiImageNewPromptSaving, setAiImageNewPromptSaving] = useState(false);
  const [aiImageNewPromptError, setAiImageNewPromptError] = useState<string | null>(
    null
  );
  const [aiImageGuideOpen, setAiImageGuideOpen] = useState(false);
  const [aiImageGuideLoading, setAiImageGuideLoading] = useState(false);
  const [aiImageGuideError, setAiImageGuideError] = useState<string | null>(null);
  const [aiImageGuideContent, setAiImageGuideContent] = useState("");
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
  const aiImageEditorTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const applyTabFromLocation = () => {
      if (typeof window === "undefined") return;
      const params = new URLSearchParams(window.location.search);
      const tabFromQuery = String(params.get("tab") || "").trim();
      if (!tabFromQuery) return;
      if (!(SETTINGS_TAB_VALUES as readonly string[]).includes(tabFromQuery)) return;
      setActiveTab((current) => (current === tabFromQuery ? current : tabFromQuery));
    };
    applyTabFromLocation();
    window.addEventListener("popstate", applyTabFromLocation);
    return () => {
      window.removeEventListener("popstate", applyTabFromLocation);
    };
  }, []);

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

  const loadZImageSettings = useCallback(async () => {
    setZimageLoading(true);
    setZimageError(null);
    setZimageForbidden(false);
    try {
      const response = await fetch("/api/settings/zimage");
      if (response.status === 403 || response.status === 401) {
        setZimageForbidden(true);
        return;
      }
      if (!response.ok) {
        throw new Error(t("settings.zimage.error"));
      }
      const payload = (await response.json()) as ZImageSettings;
      setZimageBaseUrl(payload.base_url ?? "");
      setZimageResolution(payload.resolution ?? "4k");
      setZimageFormat(payload.format ?? "jpeg");
      setZimageFinalSize(String(payload.final_size ?? 1000));
      setZimageAutoCenter(Boolean(payload.auto_center));
      setZimageCookieIsSet(Boolean(payload.cookie?.is_set));
      setZimageCookiePreview(payload.cookie?.preview ?? "");
      setZimageApiKeyIsSet(Boolean(payload.api_key?.is_set));
      setZimageApiKeyPreview(payload.api_key?.preview ?? "");
      // Never hydrate secrets into the UI; user pastes new values when needed.
      setZimageCookie("");
      setZimageApiKey("");
    } catch (err) {
      setZimageError((err as Error).message);
    } finally {
      setZimageLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (activeTab !== "zimage") return;
    loadZImageSettings();
  }, [activeTab, loadZImageSettings]);

  const loadAiImageSettings = useCallback(async () => {
    setAiImageLoading(true);
    setAiImageError(null);
    setAiImageForbidden(false);
    try {
      const [builtResponse, promptsResponse] = await Promise.all([
        fetch("/api/settings/ai-image-edit"),
        fetch("/api/settings/ai-image-edit/prompts"),
      ]);

      if (
        builtResponse.status === 403 ||
        builtResponse.status === 401 ||
        promptsResponse.status === 403 ||
        promptsResponse.status === 401
      ) {
        setAiImageForbidden(true);
        return;
      }

      if (!builtResponse.ok) {
        throw new Error(t("settings.aiImage.error"));
      }
      if (!promptsResponse.ok) {
        throw new Error(t("settings.aiImage.error"));
      }

      const payload = (await builtResponse.json()) as AIImageEditSettingsResponse;
      const normalized: AIImageEditSettings = {
        chatgpt_prompt_template: payload.chatgpt_prompt_template ?? "",
        gemini_prompt_template: payload.gemini_prompt_template ?? "",
        digideal_main_prompt_template: payload.digideal_main_prompt_template ?? "",
        enviorment_scene_image_prompt_template:
          payload.enviorment_scene_image_prompt_template ?? "",
        product_collection_image_prompt_template:
          payload.product_collection_image_prompt_template ?? "",
      };
      setAiImageChatgptPrompt(normalized.chatgpt_prompt_template);
      setAiImageGeminiPrompt(normalized.gemini_prompt_template);
      setAiImageDigiDealMainPrompt(normalized.digideal_main_prompt_template);
      setAiImageEnviormentScenePrompt(normalized.enviorment_scene_image_prompt_template);
      setAiImageProductCollectionPrompt(
        normalized.product_collection_image_prompt_template
      );
      setAiImageMeta(payload.meta ?? null);
      setAiImageOriginal(normalized);

      const promptsPayload = (await promptsResponse.json()) as
        | { prompts?: AIImageEditCustomPrompt[] }
        | AIImageEditCustomPrompt[];
      const prompts = Array.isArray(promptsPayload)
        ? promptsPayload
        : Array.isArray(promptsPayload?.prompts)
          ? promptsPayload.prompts
          : [];

      setAiImageCustomPrompts(prompts);
      const originalById: Record<string, AIImageEditCustomPrompt> = {};
      for (const prompt of prompts) {
        if (!prompt?.prompt_id) continue;
        originalById[prompt.prompt_id] = {
          ...prompt,
          template_text: String(prompt.template_text ?? ""),
        };
      }
      setAiImageCustomOriginalById(originalById);
      setAiImageSelectedPrompt((prev) => {
        if (!String(prev).startsWith("custom:")) return prev;
        const promptId = String(prev).slice("custom:".length);
        const exists = prompts.some((p) => p.prompt_id === promptId);
        return exists ? prev : ("chatgpt" as AIImagePromptKey);
      });
    } catch (err) {
      setAiImageError((err as Error).message);
    } finally {
      setAiImageLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (activeTab !== "ai-image-edit") return;
    loadAiImageSettings();
  }, [activeTab, loadAiImageSettings]);

  const loadAiImageVersions = useCallback(
    async (promptId: string) => {
      const id = String(promptId || "").trim();
      if (!id) {
        setAiImageVersions([]);
        setAiImageSelectedVersionId("");
        return;
      }
      setAiImageVersionsLoading(true);
      setAiImageVersionsError(null);
      try {
        const response = await fetch(
          `/api/settings/ai-image-edit/versions?prompt_id=${encodeURIComponent(id)}`
        );
        if (response.status === 403 || response.status === 401) {
          setAiImageForbidden(true);
          return;
        }
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || t("settings.aiImage.error"));
        }
        const payload = (await response.json()) as {
          versions?: AIImageEditPromptVersion[];
        };
        const versions = Array.isArray(payload?.versions) ? payload.versions : [];
        setAiImageVersions(versions);
        setAiImageSelectedVersionId(versions[0]?.id ? String(versions[0].id) : "");
      } catch (err) {
        setAiImageVersionsError((err as Error).message);
        setAiImageVersions([]);
        setAiImageSelectedVersionId("");
      } finally {
        setAiImageVersionsLoading(false);
      }
    },
    [t]
  );

  const loadAiImageGuide = useCallback(async () => {
    setAiImageGuideLoading(true);
    setAiImageGuideError(null);
    try {
      const response = await fetch("/api/settings/ai-image-edit/guide");
      if (response.status === 403 || response.status === 401) {
        throw new Error(t("settings.aiImage.forbidden"));
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || t("settings.aiImage.error"));
      }
      const payload = (await response.json()) as { content?: string };
      setAiImageGuideContent(String(payload?.content ?? ""));
    } catch (err) {
      setAiImageGuideError((err as Error).message);
      setAiImageGuideContent("");
    } finally {
      setAiImageGuideLoading(false);
    }
  }, [t]);

  const handleZImageSave = async () => {
    setZimageSaving(true);
    setZimageSaveError(null);
    setZimageSaveSuccess(false);
    try {
      const body: Record<string, unknown> = {
        base_url: zimageBaseUrl,
        resolution: zimageResolution,
        format: zimageFormat,
        final_size: Number(zimageFinalSize),
        auto_center: zimageAutoCenter,
      };
      if (zimageCookie.trim()) {
        body.cookie = zimageCookie.trim();
      }
      if (zimageApiKey.trim()) {
        body.api_key = zimageApiKey.trim();
      }

      const response = await fetch("/api/settings/zimage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || t("settings.zimage.saveError"));
      }
      const payload = (await response.json()) as ZImageSettings;
      setZimageBaseUrl(payload.base_url ?? "");
      setZimageResolution(payload.resolution ?? "4k");
      setZimageFormat(payload.format ?? "jpeg");
      setZimageFinalSize(String(payload.final_size ?? 1000));
      setZimageAutoCenter(Boolean(payload.auto_center));
      setZimageCookieIsSet(Boolean(payload.cookie?.is_set));
      setZimageCookiePreview(payload.cookie?.preview ?? "");
      setZimageApiKeyIsSet(Boolean(payload.api_key?.is_set));
      setZimageApiKeyPreview(payload.api_key?.preview ?? "");
      setZimageCookie("");
      setZimageApiKey("");
      setZimageSaveSuccess(true);
      setTimeout(() => setZimageSaveSuccess(false), 2500);
    } catch (err) {
      setZimageSaveError((err as Error).message);
    } finally {
      setZimageSaving(false);
    }
  };

  const handleAiImageSave = async (overrideText?: string) => {
    setAiImageSaving(true);
    setAiImageSaveError(null);
    setAiImageSaveSuccess(false);
    try {
      const selectedKey = String(aiImageSelectedPrompt);
      const textOverride =
        typeof overrideText === "string" ? overrideText : undefined;
      const promptIdForVersions = selectedKey.startsWith("custom:")
        ? selectedKey.slice("custom:".length)
        : selectedKey === "gemini"
          ? "GEMIMGED"
          : selectedKey === "digideal_main"
            ? "DDMAINIM"
            : selectedKey === "enviorment_scene"
              ? "ENVSCNIM"
              : selectedKey === "product_collection"
                ? "PRDCOL01"
              : "OAIIMGED";
      if (selectedKey.startsWith("custom:")) {
        const promptId = selectedKey.slice("custom:".length);
        const prompt = aiImageCustomPrompts.find((p) => p.prompt_id === promptId);
        const original = aiImageCustomOriginalById[promptId];
        const templateText = String(textOverride ?? prompt?.template_text ?? "");
        const updates: Record<string, unknown> = {
          name: String(prompt?.name ?? "").trim() || promptId,
          usage: String(prompt?.usage ?? ""),
          description: String(prompt?.description ?? ""),
          address: String(prompt?.address ?? ""),
        };

        if (
          typeof textOverride === "string" ||
          templateText !== String(original?.template_text ?? "")
        ) {
          updates.template_text = templateText;
        }
        const response = await fetch(
          `/api/settings/ai-image-edit/prompts/${encodeURIComponent(promptId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updates),
          }
        );
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || t("settings.aiImage.saveError"));
        }
        const saved = (await response.json()) as AIImageEditCustomPrompt;
        setAiImageCustomPrompts((prev) =>
          prev.map((item) => (item.prompt_id === promptId ? saved : item))
        );
        setAiImageCustomOriginalById((prev) => ({
          ...prev,
          [promptId]: {
            ...saved,
            template_text: String(saved?.template_text ?? ""),
          },
        }));
      } else {
        const body: Record<string, string> = {};
        if (selectedKey === "chatgpt") {
          body.chatgpt_prompt_template = String(textOverride ?? aiImageChatgptPrompt);
        } else if (selectedKey === "gemini") {
          body.gemini_prompt_template = String(textOverride ?? aiImageGeminiPrompt);
        } else if (selectedKey === "digideal_main") {
          body.digideal_main_prompt_template = String(
            textOverride ?? aiImageDigiDealMainPrompt
          );
        } else if (selectedKey === "enviorment_scene") {
          body.enviorment_scene_image_prompt_template = String(
            textOverride ?? aiImageEnviormentScenePrompt
          );
        } else if (selectedKey === "product_collection") {
          body.product_collection_image_prompt_template = String(
            textOverride ?? aiImageProductCollectionPrompt
          );
        }

        const response = await fetch("/api/settings/ai-image-edit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || t("settings.aiImage.saveError"));
        }
        const payload = (await response.json()) as AIImageEditSettingsResponse;
        const normalized: AIImageEditSettings = {
          chatgpt_prompt_template: payload.chatgpt_prompt_template ?? "",
          gemini_prompt_template: payload.gemini_prompt_template ?? "",
          digideal_main_prompt_template: payload.digideal_main_prompt_template ?? "",
          enviorment_scene_image_prompt_template:
            payload.enviorment_scene_image_prompt_template ?? "",
          product_collection_image_prompt_template:
            payload.product_collection_image_prompt_template ?? "",
        };

        // Keep unsaved edits for non-selected prompts intact.
        if (selectedKey === "chatgpt") {
          setAiImageChatgptPrompt(normalized.chatgpt_prompt_template);
        } else if (selectedKey === "gemini") {
          setAiImageGeminiPrompt(normalized.gemini_prompt_template);
        } else if (selectedKey === "digideal_main") {
          setAiImageDigiDealMainPrompt(normalized.digideal_main_prompt_template);
        } else if (selectedKey === "enviorment_scene") {
          setAiImageEnviormentScenePrompt(
            normalized.enviorment_scene_image_prompt_template
          );
        } else if (selectedKey === "product_collection") {
          setAiImageProductCollectionPrompt(
            normalized.product_collection_image_prompt_template
          );
        }

        setAiImageMeta(payload.meta ?? null);
        setAiImageOriginal(normalized);
      }
      await loadAiImageVersions(promptIdForVersions);
      setAiImageSaveSuccess(true);
      setTimeout(() => setAiImageSaveSuccess(false), 2500);
    } catch (err) {
      setAiImageSaveError((err as Error).message);
    } finally {
      setAiImageSaving(false);
    }
  };

  const handleAiImageCreatePrompt = async () => {
    const name = aiImageNewPromptName.trim();
    if (!name) return;
    setAiImageNewPromptSaving(true);
    setAiImageNewPromptError(null);
    try {
      const response = await fetch("/api/settings/ai-image-edit/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: aiImageNewPromptDescription.trim() || null,
          template_text: aiImageNewPromptSeedText,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || t("settings.aiImage.saveError"));
      }
      const created = (await response.json()) as AIImageEditCustomPrompt;
      if (!created?.prompt_id) {
        throw new Error(t("settings.aiImage.saveError"));
      }
      setAiImageCustomPrompts((prev) => [created, ...prev]);
      setAiImageCustomOriginalById((prev) => ({
        ...prev,
        [created.prompt_id]: {
          ...created,
          template_text: String(created.template_text ?? ""),
        },
      }));
      setAiImageSelectedPrompt(
        `custom:${created.prompt_id}` as AIImagePromptKey
      );
      setAiImageNewPromptOpen(false);
      setAiImageNewPromptName("");
      setAiImageNewPromptDescription("");
      setAiImageNewPromptSeedText("");
    } catch (err) {
      setAiImageNewPromptError((err as Error).message);
    } finally {
      setAiImageNewPromptSaving(false);
    }
  };

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

  const aiImagePromptItems = useMemo(() => {
    const meta = aiImageMeta ?? {};
    const builtIns = [
      {
        key: "chatgpt" as const,
        promptId: "OAIIMGED",
        title: t("settings.aiImage.chatgptPrompt"),
        usage: "OpenAI image edit",
        description:
          "Controls the default prompt used by the ChatGPT image-edit worker.",
        updatedAt: meta.chatgpt_prompt_template?.updated_at ?? null,
      },
      {
        key: "gemini" as const,
        promptId: "GEMIMGED",
        title: t("settings.aiImage.geminiPrompt"),
        usage: "Gemini image edit",
        description:
          "Controls the default prompt used by the Gemini image-edit worker.",
        updatedAt: meta.gemini_prompt_template?.updated_at ?? null,
      },
      {
        key: "digideal_main" as const,
        promptId: "DDMAINIM",
        title: t("settings.aiImage.digidealMainPrompt"),
        usage: "DigiDeal main image analysis",
        description: "Used when generating the DigiDeal main image prompt payload.",
        updatedAt: meta.digideal_main_prompt_template?.updated_at ?? null,
      },
      {
        key: "enviorment_scene" as const,
        promptId: "ENVSCNIM",
        title: t("settings.aiImage.enviormentScenePrompt"),
        usage: "Environment scene analysis",
        description: "Used when generating the environment scene prompt payload.",
        updatedAt: meta.enviorment_scene_image_prompt_template?.updated_at ?? null,
      },
      {
        key: "product_collection" as const,
        promptId: "PRDCOL01",
        title: "Product Collection Prompt",
        usage: "Product collection image composition",
        description:
          "Used when combining 2-4 selected product images into one clean collection output.",
        updatedAt: meta.product_collection_image_prompt_template?.updated_at ?? null,
      },
    ];

    const custom = aiImageCustomPrompts
      .filter((prompt) => Boolean(prompt?.prompt_id))
      .map((prompt) => {
        const key = `custom:${prompt.prompt_id}` as AIImagePromptKey;
        return {
          key,
          promptId: prompt.prompt_id,
          title: prompt.name || prompt.prompt_id,
          usage: prompt.usage || "Custom prompt",
          description: prompt.description || "Custom prompt template.",
          updatedAt: prompt.updated_at ?? null,
        };
      });

    return [...builtIns, ...custom];
  }, [aiImageMeta, aiImageCustomPrompts, t]);

  const filteredAiImagePromptItems = useMemo(() => {
    const q = normalizeSearchQuery(aiImagePromptSearch);
    if (!q) return aiImagePromptItems;

    const currentValueForKey = (key: string) => {
      if (key.startsWith("custom:")) {
        const promptId = key.slice("custom:".length);
        const prompt = aiImageCustomPrompts.find((p) => p.prompt_id === promptId);
        return String(prompt?.template_text ?? "");
      }
      if (key === "gemini") return aiImageGeminiPrompt;
      if (key === "digideal_main") return aiImageDigiDealMainPrompt;
      if (key === "enviorment_scene") return aiImageEnviormentScenePrompt;
      if (key === "product_collection") return aiImageProductCollectionPrompt;
      return aiImageChatgptPrompt;
    };

    return aiImagePromptItems.filter((item) => {
      const key = String(item.key);
      const currentValue = currentValueForKey(key);
      const address =
        key.startsWith("custom:")
          ? String(
              aiImageCustomPrompts.find(
                (p) => p.prompt_id === key.slice("custom:".length)
              )?.address ?? ""
            )
          : "";
      const haystack = [
        item.title,
        item.usage,
        item.description,
        address,
        item.promptId,
        currentValue,
      ]
        .filter(Boolean)
        .join("\n")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [
    aiImagePromptItems,
    aiImagePromptSearch,
    aiImageCustomPrompts,
    aiImageChatgptPrompt,
    aiImageGeminiPrompt,
    aiImageDigiDealMainPrompt,
    aiImageEnviormentScenePrompt,
    aiImageProductCollectionPrompt,
  ]);

  const selectedAiPrompt =
    aiImagePromptItems.find((item) => item.key === aiImageSelectedPrompt) ??
    aiImagePromptItems[0];

  const selectedCustomPrompt = useMemo(() => {
    const selectedKey = String(aiImageSelectedPrompt);
    if (!selectedKey.startsWith("custom:")) return null;
    const promptId = selectedKey.slice("custom:".length);
    return (
      aiImageCustomPrompts.find((prompt) => prompt.prompt_id === promptId) ?? null
    );
  }, [aiImageSelectedPrompt, aiImageCustomPrompts]);

  const updateSelectedCustomPrompt = useCallback(
    (patch: Partial<AIImageEditCustomPrompt>) => {
      const selectedKey = String(aiImageSelectedPrompt);
      if (!selectedKey.startsWith("custom:")) return;
      const promptId = selectedKey.slice("custom:".length);
      if (!promptId) return;
      setAiImageCustomPrompts((prev) =>
        prev.map((item) =>
          item.prompt_id === promptId ? { ...item, ...patch } : item
        )
      );
    },
    [aiImageSelectedPrompt]
  );

  useEffect(() => {
    if (activeTab !== "ai-image-edit") return;
    if (aiImageForbidden) return;
    if (!selectedAiPrompt?.promptId) return;
    loadAiImageVersions(String(selectedAiPrompt.promptId));
  }, [
    activeTab,
    aiImageForbidden,
    loadAiImageVersions,
    selectedAiPrompt?.promptId,
  ]);

  const latestAiImageVersionId = aiImageVersions[0]?.id
    ? String(aiImageVersions[0].id)
    : "";
  const isViewingLatestAiImageVersion =
    !latestAiImageVersionId || aiImageSelectedVersionId === latestAiImageVersionId;
  const selectedAiImageVersion = aiImageVersions.find(
    (version) => String(version.id) === aiImageSelectedVersionId
  );
  const selectedAiImageVersionLabel = selectedAiImageVersion?.created_at
    ? formatDateTime(selectedAiImageVersion.created_at)
    : aiImageVersions[0]?.created_at
      ? formatDateTime(aiImageVersions[0].created_at)
      : "-";

  const selectedAiPromptValue = useMemo(() => {
    const selectedKey = String(aiImageSelectedPrompt);
    if (selectedKey.startsWith("custom:")) {
      const promptId = selectedKey.slice("custom:".length);
      const prompt = aiImageCustomPrompts.find((p) => p.prompt_id === promptId);
      return String(prompt?.template_text ?? "");
    }
    switch (aiImageSelectedPrompt) {
      case "gemini":
        return aiImageGeminiPrompt;
      case "digideal_main":
        return aiImageDigiDealMainPrompt;
      case "enviorment_scene":
        return aiImageEnviormentScenePrompt;
      case "product_collection":
        return aiImageProductCollectionPrompt;
      case "chatgpt":
      default:
        return aiImageChatgptPrompt;
    }
  }, [
    aiImageSelectedPrompt,
    aiImageChatgptPrompt,
    aiImageGeminiPrompt,
    aiImageDigiDealMainPrompt,
    aiImageEnviormentScenePrompt,
    aiImageProductCollectionPrompt,
    aiImageCustomPrompts,
  ]);

  const highlightedAiPromptParts = useMemo(() => {
    const query = aiImagePromptSearch;
    if (!query) return [{ text: selectedAiPromptValue, hit: false }];
    return splitForHighlight(selectedAiPromptValue, query);
  }, [aiImagePromptSearch, selectedAiPromptValue]);

  useEffect(() => {
    if (activeTab !== "ai-image-edit") return;
    if (aiImageForbidden) return;
    if (aiImagePromptSearch.trim()) return;
    const el = aiImageEditorTextareaRef.current;
    if (!el) return;
    // Auto-grow textarea so the page scrolls instead of the editor having its own scrollbar.
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [
    activeTab,
    aiImageForbidden,
    aiImagePromptSearch,
    aiImageSelectedPrompt,
    selectedAiPromptValue,
  ]);

  const selectedAiPromptOriginalValue = useMemo(() => {
    const selectedKey = String(aiImageSelectedPrompt);
    if (selectedKey.startsWith("custom:")) {
      const promptId = selectedKey.slice("custom:".length);
      const original = aiImageCustomOriginalById[promptId];
      return String(original?.template_text ?? "");
    }
    if (!aiImageOriginal) return "";
    switch (aiImageSelectedPrompt) {
      case "gemini":
        return aiImageOriginal.gemini_prompt_template ?? "";
      case "digideal_main":
        return aiImageOriginal.digideal_main_prompt_template ?? "";
      case "enviorment_scene":
        return aiImageOriginal.enviorment_scene_image_prompt_template ?? "";
      case "product_collection":
        return aiImageOriginal.product_collection_image_prompt_template ?? "";
      case "chatgpt":
      default:
        return aiImageOriginal.chatgpt_prompt_template ?? "";
    }
  }, [aiImageOriginal, aiImageSelectedPrompt, aiImageCustomOriginalById]);

  const selectedAiPromptIsDirty = useMemo(() => {
    const selectedKey = String(aiImageSelectedPrompt);
    if (selectedKey.startsWith("custom:")) {
      const promptId = selectedKey.slice("custom:".length);
      const current = aiImageCustomPrompts.find((p) => p.prompt_id === promptId);
      const original = aiImageCustomOriginalById[promptId];
      return (
        String(current?.template_text ?? "") !== String(original?.template_text ?? "") ||
        String(current?.name ?? "") !== String(original?.name ?? "") ||
        String(current?.usage ?? "") !== String(original?.usage ?? "") ||
        String(current?.description ?? "") !== String(original?.description ?? "") ||
        String(current?.address ?? "") !== String(original?.address ?? "")
      );
    }
    return selectedAiPromptValue !== selectedAiPromptOriginalValue;
  }, [
    aiImageSelectedPrompt,
    aiImageCustomPrompts,
    aiImageCustomOriginalById,
    selectedAiPromptOriginalValue,
    selectedAiPromptValue,
  ]);

  const updateSelectedAiPromptValue = (nextValue: string) => {
    const selectedKey = String(aiImageSelectedPrompt);
    if (selectedKey.startsWith("custom:")) {
      const promptId = selectedKey.slice("custom:".length);
      setAiImageCustomPrompts((prev) =>
        prev.map((item) =>
          item.prompt_id === promptId
            ? { ...item, template_text: nextValue }
            : item
        )
      );
      return;
    }
    switch (aiImageSelectedPrompt) {
      case "gemini":
        setAiImageGeminiPrompt(nextValue);
        break;
      case "digideal_main":
        setAiImageDigiDealMainPrompt(nextValue);
        break;
      case "enviorment_scene":
        setAiImageEnviormentScenePrompt(nextValue);
        break;
      case "product_collection":
        setAiImageProductCollectionPrompt(nextValue);
        break;
      case "chatgpt":
      default:
        setAiImageChatgptPrompt(nextValue);
        break;
    }
  };

  const revertSelectedAiPrompt = async () => {
    // If the user is viewing an older saved version, "Revert" means restore that
    // version as the latest saved template (i.e. a rollback).
    if (!isViewingLatestAiImageVersion && selectedAiImageVersion) {
      await handleAiImageSave(String(selectedAiImageVersion.template_text ?? ""));
      return;
    }

    const selectedKey = String(aiImageSelectedPrompt);
    if (selectedKey.startsWith("custom:")) {
      const promptId = selectedKey.slice("custom:".length);
      const original = aiImageCustomOriginalById[promptId];
      if (!original) return;
      setAiImageCustomPrompts((prev) =>
        prev.map((item) =>
          item.prompt_id === promptId
            ? { ...item, ...original }
            : item
        )
      );
      return;
    }

    if (!aiImageOriginal) return;
    switch (aiImageSelectedPrompt) {
      case "gemini":
        setAiImageGeminiPrompt(aiImageOriginal.gemini_prompt_template ?? "");
        break;
      case "digideal_main":
        setAiImageDigiDealMainPrompt(
          aiImageOriginal.digideal_main_prompt_template ?? ""
        );
        break;
      case "enviorment_scene":
        setAiImageEnviormentScenePrompt(
          aiImageOriginal.enviorment_scene_image_prompt_template ?? ""
        );
        break;
      case "product_collection":
        setAiImageProductCollectionPrompt(
          aiImageOriginal.product_collection_image_prompt_template ?? ""
        );
        break;
      case "chatgpt":
      default:
        setAiImageChatgptPrompt(aiImageOriginal.chatgpt_prompt_template ?? "");
        break;
    }
  };

  const handleAiImageDeletePrompt = async () => {
    const selectedKey = String(aiImageSelectedPrompt);
    if (!selectedKey.startsWith("custom:")) return;
    const promptId = selectedKey.slice("custom:".length);
    if (!promptId) return;

    const ok = window.confirm(
      t("settings.aiImage.prompts.deleteConfirm", { promptId })
    );
    if (!ok) return;

    setAiImageDeleteSaving(true);
    setAiImageDeleteError(null);
    setAiImageDeleteSuccess(false);
    try {
      const response = await fetch(
        `/api/settings/ai-image-edit/prompts/${encodeURIComponent(promptId)}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || t("settings.aiImage.saveError"));
      }
      setAiImageCustomPrompts((prev) =>
        prev.filter((item) => item.prompt_id !== promptId)
      );
      setAiImageCustomOriginalById((prev) => {
        const next = { ...prev };
        delete next[promptId];
        return next;
      });
      setAiImageSelectedPrompt("chatgpt");
      setAiImageVersions([]);
      setAiImageSelectedVersionId("");
      setAiImageDeleteSuccess(true);
      setTimeout(() => setAiImageDeleteSuccess(false), 2500);
    } catch (err) {
      setAiImageDeleteError((err as Error).message);
    } finally {
      setAiImageDeleteSaving(false);
    }
  };

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
          <Tab value="zimage">{t("settings.zimage.tab")}</Tab>
          <Tab value="ai-image-edit">{t("settings.aiImage.tab")}</Tab>
          <Tab value="uikit">{t("settings.uikit.tab")}</Tab>
          <Tab value="ui-audit">UI Audit</Tab>
          <Tab value="shopify-syncer">Shopify Syncer</Tab>
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

      {activeTab === "zimage" ? (
        <div className={styles.sectionGrid}>
          <Card className={styles.card}>
            <div className={styles.systemHeader}>
              <Text weight="semibold">{t("settings.zimage.title")}</Text>
              <Button
                appearance="subtle"
                onClick={loadZImageSettings}
                disabled={zimageLoading}
              >
                {t("settings.zimage.refresh")}
              </Button>
            </div>
            <Text size={200} className={styles.helperText}>
              {t("settings.zimage.helper")}
            </Text>

            {zimageForbidden ? (
              <MessageBar>{t("settings.zimage.forbidden")}</MessageBar>
            ) : zimageError ? (
              <MessageBar>{zimageError}</MessageBar>
            ) : null}

            {zimageSaveError ? <MessageBar>{zimageSaveError}</MessageBar> : null}
            {zimageSaveSuccess ? (
              <MessageBar>{t("settings.zimage.saveSuccess")}</MessageBar>
            ) : null}

            {zimageLoading ? (
              <Spinner label={t("settings.zimage.loading")} />
            ) : (
              <>
                <Field label={t("settings.zimage.baseUrl")}>
                  <Input
                    value={zimageBaseUrl}
                    onChange={(_, data) => setZimageBaseUrl(data.value)}
                    placeholder="https://z-image.ai"
                    disabled={zimageForbidden}
                  />
                </Field>

                <Field label={t("settings.zimage.resolution")}>
                  <Dropdown
                    value={zimageResolution}
                    selectedOptions={[zimageResolution]}
                    onOptionSelect={(_, data) =>
                      setZimageResolution(String(data.optionValue))
                    }
                    disabled={zimageForbidden}
                  >
                    <Option value="2k">2k</Option>
                    <Option value="4k">4k</Option>
                    <Option value="8k">8k</Option>
                  </Dropdown>
                </Field>

                <Field label={t("settings.zimage.format")}>
                  <Dropdown
                    value={zimageFormat}
                    selectedOptions={[zimageFormat]}
                    onOptionSelect={(_, data) =>
                      setZimageFormat(String(data.optionValue))
                    }
                    disabled={zimageForbidden}
                  >
                    <Option value="jpeg">jpeg</Option>
                    <Option value="png">png</Option>
                    <Option value="webp">webp</Option>
                  </Dropdown>
                </Field>

                <Field label={t("settings.zimage.finalSize")}>
                  <Input
                    type="number"
                    value={zimageFinalSize}
                    onChange={(_, data) => setZimageFinalSize(data.value)}
                    disabled={zimageForbidden}
                  />
                </Field>

                <Checkbox
                  checked={zimageAutoCenter}
                  onChange={(_, data) => setZimageAutoCenter(Boolean(data.checked))}
                  label={t("settings.zimage.autoCenter")}
                  disabled={zimageForbidden}
                />

                <Field label={t("settings.zimage.cookie")}>
                  <Input
                    type="password"
                    value={zimageCookie}
                    onChange={(_, data) => setZimageCookie(data.value)}
                    placeholder={t("settings.zimage.cookie.placeholder")}
                    disabled={zimageForbidden}
                  />
                </Field>
                <Text size={200} className={styles.helperText}>
                  {zimageCookieIsSet
                    ? t("settings.zimage.cookie.currentSet", {
                        preview: zimageCookiePreview || "********",
                      })
                    : t("settings.zimage.cookie.currentMissing")}
                </Text>

                <Field label={t("settings.zimage.apiKey")}>
                  <Input
                    type="password"
                    value={zimageApiKey}
                    onChange={(_, data) => setZimageApiKey(data.value)}
                    placeholder={t("settings.zimage.apiKey.placeholder")}
                    disabled={zimageForbidden}
                  />
                </Field>
                <Text size={200} className={styles.helperText}>
                  {zimageApiKeyIsSet
                    ? t("settings.zimage.apiKey.currentSet", {
                        preview: zimageApiKeyPreview || "********",
                      })
                    : t("settings.zimage.apiKey.currentMissing")}
                </Text>

                <div className={styles.saveRow}>
                  <Button
                    appearance="primary"
                    onClick={handleZImageSave}
                    disabled={zimageSaving || zimageForbidden}
                  >
                    {zimageSaving ? t("settings.zimage.saving") : t("common.save")}
                  </Button>
                </div>
              </>
            )}
          </Card>

        </div>
      ) : null}

      {activeTab === "ai-image-edit" ? (
        <div className={styles.sectionGrid}>
          <Card className={styles.card}>
            <div className={styles.systemHeader}>
              <div className={styles.sectionTitleBlock}>
                <Text weight="semibold">{t("settings.aiImage.title")}</Text>
                <Text
                  size={200}
                  className={mergeClasses(styles.helperText, styles.sectionSubtitle)}
                >
                  {t("settings.aiImage.helper")}
                </Text>
              </div>
              <Button
                appearance="subtle"
                onClick={loadAiImageSettings}
                disabled={aiImageLoading}
              >
                {t("settings.aiImage.refresh")}
              </Button>
            </div>

            {aiImageForbidden ? (
              <MessageBar>{t("settings.aiImage.forbidden")}</MessageBar>
            ) : aiImageError ? (
              <MessageBar>{aiImageError}</MessageBar>
            ) : null}

            {aiImageSaveError ? <MessageBar>{aiImageSaveError}</MessageBar> : null}
            {aiImageDeleteError ? <MessageBar>{aiImageDeleteError}</MessageBar> : null}
            {aiImageVersionsError ? (
              <MessageBar>{aiImageVersionsError}</MessageBar>
            ) : null}
            {aiImageSaveSuccess ? (
              <MessageBar>{t("settings.aiImage.saveSuccess")}</MessageBar>
            ) : null}
            {aiImageDeleteSuccess ? (
              <MessageBar>{t("settings.aiImage.prompts.deleteSuccess")}</MessageBar>
            ) : null}

            {aiImageLoading ? (
              <Spinner label={t("settings.aiImage.loading")} />
            ) : (
              <>
                <div className={styles.aiImageGrid}>
                  <div className={styles.aiImageSidebar}>
                    <div className={styles.aiImageSidebarHeader}>
                      <div className={styles.aiImageSidebarHeaderRow}>
                        <Text weight="semibold">
                          {t("settings.aiImage.prompts.title")}
                        </Text>
                        <Button
                          appearance="subtle"
                          size="small"
                          onClick={() => {
                            setAiImageGuideOpen(true);
                            void loadAiImageGuide();
                          }}
                          disabled={aiImageForbidden}
                        >
                          {t("settings.aiImage.prompts.guideButton")}
                        </Button>
                      </div>
                      <div className={styles.aiImageSidebarSearch}>
                        <Input
                          value={aiImagePromptSearch}
                          onChange={(_, data) => setAiImagePromptSearch(data.value)}
                          placeholder={t("settings.aiImage.prompts.searchPlaceholder")}
                          disabled={aiImageForbidden}
                          className={styles.fullWidthControl}
                          size="small"
                        />
                      </div>
                    </div>
                    <div className={styles.aiImagePromptList}>
                      {filteredAiImagePromptItems.map((item) => {
                        const updated = item.updatedAt
                          ? formatDateTime(item.updatedAt)
                          : "";
                        const updatedLabel = updated || "-";
                        const active = item.key === aiImageSelectedPrompt;
                        const query = aiImagePromptSearch;
                        return (
                          <button
                            key={item.key}
                            type="button"
                            className={mergeClasses(
                              styles.aiImagePromptItem,
                              active ? styles.aiImagePromptItemActive : undefined
                            )}
                            onClick={() => setAiImageSelectedPrompt(item.key)}
                          >
                            <div className={styles.aiImagePromptTopRow}>
                              <Text weight="semibold">
                                {splitForHighlight(item.title, query).map(
                                  (part, idx) =>
                                    part.hit ? (
                                      <span
                                        key={`${idx}-${part.text}`}
                                        className={styles.highlight}
                                      >
                                        {part.text}
                                      </span>
                                    ) : (
                                      <span key={`${idx}-${part.text}`}>
                                        {part.text}
                                      </span>
                                    )
                                )}
                              </Text>
                              <span className={styles.aiImagePromptUpdated}>
                                {updatedLabel}
                              </span>
                            </div>
                            <div className={styles.aiImagePromptUsage}>
                              {splitForHighlight(item.usage, query).map(
                                (part, idx) =>
                                  part.hit ? (
                                    <span
                                      key={`${idx}-${part.text}`}
                                      className={styles.highlight}
                                    >
                                      {part.text}
                                    </span>
                                  ) : (
                                    <span key={`${idx}-${part.text}`}>
                                      {part.text}
                                    </span>
                                  )
                              )}
                            </div>
                            <div className={styles.aiImagePromptDescription}>
                              {splitForHighlight(item.description, query).map(
                                (part, idx) =>
                                  part.hit ? (
                                    <span
                                      key={`${idx}-${part.text}`}
                                      className={styles.highlight}
                                    >
                                      {part.text}
                                    </span>
                                  ) : (
                                    <span key={`${idx}-${part.text}`}>
                                      {part.text}
                                    </span>
                                  )
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <div className={styles.aiImageSidebarFooter}>
                      <Button
                        appearance="primary"
                        size="small"
                        onClick={() => {
                          setAiImageNewPromptName("");
                          setAiImageNewPromptDescription("");
                          setAiImageNewPromptSeedText("");
                          setAiImageNewPromptError(null);
                          setAiImageNewPromptOpen(true);
                        }}
                        disabled={aiImageForbidden}
                      >
                        {t("common.addNew")}
                      </Button>
                    </div>
                  </div>

                  <div className={styles.aiImageEditor}>
                    <div className={styles.aiImageEditorHeader}>
                      <div className={styles.aiImageEditorHeaderText}>
                        <Text weight="semibold">{selectedAiPrompt.title}</Text>
                        <Text size={200} className={styles.helperText}>
                          {selectedAiPrompt.usage}
                        </Text>
                        <Text size={200} className={styles.helperText}>
                          {t("settings.aiImage.prompts.promptId")}:{" "}
                          <span className={styles.monoInline}>
                            {splitForHighlight(
                              String(selectedAiPrompt.promptId || ""),
                              aiImagePromptSearch
                            ).map((part, idx) =>
                              part.hit ? (
                                <span
                                  key={`${idx}-${part.text}`}
                                  className={styles.highlight}
                                >
                                  {part.text}
                                </span>
                              ) : (
                                <span key={`${idx}-${part.text}`}>{part.text}</span>
                              )
                            )}
                          </span>
                        </Text>
                      </div>
                      <div className={styles.aiImageEditorHeaderControls}>
                        <Field label={t("settings.aiImage.prompts.versionLabel")}>
                          <Dropdown
                            value={selectedAiImageVersionLabel}
                            selectedOptions={
                              aiImageSelectedVersionId
                                ? [aiImageSelectedVersionId]
                                : []
                            }
                            onOptionSelect={(_, data) => {
                              const nextId = String(data.optionValue || "");
                              setAiImageSelectedVersionId(nextId);
                              const version = aiImageVersions.find(
                                (item) => String(item.id) === nextId
                              );
                              if (version) {
                                updateSelectedAiPromptValue(
                                  String(version.template_text ?? "")
                                );
                              }
                            }}
                            disabled={
                              aiImageForbidden ||
                              aiImageVersionsLoading ||
                              aiImageVersions.length === 0
                            }
                          >
                            {aiImageVersions.map((version) => (
                              <Option
                                key={version.id}
                                value={String(version.id)}
                              >
                                {formatDateTime(version.created_at)}
                              </Option>
                            ))}
                          </Dropdown>
                        </Field>
                      </div>
                  </div>

                    {selectedCustomPrompt ? (
                      <div className={styles.aiImageEditorMeta}>
                        <Field label={t("settings.aiImage.prompts.nameLabel")}>
                          <Input
                            value={String(selectedCustomPrompt.name ?? "")}
                            onChange={(_, data) =>
                              updateSelectedCustomPrompt({ name: data.value })
                            }
                            disabled={aiImageForbidden || aiImageSaving}
                            className={mergeClasses(
                              styles.fullWidthControl,
                              styles.promptNameInput
                            )}
                            size="small"
                          />
                        </Field>
                        <Field label={t("settings.aiImage.prompts.categoryLabel")}>
                          <Input
                            value={String(selectedCustomPrompt.usage ?? "")}
                            onChange={(_, data) =>
                              updateSelectedCustomPrompt({ usage: data.value })
                            }
                            placeholder={t(
                              "settings.aiImage.prompts.categoryPlaceholder"
                            )}
                            disabled={aiImageForbidden || aiImageSaving}
                            className={styles.fullWidthControl}
                            size="small"
                          />
                        </Field>
                        <Field label={t("settings.aiImage.prompts.addressLabel")}>
                          <Textarea
                            value={String(selectedCustomPrompt.address ?? "")}
                            onChange={(_, data) =>
                              updateSelectedCustomPrompt({
                                address: String(data.value),
                              })
                            }
                            placeholder={t(
                              "settings.aiImage.prompts.addressPlaceholder"
                            )}
                            disabled={aiImageForbidden || aiImageSaving}
                            rows={2}
                            className={styles.fullWidthControl}
                            size="small"
                          />
                        </Field>
                        <Field label={t("settings.aiImage.prompts.descriptionLabel")}>
                          <Textarea
                            value={String(selectedCustomPrompt.description ?? "")}
                            onChange={(_, data) =>
                              updateSelectedCustomPrompt({
                                description: String(data.value),
                              })
                            }
                            placeholder={t(
                              "settings.aiImage.prompts.descriptionPlaceholder"
                            )}
                            disabled={aiImageForbidden || aiImageSaving}
                            rows={3}
                            className={styles.fullWidthControl}
                            size="small"
                          />
                        </Field>
                      </div>
                    ) : null}

                    {aiImagePromptSearch.trim() ? (
                      <pre className={styles.aiImageEditorHighlightedText}>
                        {highlightedAiPromptParts.map((part, idx) =>
                          part.hit ? (
                            <span
                              key={`${idx}-${part.text}`}
                              className={styles.highlight}
                            >
                              {part.text}
                            </span>
                          ) : (
                            <span key={`${idx}-${part.text}`}>{part.text}</span>
                          )
                        )}
                      </pre>
                    ) : (
                      <textarea
                        ref={aiImageEditorTextareaRef}
                        value={selectedAiPromptValue}
                        onChange={(event) =>
                          updateSelectedAiPromptValue(event.target.value)
                        }
                        className={mergeClasses(
                          styles.textArea,
                          styles.aiImageEditorTextArea
                        )}
                        disabled={aiImageForbidden}
                      />
                    )}

                    <div className={styles.aiImageEditorActions}>
                      <Button
                        appearance="outline"
                        className={styles.revertButton}
                        onClick={() => {
                          setAiImageNewPromptName("");
                          setAiImageNewPromptSeedText(selectedAiPromptValue);
                          setAiImageNewPromptDescription("");
                          setAiImageNewPromptError(null);
                          setAiImageNewPromptOpen(true);
                        }}
                        disabled={aiImageForbidden || aiImageSaving}
                      >
                        {t("settings.aiImage.prompts.saveAsNew")}
                      </Button>
                      <Button
                        appearance="outline"
                        className={styles.revertButton}
                        onClick={revertSelectedAiPrompt}
                        disabled={
                          aiImageForbidden ||
                          aiImageSaving ||
                          !selectedAiPromptIsDirty
                        }
                      >
                        {t("common.revert")}
                      </Button>
                      <Button
                        appearance="primary"
                        onClick={() => handleAiImageSave()}
                        disabled={aiImageSaving || aiImageForbidden}
                      >
                        {aiImageSaving
                          ? t("settings.aiImage.saving")
                          : t("common.save")}
                      </Button>
                      <Button
                        appearance="outline"
                        className={styles.deleteButton}
                        onClick={handleAiImageDeletePrompt}
                        disabled={
                          aiImageForbidden ||
                          aiImageSaving ||
                          aiImageDeleteSaving ||
                          !String(aiImageSelectedPrompt).startsWith("custom:")
                        }
                      >
                        {aiImageDeleteSaving
                          ? t("common.loading")
                          : t("common.delete")}
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </Card>

          <Dialog
            open={aiImageNewPromptOpen}
            onOpenChange={(_, data) => setAiImageNewPromptOpen(data.open)}
          >
            <DialogSurface className={styles.dialogSurface}>
              <DialogBody>
                <DialogTitle>
                  {t("settings.aiImage.prompts.addNewTitle")}
                </DialogTitle>
                <Field label={t("settings.aiImage.prompts.nameLabel")}>
                  <Input
                    value={aiImageNewPromptName}
                    onChange={(_, data) => setAiImageNewPromptName(data.value)}
                    placeholder={t("settings.aiImage.prompts.namePlaceholder")}
                    disabled={aiImageForbidden || aiImageNewPromptSaving}
                    autoFocus
                    className={mergeClasses(
                      styles.fullWidthControl,
                      styles.promptNameInput
                    )}
                    size="small"
                  />
                </Field>
                <Field label={t("settings.aiImage.prompts.descriptionLabel")}>
                  <Textarea
                    value={aiImageNewPromptDescription}
                    onChange={(_, data) =>
                      setAiImageNewPromptDescription(String(data.value))
                    }
                    placeholder={t(
                      "settings.aiImage.prompts.descriptionPlaceholder"
                    )}
                    disabled={aiImageForbidden || aiImageNewPromptSaving}
                    rows={3}
                    className={styles.fullWidthControl}
                    size="small"
                  />
                </Field>
                {aiImageNewPromptError ? (
                  <MessageBar>{aiImageNewPromptError}</MessageBar>
                ) : null}
                <DialogActions className={styles.dialogActions}>
                  <Button
                    appearance="subtle"
                    onClick={() => setAiImageNewPromptOpen(false)}
                    disabled={aiImageNewPromptSaving}
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    appearance="primary"
                    onClick={handleAiImageCreatePrompt}
                    disabled={
                      aiImageNewPromptSaving ||
                      aiImageForbidden ||
                      !aiImageNewPromptName.trim()
                    }
                  >
                    {aiImageNewPromptSaving ? t("common.loading") : t("common.save")}
                  </Button>
                </DialogActions>
              </DialogBody>
            </DialogSurface>
          </Dialog>

          <Dialog
            open={aiImageGuideOpen}
            onOpenChange={(_, data) => setAiImageGuideOpen(data.open)}
          >
            <DialogSurface className={styles.aiImageGuideDialogSurface}>
              <DialogBody>
                <DialogTitle>{t("settings.aiImage.prompts.guideTitle")}</DialogTitle>
                {aiImageGuideError ? (
                  <MessageBar>{aiImageGuideError}</MessageBar>
                ) : null}
                {aiImageGuideLoading ? (
                  <Spinner label={t("common.loading")} />
                ) : (
                  <div className={styles.aiImageGuideContent}>
                    {aiImageGuideContent || "-"}
                  </div>
                )}
                <DialogActions className={styles.dialogActions}>
                  <Button
                    appearance="primary"
                    onClick={() => setAiImageGuideOpen(false)}
                  >
                    {t("common.close")}
                  </Button>
                </DialogActions>
              </DialogBody>
            </DialogSurface>
          </Dialog>
        </div>
      ) : null}

      {activeTab === "uikit" ? (
        <div className={styles.sectionGrid}>
          <UIKitShowcase />
        </div>
      ) : null}

      {activeTab === "ui-audit" ? (
        <div className={styles.sectionGrid}>
          <Card className={styles.card}>
            <Text weight="semibold">UI Audit</Text>
            <Text size={200} className={styles.helperText}>
              Compare current and prototype pages from one place while we
              standardize spacing, typography, colors, buttons, and menus.
            </Text>

            <div className={styles.uiAuditGrid}>
              <div className={styles.uiAuditItem}>
                <Text weight="semibold">All Products</Text>
                <Text size={200} className={styles.uiAuditNote}>
                  Current page vs design-lab prototype
                </Text>
                <Text size={200} className={styles.uiAuditRoute}>
                  Current: /app/products?view=all
                </Text>
                <Text size={200} className={styles.uiAuditRoute}>
                  Prototype: /app/products-design-lab?view=all
                </Text>
                <div className={styles.uiAuditLinks}>
                  <Button
                    as="a"
                    href="/app/products?view=all"
                    appearance="outline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open current page
                  </Button>
                  <Button
                    as="a"
                    href="/app/products-design-lab?view=all"
                    appearance="primary"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open design-lab page
                  </Button>
                </div>
              </div>
            </div>

            <Text size={200} className={styles.helperText}>
              Future design-lab pages can be added here so review remains in one
              dedicated UI audit area.
            </Text>
          </Card>
        </div>
      ) : null}

      {activeTab === "shopify-syncer" ? (
        <div className={styles.sectionGrid}>
          <ShopifySyncerPanel />
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
