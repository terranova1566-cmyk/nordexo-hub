"use client";

import {
  Badge,
  Button,
  Card,
  Dropdown,
  Field,
  Image,
  Input,
  Option,
  Spinner,
  Tab,
  TabList,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  Textarea,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { computeCustomerUnitPrice } from "@/lib/b2b/pricing";
import { B2B_CANDIDATE_STATUSES, B2B_CONVERSATION_CHANNELS } from "@/lib/b2b/constants";

// Avoid `any` so React state updaters don't introduce implicit-any callback params.
// This is an MVP page; we’ll tighten types when the API shapes stabilize.
type Candidate = Record<string, any>;

type NoteRow = {
  id: string;
  note: string;
  created_at: string;
  created_by: string | null;
};

type ConversationRow = {
  id: string;
  channel: string;
  message: string;
  created_at: string;
  created_by: string | null;
};

type ShareLinkRow = {
  id: string;
  token: string;
  permissions: string[] | null;
  expires_at: string | null;
  revoked_at: string | null;
  last_accessed_at: string | null;
};

type ActivityRow = {
  id: string;
  action: string;
  diff: any;
  created_at: string;
  created_by: string | null;
};

const useStyles = makeStyles({
  layout: { display: "flex", flexDirection: "column", gap: "16px" },
  card: { padding: "16px", borderRadius: "var(--app-radius)" },
  headerRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap",
  },
  subtitle: { color: tokens.colorNeutralForeground3, whiteSpace: "pre-line" },
  tabsCard: {
    padding: "8px 16px",
    borderRadius: "var(--app-radius)",
    backgroundColor: tokens.colorNeutralBackground2,
  },
  imageRow: { display: "flex", gap: "10px", flexWrap: "wrap" },
  image: { width: "140px", height: "140px", objectFit: "cover", borderRadius: "12px" },
  bodyImage: { width: "180px", height: "260px", objectFit: "cover", borderRadius: "12px" },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "12px",
    alignItems: "end",
  },
  table: { width: "100%" },
  smallJson: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    fontFamily: tokens.fontFamilyMonospace,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
});

