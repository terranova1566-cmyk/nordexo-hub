"use client";

import {
  Button,
  Badge,
  Card,
  Checkbox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
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
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { formatDate } from "@/lib/format";

type ShareInfo = {
  shared_with_email: string;
  is_public: boolean;
  created_at: string;
};

type PreviewImage = {
  image_url: string | null;
  image_local_path: string | null;
  image_local_url: string | null;
};

type OwnedList = {
  id: string;
  name: string;
  created_at: string | null;
  item_count: number;
  shared_with: ShareInfo[];
  preview_images?: PreviewImage[];
};

type SharedList = {
  id: string;
  name: string;
  created_at: string | null;
  item_count: number;
  shared_by_email: string;
  shared_at: string | null;
  preview_images?: PreviewImage[];
};

const TrashIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    aria-hidden="true"
    focusable="false"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path stroke="none" d="M0 0h24v24H0z" />
    <path d="M4 7l16 0" />
    <path d="M10 11l0 6" />
    <path d="M14 11l0 6" />
    <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
    <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
  </svg>
);

const useStyles = makeStyles({
  layout: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  card: {
    padding: "16px",
    borderRadius: "var(--app-radius)",
  },
  subtitle: {
    color: tokens.colorNeutralForeground3,
  },
  sectionTitle: {
    marginBottom: "8px",
  },
  headerCell: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightRegular,
    paddingTop: "6px",
    paddingBottom: "6px",
  },
  table: {
    width: "100%",
  },
  previewCell: {
    width: "83px",
    paddingLeft: "8px",
    paddingRight: 0,
    boxSizing: "border-box",
  },
  previewGrid: {
    width: "75px",
    height: "75px",
    borderRadius: "12px",
    overflow: "hidden",
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gridTemplateRows: "repeat(2, 1fr)",
    backgroundColor: tokens.colorNeutralBackground3,
  },
  previewImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  previewPlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: tokens.colorNeutralBackground3,
  },
  sharedWith: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  tableCell: {
    paddingTop: "10px",
    paddingBottom: "10px",
    verticalAlign: "middle",
  },
  listNameRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  listNameLink: {
    background: "none",
    border: "none",
    padding: 0,
    color: tokens.colorNeutralForeground1,
    fontWeight: tokens.fontWeightSemibold,
    cursor: "pointer",
    textAlign: "left",
    "&:hover": {
      color: tokens.colorNeutralForeground2,
    },
  },
  listNameText: {
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
  },
  listNameEditRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  listNameInput: {
    minWidth: "220px",
    fontSize: tokens.fontSizeBase300,
    "& input": {
      fontSize: tokens.fontSizeBase300,
      paddingBlock: "6px",
    },
  },
  editIconButton: {
    color: tokens.colorNeutralForeground4,
    "&:hover": {
      color: tokens.colorNeutralForeground3,
    },
  },
  iconButton: {
    border: "none",
    background: "transparent",
    width: "28px",
    height: "28px",
    padding: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "6px",
    cursor: "pointer",
    color: tokens.colorNeutralForeground3,
    transition: "background-color 0.12s ease, color 0.12s ease",
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground3,
      color: tokens.colorNeutralForeground2,
    },
  },
  icon: {
    width: "16px",
    height: "16px",
  },
  editIcon: {
    width: "18px",
    height: "18px",
  },
  dialogSurface: {
    padding: "24px",
  },
  dialogActions: {
    marginTop: "8px",
  },
  shareButton: {
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground2,
    },
  },
  userPopover: {
    padding: "8px",
    minWidth: "260px",
    maxWidth: "320px",
  },
  userList: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    maxHeight: "200px",
    overflowY: "auto",
  },
  userRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 8px",
    borderRadius: "6px",
    cursor: "pointer",
    transition: "background-color 0.12s ease",
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground3,
    },
  },
  userRowLabel: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
  },
  shareEmailInput: {
    fontSize: tokens.fontSizeBase200,
    "& input": {
      fontSize: tokens.fontSizeBase200,
    },
  },
  shareAllRow: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    marginTop: "4px",
  },
  actions: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  },
  emptyState: {
    color: tokens.colorNeutralForeground3,
  },
});