export default function B2BCandidateDetailPage() {
  const styles = useStyles();
  const router = useRouter();
  const params = useParams();
  const id = String(params?.id || "");

  const [tab, setTab] = useState("overview");

  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [noteText, setNoteText] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [convChannel, setConvChannel] = useState("wechat");
  const [convMessage, setConvMessage] = useState("");
  const [addingConv, setAddingConv] = useState(false);

  const [shareLinks, setShareLinks] = useState<ShareLinkRow[]>([]);
  const [creatingShare, setCreatingShare] = useState(false);

  const [activity, setActivity] = useState<ActivityRow[]>([]);

  const loadCandidate = useMemo(
    () => async () => {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/b2b/product-candidates/${id}`);
        const payload = await res.json();
        if (!res.ok) throw new Error(payload?.error || "Unable to load candidate.");
        setCandidate(payload?.candidate ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load candidate.");
      } finally {
        setLoading(false);
      }
    },
    [id]
  );

  const loadNotes = useMemo(
    () => async () => {
      if (!id) return;
      const res = await fetch(`/api/b2b/notes?entityType=candidate&entityId=${encodeURIComponent(id)}`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || "Unable to load notes.");
      setNotes((payload?.items ?? []) as NoteRow[]);
    },
    [id]
  );

  const loadConversations = useMemo(
    () => async () => {
      if (!id) return;
      const res = await fetch(`/api/b2b/product-candidates/${id}/conversations`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || "Unable to load conversations.");
      setConversations((payload?.items ?? []) as ConversationRow[]);
    },
    [id]
  );

  const loadActivity = useMemo(
    () => async () => {
      if (!id) return;
      const res = await fetch(`/api/b2b/activity?entityType=candidate&entityId=${encodeURIComponent(id)}&limit=120`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || "Unable to load activity.");
      setActivity((payload?.items ?? []) as ActivityRow[]);
    },
    [id]
  );

  const loadShareLinks = useMemo(
    () => async () => {
      if (!id) return;
      const res = await fetch(
        `/api/b2b/share-links?type=product&entityId=${encodeURIComponent(id)}`
      );
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || "Unable to load share links.");
      setShareLinks((payload?.items ?? []) as ShareLinkRow[]);
    },
    [id]
  );

  useEffect(() => {
    loadCandidate();
  }, [loadCandidate]);

  useEffect(() => {
    if (!candidate) return;
    loadNotes().catch(() => null);
    loadConversations().catch(() => null);
    loadActivity().catch(() => null);
  }, [candidate, loadNotes, loadConversations, loadActivity]);

  const project = candidate?.project ?? null;
  const projectCurrency = project?.currency ?? "SEK";
  const exchangeRate = Number(project?.exchange_rate_cny ?? 0) || 0;
  const marginPercentDefault = Number(project?.margin_percent_default ?? 0) || 0;
  const marginFixedDefault = Number(project?.margin_fixed_default ?? 0) || 0;

  const finalCostCny =
    candidate?.final_price_without_logo_cny ?? candidate?.final_price_with_logo_cny ?? null;
  const marginPercent =
    candidate?.margin_percent_override ?? marginPercentDefault;
  const marginFixed =
    candidate?.margin_fixed_override ?? marginFixedDefault;

  const computed =
    finalCostCny !== null && exchangeRate > 0
      ? computeCustomerUnitPrice({
          currency: projectCurrency,
          exchangeRateCny: exchangeRate,
          unitCostCny: Number(finalCostCny),
          brandingCostsCny: candidate?.branding_costs_cny,
          packagingCostsCny: candidate?.packaging_costs_cny,
          margin: { marginPercent: Number(marginPercent) || 0, marginFixed: Number(marginFixed) || 0 },
        })
      : { ok: false as const, error: "Missing cost/exchange rate." };

  const savePatch = async (patch: Record<string, unknown>) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/b2b/product-candidates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || "Unable to save.");
      await loadCandidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save.");
    } finally {
      setSaving(false);
    }
  };

  const images = Array.isArray(candidate?.images) ? candidate.images : [];
  const galleryImages =
    Array.isArray(candidate?.gallery_images) && candidate.gallery_images.length > 0
      ? candidate.gallery_images
      : images;
  const descriptionImages = Array.isArray(candidate?.description_images)
    ? candidate.description_images
    : [];
  const origin =
    typeof window !== "undefined" && window.location?.origin ? window.location.origin : "";

  const handleCreateShareLink = async () => {
    if (!id) return;
    setCreatingShare(true);
    setError(null);
    try {
      const res = await fetch("/api/b2b/share-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "product",
          entity_id: id,
          permissions: ["view", "select", "comment"],
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || "Unable to create share link.");
      await loadShareLinks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create share link.");
    } finally {
      setCreatingShare(false);
    }
  };

  return (
    <div className={styles.layout}>
      <Card className={styles.card}>
        <div className={styles.headerRow}>
          <div>
            <Text weight="semibold">Product candidate</Text>
            <div>
              <Text size={600} weight="semibold">
                {candidate?.title ?? "Untitled candidate"}
              </Text>
              <Text size={200} className={styles.subtitle}>
                Project:{" "}
                <Button
                  appearance="subtle"
                  onClick={() => project?.id && router.push(`/app/b2b/projects/${project.id}`)}
                  style={{ padding: 0, minWidth: 0, height: "auto" }}
                >
                  {project?.title ?? "—"}
                </Button>
                {"\n"}
                Status: {candidate?.status ?? "—"}
              </Text>
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <Button appearance="secondary" onClick={() => router.back()}>
              Back
            </Button>
            <Button appearance="secondary" disabled={creatingShare} onClick={handleCreateShareLink}>
              {creatingShare ? "Creating…" : "Share link"}
            </Button>
            <Button
              appearance={candidate?.is_shortlisted ? "primary" : "secondary"}
              disabled={saving}
              onClick={() => savePatch({ is_shortlisted: !candidate?.is_shortlisted })}
            >
              {candidate?.is_shortlisted ? "Shortlisted" : "Shortlist"}
            </Button>
          </div>
        </div>

        {error ? (
          <Text style={{ color: tokens.colorStatusDangerForeground1 }}>{error}</Text>
        ) : null}
        {loading ? <Spinner label="Loading…" /> : null}
      </Card>

      <Card className={styles.tabsCard}>
        <TabList
          selectedValue={tab}
          onTabSelect={(_, data) => {
            const next = String(data.value);
            setTab(next);
            if (next === "share") loadShareLinks().catch(() => null);
          }}
        >
          <Tab value="overview">Overview</Tab>
          <Tab value="pricing">Pricing & Margin</Tab>
          <Tab value="notes">Notes</Tab>
          <Tab value="conversations">Conversation log</Tab>
          <Tab value="share">Share links</Tab>
          <Tab value="activity">Activity</Tab>
        </TabList>
      </Card>

      {tab === "overview" ? (
        <Card className={styles.card}>
          <Text weight="semibold">Overview</Text>
          <Text size={200} className={styles.subtitle}>
            Gallery images and description-body images are stored separately for quoting and customer-facing previews.
          </Text>
          <Text size={200} className={styles.subtitle}>
            Gallery images ({galleryImages.length})
          </Text>
          <div className={styles.imageRow}>
            {galleryImages.slice(0, 16).map((src: string) => (
              <Image key={src} src={src} alt="Candidate image" className={styles.image} />
            ))}
          </div>
          <Text size={200} className={styles.subtitle}>
            Description body images ({descriptionImages.length})
          </Text>
          <div className={styles.imageRow}>
            {descriptionImages.slice(0, 24).map((src: string) => (
              <Image key={src} src={src} alt="Description image" className={styles.bodyImage} />
            ))}
          </div>
          <Text size={200} className={styles.subtitle}>
            Source URL (internal): {candidate?.source_url ?? "—"}
          </Text>
          <div className={styles.formGrid}>
            <Field label="Status">
              <Dropdown
                selectedOptions={candidate?.status ? [candidate.status] : []}
                value={candidate?.status ?? ""}
                onOptionSelect={(_, data) => savePatch({ status: String(data.optionValue) })}
              >
                {B2B_CANDIDATE_STATUSES.map((s) => (
                  <Option key={s} value={s} text={s}>
                    {s}
                  </Option>
                ))}
              </Dropdown>
            </Field>
            <Field label="MOQ (source)">
              <Input
                value={candidate?.moq ?? ""}
                onChange={(_, data) => savePatch({ moq: data.value })}
              />
            </Field>
          </div>
        </Card>
      ) : null}

      {tab === "pricing" ? (
        <Card className={styles.card}>
          <Text weight="semibold">Pricing & margin</Text>
          <Text size={200} className={styles.subtitle}>
            Source costs are stored in CNY. Customer pricing is computed using the project exchange rate and margins.
          </Text>

          <div className={styles.formGrid}>
            <Field label="Final unit price (without logo), CNY">
              <Input
                value={candidate?.final_price_without_logo_cny ?? ""}
                onChange={(_, data) =>
                  setCandidate((prev) => (prev ? { ...prev, final_price_without_logo_cny: data.value } : prev))
                }
              />
            </Field>
            <Field label="Final unit price (with logo), CNY">
              <Input
                value={candidate?.final_price_with_logo_cny ?? ""}
                onChange={(_, data) =>
                  setCandidate((prev) => (prev ? { ...prev, final_price_with_logo_cny: data.value } : prev))
                }
              />
            </Field>
            <Field label="Final MOQ">
              <Input
                value={candidate?.final_moq ?? ""}
                onChange={(_, data) =>
                  setCandidate((prev) => (prev ? { ...prev, final_moq: data.value } : prev))
                }
              />
            </Field>
            <Field label="Final lead time (days)">
              <Input
                value={candidate?.final_lead_time_days ?? ""}
                onChange={(_, data) =>
                  setCandidate((prev) => (prev ? { ...prev, final_lead_time_days: data.value } : prev))
                }
              />
            </Field>
            <Field label={`Margin override (%) [default ${marginPercentDefault}%]`}>
              <Input
                value={candidate?.margin_percent_override ?? ""}
                onChange={(_, data) =>
                  setCandidate((prev) => (prev ? { ...prev, margin_percent_override: data.value } : prev))
                }
                placeholder={String(marginPercentDefault)}
              />
            </Field>
            <Field label={`Margin override (fixed ${projectCurrency}) [default ${marginFixedDefault}]`}>
              <Input
                value={candidate?.margin_fixed_override ?? ""}
                onChange={(_, data) =>
                  setCandidate((prev) => (prev ? { ...prev, margin_fixed_override: data.value } : prev))
                }
                placeholder={String(marginFixedDefault)}
              />
            </Field>
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <Button
              appearance="primary"
              disabled={saving}
              onClick={() =>
                savePatch({
                  final_price_without_logo_cny: candidate?.final_price_without_logo_cny ?? null,
                  final_price_with_logo_cny: candidate?.final_price_with_logo_cny ?? null,
                  final_moq: candidate?.final_moq ?? null,
                  final_lead_time_days: candidate?.final_lead_time_days ?? null,
                  margin_percent_override: candidate?.margin_percent_override ?? null,
                  margin_fixed_override: candidate?.margin_fixed_override ?? null,
                })
              }
            >
              {saving ? "Saving…" : "Save pricing"}
            </Button>
          </div>

          <Card className={styles.card} style={{ backgroundColor: tokens.colorNeutralBackground2 }}>
            <Text weight="semibold">Computed customer price (MVP)</Text>
            {computed.ok ? (
              <Text size={200} className={styles.subtitle}>
                Base cost: {computed.totalUnitCostCustomer.toFixed(2)} {computed.currency}{"\n"}
                Margin: {computed.marginPercent}% + {computed.marginFixed.toFixed(2)} {computed.currency}{"\n"}
                Customer price: {computed.customerUnitPrice.toFixed(2)} {computed.currency}
              </Text>
            ) : (
              <Text size={200} className={styles.subtitle}>
                {computed.error}
              </Text>
            )}
          </Card>
        </Card>
      ) : null}

      {tab === "notes" ? (
        <Card className={styles.card}>
          <div className={styles.headerRow}>
            <div>
              <Text weight="semibold">Notes</Text>
              <Text size={200} className={styles.subtitle}>
                Internal notes are stored as separate log entries.
              </Text>
            </div>
          </div>
          <Field label="Add note">
            <Textarea
              value={noteText}
              onChange={(_, data) => setNoteText(data.value)}
              resize="vertical"
            />
          </Field>
          <Button
            appearance="primary"
            disabled={addingNote || !noteText.trim()}
            onClick={async () => {
              setAddingNote(true);
              setError(null);
              try {
                const res = await fetch("/api/b2b/notes", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    entity_type: "candidate",
                    entity_id: id,
                    note: noteText.trim(),
                  }),
                });
                const payload = await res.json();
                if (!res.ok) throw new Error(payload?.error || "Unable to add note.");
                setNoteText("");
                await loadNotes();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Unable to add note.");
              } finally {
                setAddingNote(false);
              }
            }}
          >
            {addingNote ? "Adding…" : "Add note"}
          </Button>

          {notes.length === 0 ? (
            <Text className={styles.subtitle} style={{ marginTop: "10px" }}>
              No notes yet.
            </Text>
          ) : (
            <Table size="small" className={styles.table} style={{ marginTop: "10px" }}>
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>When</TableHeaderCell>
                  <TableHeaderCell>Note</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {notes.map((n) => (
                  <TableRow key={n.id}>
                    <TableCell>
                      <Text size={200} className={styles.subtitle}>
                        {new Date(n.created_at).toLocaleString()}
                      </Text>
                    </TableCell>
                    <TableCell>{n.note}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      ) : null}

      {tab === "conversations" ? (
        <Card className={styles.card}>
          <Text weight="semibold">Conversation / negotiation log</Text>
          <Text size={200} className={styles.subtitle}>
            MVP: simple message log. TODO: attachments + structured negotiation fields.
          </Text>
          <div className={styles.formGrid}>
            <Field label="Channel">
              <Dropdown
                selectedOptions={[convChannel]}
                value={convChannel}
                onOptionSelect={(_, data) => setConvChannel(String(data.optionValue))}
              >
                {B2B_CONVERSATION_CHANNELS.map((c) => (
                  <Option key={c} value={c} text={c}>
                    {c}
                  </Option>
                ))}
              </Dropdown>
            </Field>
            <Field label="Message">
              <Textarea
                value={convMessage}
                onChange={(_, data) => setConvMessage(data.value)}
                resize="vertical"
              />
            </Field>
          </div>
          <Button
            appearance="primary"
            disabled={addingConv || !convMessage.trim()}
            onClick={async () => {
              setAddingConv(true);
              setError(null);
              try {
                const res = await fetch(`/api/b2b/product-candidates/${id}/conversations`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ channel: convChannel, message: convMessage.trim() }),
                });
                const payload = await res.json();
                if (!res.ok) throw new Error(payload?.error || "Unable to add message.");
                setConvMessage("");
                await loadConversations();
                await loadActivity();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Unable to add message.");
              } finally {
                setAddingConv(false);
              }
            }}
          >
            {addingConv ? "Adding…" : "Add entry"}
          </Button>

          {conversations.length === 0 ? (
            <Text className={styles.subtitle} style={{ marginTop: "10px" }}>
              No conversation entries yet.
            </Text>
          ) : (
            <Table size="small" className={styles.table} style={{ marginTop: "10px" }}>
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>When</TableHeaderCell>
                  <TableHeaderCell>Channel</TableHeaderCell>
                  <TableHeaderCell>Message</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {conversations.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Text size={200} className={styles.subtitle}>
                        {new Date(c.created_at).toLocaleString()}
                      </Text>
                    </TableCell>
                    <TableCell>
                      <Badge appearance="outline">{c.channel}</Badge>
                    </TableCell>
                    <TableCell>{c.message}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      ) : null}

      {tab === "share" ? (
        <Card className={styles.card}>
          <div className={styles.headerRow}>
            <div>
              <Text weight="semibold">Share links</Text>
              <Text size={200} className={styles.subtitle}>
                Public links are sanitized: no supplier identity, no supplier URLs, no internal margins.
              </Text>
            </div>
            <Button appearance="primary" disabled={creatingShare} onClick={handleCreateShareLink}>
              {creatingShare ? "Creating…" : "New share link"}
            </Button>
          </div>

          {shareLinks.length === 0 ? (
            <Text className={styles.subtitle}>No share links yet.</Text>
          ) : (
            <Table size="small" className={styles.table}>
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>Link</TableHeaderCell>
                  <TableHeaderCell>Permissions</TableHeaderCell>
                  <TableHeaderCell>Last accessed</TableHeaderCell>
                  <TableHeaderCell>Actions</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shareLinks.map((l) => {
                  const url = origin ? `${origin}/share/${l.token}` : `/share/${l.token}`;
                  return (
                    <TableRow key={l.id}>
                      <TableCell>
                        <Text size={200} className={styles.subtitle}>
                          {url}
                        </Text>
                      </TableCell>
                      <TableCell>
                        {Array.isArray(l.permissions) ? l.permissions.join(", ") : "view"}
                      </TableCell>
                      <TableCell>
                        <Text size={200} className={styles.subtitle}>
                          {l.last_accessed_at ? new Date(l.last_accessed_at).toLocaleString() : "—"}
                        </Text>
                      </TableCell>
                      <TableCell>
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          <Button appearance="secondary" onClick={() => window.open(url, "_blank")}>
                            Open
                          </Button>
                          <Button appearance="subtle" onClick={() => router.push(`/app/b2b/share-links/${l.id}`)}>
                            View selections
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>
      ) : null}

      {tab === "activity" ? (
        <Card className={styles.card}>
          <Text weight="semibold">Activity</Text>
          {activity.length === 0 ? (
            <Text className={styles.subtitle}>No activity yet.</Text>
          ) : (
            <Table size="small" className={styles.table}>
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>When</TableHeaderCell>
                  <TableHeaderCell>Action</TableHeaderCell>
                  <TableHeaderCell>Diff</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activity.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Text size={200} className={styles.subtitle}>
                        {new Date(a.created_at).toLocaleString()}
                      </Text>
                    </TableCell>
                    <TableCell>{a.action}</TableCell>
                    <TableCell>
                      <Text size={200} className={styles.subtitle}>
                        {a.diff ? JSON.stringify(a.diff).slice(0, 220) : "—"}
                      </Text>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      ) : null}
    </div>
  );
}