export default function MyListsPage() {
  const styles = useStyles();
  const { t } = useI18n();
  const [owned, setOwned] = useState<OwnedList[]>([]);
  const [shared, setShared] = useState<SharedList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<OwnedList | null>(null);
  const [shareEmails, setShareEmails] = useState("");
  const [userOptions, setUserOptions] = useState<string[]>([]);
  const [userOptionsLoading, setUserOptionsLoading] = useState(false);
  const [userOptionsError, setUserOptionsError] = useState<string | null>(null);
  const [userPopoverOpen, setUserPopoverOpen] = useState(false);
  const [selectedUserEmails, setSelectedUserEmails] = useState<string[]>([]);
  const [isSharing, setIsSharing] = useState(false);
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OwnedList | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadLists = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/discovery/wishlists/overview");
      if (!response.ok) {
        throw new Error(t("lists.error.load"));
      }
      const payload = await response.json();
      setOwned(payload.owned ?? []);
      setShared(payload.shared ?? []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadLists();
  }, [loadLists]);

  const openList = useCallback((listId: string) => {
    window.open(`/app/discovery?wishlistId=${listId}`, "_blank", "noopener,noreferrer");
  }, []);

  const handleOpenShare = (list: OwnedList) => {
    setShareTarget(list);
    setShareEmails("");
    setSelectedUserEmails([]);
    setShareDialogOpen(true);
  };

  const parseEmailList = useCallback((value: string) => {
    return value
      .split(",")
      .map((email) => email.trim())
      .filter(Boolean);
  }, []);

  const toggleUserEmail = useCallback(
    (email: string) => {
      const current = new Set(parseEmailList(shareEmails));
      if (current.has(email)) {
        current.delete(email);
      } else {
        current.add(email);
      }
      const next = Array.from(current);
      setShareEmails(next.join(", "));
      const optionSet = new Set(userOptions);
      setSelectedUserEmails(next.filter((entry) => optionSet.has(entry)));
    },
    [parseEmailList, shareEmails, userOptions]
  );

  useEffect(() => {
    if (!shareDialogOpen) {
      setUserPopoverOpen(false);
      return;
    }
    const controller = new AbortController();
    const loadUsers = async () => {
      setUserOptionsLoading(true);
      setUserOptionsError(null);
      try {
        const response = await fetch("/api/users", { signal: controller.signal });
        if (!response.ok) {
          throw new Error(t("lists.share.usersError"));
        }
        const payload = await response.json();
        const users = payload.users ?? [];
        setUserOptions(users);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setUserOptionsError((err as Error).message);
        }
      } finally {
        setUserOptionsLoading(false);
      }
    };
    loadUsers();
    return () => controller.abort();
  }, [shareDialogOpen, t]);

  useEffect(() => {
    const current = new Set(parseEmailList(shareEmails));
    const optionSet = new Set(userOptions);
    setSelectedUserEmails(
      [...current].filter((email) => optionSet.has(email))
    );
  }, [parseEmailList, shareEmails, userOptions]);

  const handleShare = async () => {
    if (!shareTarget) return;
    setIsSharing(true);
    const emails = parseEmailList(shareEmails);
    try {
      const response = await fetch("/api/discovery/wishlists/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wishlistId: shareTarget.id,
          emails,
          shareWithAll: false,
        }),
      });
      if (!response.ok) {
        throw new Error(t("lists.error.share"));
      }
      setShareDialogOpen(false);
      await loadLists();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSharing(false);
    }
  };

  const sharedWithLabel = useCallback(
    (entry: ShareInfo) =>
      entry.is_public || entry.shared_with_email === ""
        ? t("lists.share.sharedWithAll")
        : entry.shared_with_email,
    [t]
  );

  const resolvePreviewSrc = useCallback((image: PreviewImage | null) => {
    if (!image) return null;
    if (image.image_local_url) return image.image_local_url;
    if (image.image_local_path) {
      return `/api/discovery/local-image?path=${encodeURIComponent(
        image.image_local_path
      )}`;
    }
    return image.image_url;
  }, []);

  const startEditing = (list: OwnedList) => {
    setEditingListId(list.id);
    setEditingName(list.name);
  };

  const handleSaveName = async () => {
    if (!editingListId) return;
    const nextName = editingName.trim();
    if (!nextName) return;
    setIsRenaming(true);
    try {
      const response = await fetch("/api/discovery/wishlists", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingListId, name: nextName }),
      });
      if (!response.ok) {
        throw new Error(t("lists.error.rename"));
      }
      setOwned((prev) =>
        prev.map((list) =>
          list.id === editingListId ? { ...list, name: nextName } : list
        )
      );
      setEditingListId(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsRenaming(false);
    }
  };

  const handleOpenDelete = (list: OwnedList) => {
    setDeleteTarget(list);
    setDeleteDialogOpen(true);
  };

  const handleDeleteList = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setError(null);
    try {
      const response = await fetch("/api/discovery/wishlists", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deleteTarget.id }),
      });
      if (!response.ok) {
        throw new Error(t("lists.error.delete"));
      }
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      await loadLists();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsDeleting(false);
    }
  };

  const ownedRows = useMemo(() => owned, [owned]);
  const sharedRows = useMemo(() => shared, [shared]);

  return (
    <div className={styles.layout}>
      <div>
        <Text size={600} weight="semibold">
          {t("lists.page.title")}
        </Text>
      </div>

      <Card className={styles.card}>
        <Text weight="semibold" className={styles.sectionTitle}>
          {t("lists.section.owned")}
        </Text>
        {loading ? (
          <Spinner label={t("lists.loading")} />
        ) : ownedRows.length === 0 ? (
          <Text className={styles.emptyState}>{t("lists.empty.owned")}</Text>
        ) : (
          <Table size="small" className={styles.table}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell
                  className={mergeClasses(styles.headerCell, styles.previewCell)}
                  aria-label="Preview"
                />
                <TableHeaderCell className={styles.headerCell}>
                  {t("lists.table.listName")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.headerCell}>
                  {t("lists.table.items")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.headerCell}>
                  {t("lists.table.sharedWith")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.headerCell}>
                  {t("lists.table.actions")}
                </TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ownedRows.map((list) => {
                const previewSlots = Array.from({ length: 4 }, (_, index) =>
                  list.preview_images?.[index] ?? null
                );
                return (
                  <TableRow key={list.id}>
                    <TableCell className={mergeClasses(styles.tableCell, styles.previewCell)}>
                      <div className={styles.previewGrid}>
                        {previewSlots.map((image, index) => {
                          const src = resolvePreviewSrc(image);
                          return src ? (
                            <img
                              key={`${list.id}-preview-${index}`}
                              src={src}
                              alt=""
                              className={styles.previewImage}
                              loading="lazy"
                            />
                          ) : (
                            <div
                              key={`${list.id}-preview-${index}`}
                              className={styles.previewPlaceholder}
                            />
                          );
                        })}
                      </div>
                    </TableCell>
                    <TableCell className={styles.tableCell}>
                    {editingListId === list.id ? (
                      <div className={styles.listNameEditRow}>
                        <Input
                          value={editingName}
                          onChange={(_, data) => setEditingName(data.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              handleSaveName();
                            }
                          }}
                          className={styles.listNameInput}
                        />
                        <button
                          type="button"
                          className={styles.iconButton}
                          onClick={handleSaveName}
                          aria-label={t("lists.table.save")}
                          disabled={isRenaming}
                        >
                          <svg
                            viewBox="0 0 16 16"
                            className={styles.editIcon}
                            aria-hidden="true"
                          >
                            <path
                              d="M6.2 11.4 3.1 8.3l1.1-1.1 2 2 4.8-4.8 1.1 1.1-5.9 5.9z"
                              fill="currentColor"
                            />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <div className={styles.listNameRow}>
                        <button
                          type="button"
                          className={styles.listNameLink}
                          onClick={() => openList(list.id)}
                        >
                          {list.name}
                        </button>
                        <button
                          type="button"
                          className={mergeClasses(
                            styles.iconButton,
                            styles.editIconButton
                          )}
                          onClick={() => startEditing(list)}
                          aria-label={t("lists.table.edit")}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className={styles.editIcon}
                            aria-hidden="true"
                          >
                            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                            <path
                              d="M7 7h-1a2 2 0 0 0 -2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2 -2v-1"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.6"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M20.385 6.585a2.1 2.1 0 0 0 -2.97 -2.97l-8.415 8.385v3h3l8.385 -8.415"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.6"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M16 5l3 3"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.6"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className={styles.tableCell}>
                    <Badge>{list.item_count}</Badge>
                  </TableCell>
                  <TableCell className={styles.tableCell}>
                    <div className={styles.sharedWith}>
                      {list.shared_with.length === 0 ? (
                        <Text className={styles.emptyState}>
                          {t("lists.share.notShared")}
                        </Text>
                      ) : (
                        list.shared_with.map((share, index) => (
                          <span key={`${list.id}-share-${index}`}>
                            {sharedWithLabel(share)}
                          </span>
                        ))
                      )}
                    </div>
                  </TableCell>
                  <TableCell className={styles.tableCell}>
                    <div className={styles.actions}>
                      <Button appearance="primary" onClick={() => openList(list.id)}>
                        {t("lists.table.view")}
                      </Button>
                      <Button
                        appearance="outline"
                        className={styles.shareButton}
                        onClick={() => handleOpenShare(list)}
                      >
                        {t("lists.table.share")}
                      </Button>
                      <button
                        type="button"
                        className={styles.iconButton}
                        aria-label={t("lists.delete.aria")}
                        onClick={() => handleOpenDelete(list)}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card className={styles.card}>
        <Text weight="semibold" className={styles.sectionTitle}>
          {t("lists.section.shared")}
        </Text>
        {loading ? (
          <Spinner label={t("lists.loading")} />
        ) : sharedRows.length === 0 ? (
          <Text className={styles.emptyState}>{t("lists.empty.shared")}</Text>
        ) : (
          <Table size="small" className={styles.table}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell
                  className={mergeClasses(styles.headerCell, styles.previewCell)}
                  aria-label="Preview"
                />
                <TableHeaderCell className={styles.headerCell}>
                  {t("lists.table.listName")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.headerCell}>
                  {t("lists.table.items")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.headerCell}>
                  {t("lists.table.sharedBy")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.headerCell}>
                  {t("lists.table.sharedAt")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.headerCell}>
                  {t("lists.table.actions")}
                </TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sharedRows.map((list) => {
                const previewSlots = Array.from({ length: 4 }, (_, index) =>
                  list.preview_images?.[index] ?? null
                );
                return (
                  <TableRow key={list.id}>
                    <TableCell className={mergeClasses(styles.tableCell, styles.previewCell)}>
                      <div className={styles.previewGrid}>
                        {previewSlots.map((image, index) => {
                          const src = resolvePreviewSrc(image);
                          return src ? (
                            <img
                              key={`${list.id}-preview-${index}`}
                              src={src}
                              alt=""
                              className={styles.previewImage}
                              loading="lazy"
                            />
                          ) : (
                            <div
                              key={`${list.id}-preview-${index}`}
                              className={styles.previewPlaceholder}
                            />
                          );
                        })}
                      </div>
                    </TableCell>
                    <TableCell className={styles.tableCell}>
                      <button
                        type="button"
                        className={styles.listNameLink}
                        onClick={() => openList(list.id)}
                      >
                        {list.name}
                      </button>
                    </TableCell>
                    <TableCell className={styles.tableCell}>
                      <Badge>{list.item_count}</Badge>
                    </TableCell>
                    <TableCell className={styles.tableCell}>
                      {list.shared_by_email || t("common.notAvailable")}
                    </TableCell>
                    <TableCell className={styles.tableCell}>
                      {formatDate(list.shared_at)}
                    </TableCell>
                    <TableCell className={styles.tableCell}>
                      <Button appearance="primary" onClick={() => openList(list.id)}>
                        {t("lists.table.view")}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={shareDialogOpen} onOpenChange={(_, data) => setShareDialogOpen(data.open)}>
        <DialogSurface className={styles.dialogSurface}>
          <DialogBody>
            <DialogTitle>{t("lists.share.dialogTitle")}</DialogTitle>
            <Field label={t("lists.share.emailLabel")}>
              <Popover
                open={userPopoverOpen}
                onOpenChange={(_, data) => setUserPopoverOpen(data.open)}
                positioning={{ position: "below", align: "start", offset: { mainAxis: 6 } }}
              >
                <PopoverTrigger disableButtonEnhancement>
                  <Input
                    value={shareEmails}
                    onChange={(_, data) => setShareEmails(data.value)}
                    onFocus={() => setUserPopoverOpen(true)}
                    onClick={() => setUserPopoverOpen(true)}
                    placeholder={t("lists.share.emailPlaceholder")}
                    className={styles.shareEmailInput}
                  />
                </PopoverTrigger>
                <PopoverSurface className={styles.userPopover}>
                  {userOptionsLoading ? (
                    <Spinner label={t("lists.share.usersLoading")} />
                  ) : userOptionsError ? (
                    <Text className={styles.emptyState}>{userOptionsError}</Text>
                  ) : userOptions.length === 0 ? (
                    <Text className={styles.emptyState}>
                      {t("lists.share.usersEmpty")}
                    </Text>
                  ) : (
                    <div className={styles.userList}>
                      {userOptions.map((email) => (
                        <div
                          key={email}
                          className={styles.userRow}
                          role="button"
                          tabIndex={0}
                          onClick={() => toggleUserEmail(email)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              toggleUserEmail(email);
                            }
                          }}
                        >
                          <Checkbox
                            checked={selectedUserEmails.includes(email)}
                            onChange={() => toggleUserEmail(email)}
                            onClick={(event) => event.stopPropagation()}
                          />
                          <span className={styles.userRowLabel}>{email}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </PopoverSurface>
              </Popover>
            </Field>
            <DialogActions className={styles.dialogActions}>
              <Button appearance="subtle" onClick={() => setShareDialogOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button appearance="primary" onClick={handleShare} disabled={isSharing}>
                {isSharing ? t("lists.share.saving") : t("lists.share.submit")}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(_, data) => setDeleteDialogOpen(data.open)}
      >
        <DialogSurface className={styles.dialogSurface}>
          <DialogBody>
            <DialogTitle>{t("lists.delete.confirmTitle")}</DialogTitle>
            <DialogActions className={styles.dialogActions}>
              <Button appearance="subtle" onClick={() => setDeleteDialogOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                appearance="primary"
                onClick={handleDeleteList}
                disabled={isDeleting}
              >
                {isDeleting ? t("lists.delete.deleting") : t("common.yes")}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {error ? <Text className={styles.emptyState}>{error}</Text> : null}
    </div>
  );
}
