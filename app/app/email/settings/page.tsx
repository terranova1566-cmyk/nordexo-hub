"use client";

import {
  Button,
  Card,
  Field,
  Input,
  MessageBar,
  Spinner,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { useCallback, useEffect, useMemo, useState } from "react";

type SmtpAccount = {
  id: string;
  name: string;
  fromEmail: string;
  fromName: string | null;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  hasPassword: boolean;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

type SendpulseSender = {
  email: string;
  name: string | null;
  status: string | null;
};

type SettingsPayload = {
  smtpAccounts?: SmtpAccount[];
  smtpSettingsTableMissing?: boolean;
  envSender?: {
    email: string;
    name: string;
    host: string;
    port: number;
    secure: boolean;
    user: string;
  } | null;
  sendpulseSenders?: SendpulseSender[];
  sendpulseError?: string | null;
  error?: string;
};

type FormState = {
  id: string;
  name: string;
  fromEmail: string;
  fromName: string;
  host: string;
  port: string;
  secure: boolean;
  user: string;
  password: string;
  isActive: boolean;
};

const useStyles = makeStyles({
  page: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  helper: {
    color: tokens.colorNeutralForeground3,
  },
  card: {
    padding: "16px",
    borderRadius: "14px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  split: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)",
    gap: "16px",
    "@media (max-width: 1080px)": {
      gridTemplateColumns: "minmax(0, 1fr)",
    },
  },
  row: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "12px",
    "@media (max-width: 700px)": {
      gridTemplateColumns: "minmax(0, 1fr)",
    },
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    alignItems: "center",
  },
  tableWrap: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "10px",
    overflow: "hidden",
  },
  clickableRow: {
    cursor: "pointer",
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground2,
    },
  },
});

const emptyForm: FormState = {
  id: "",
  name: "",
  fromEmail: "",
  fromName: "",
  host: "",
  port: "587",
  secure: false,
  user: "",
  password: "",
  isActive: true,
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
};

export default function EmailConfigPage() {
  const styles = useStyles();

  const [accounts, setAccounts] = useState<SmtpAccount[]>([]);
  const [sendpulseSenders, setSendpulseSenders] = useState<SendpulseSender[]>([]);
  const [sendpulseError, setSendpulseError] = useState<string | null>(null);
  const [tableMissing, setTableMissing] = useState(false);
  const [envSender, setEnvSender] = useState<SettingsPayload["envSender"]>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const selectedAccount = useMemo(
    () => accounts.find((entry) => entry.id === form.id) ?? null,
    [accounts, form.id]
  );
  const activeSmtpAccountsCount = useMemo(
    () => accounts.filter((entry) => entry.isActive).length,
    [accounts]
  );
  const smtpConfigured = activeSmtpAccountsCount > 0 || Boolean(envSender);
  const smtpEditorDisabled = tableMissing || isLoading;

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/email/settings");
      const payload = (await response.json()) as SettingsPayload;
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to load email settings.");
      }
      setAccounts(Array.isArray(payload.smtpAccounts) ? payload.smtpAccounts : []);
      setTableMissing(Boolean(payload.smtpSettingsTableMissing));
      setEnvSender(payload.envSender ?? null);
      setSendpulseSenders(Array.isArray(payload.sendpulseSenders) ? payload.sendpulseSenders : []);
      setSendpulseError(payload.sendpulseError ?? null);
    } catch (error) {
      setMessage({ type: "error", text: (error as Error).message });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const resetForm = () => {
    setForm(emptyForm);
  };

  const selectAccount = (account: SmtpAccount) => {
    setForm({
      id: account.id,
      name: account.name,
      fromEmail: account.fromEmail,
      fromName: account.fromName || "",
      host: account.host,
      port: String(account.port || 587),
      secure: Boolean(account.secure),
      user: account.user,
      password: "",
      isActive: account.isActive,
    });
  };

  const saveAccount = async () => {
    setIsSaving(true);
    setMessage(null);

    try {
      const payload = {
        id: form.id || undefined,
        name: form.name,
        fromEmail: form.fromEmail,
        fromName: form.fromName,
        host: form.host,
        port: form.port,
        secure: form.secure,
        user: form.user,
        password: form.password,
        isActive: form.isActive,
      };

      const method = form.id ? "PATCH" : "POST";
      const response = await fetch("/api/email/settings", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result?.error || "Unable to save SMTP account.");
      }

      setMessage({ type: "success", text: form.id ? "SMTP account updated." : "SMTP account created." });
      await loadSettings();
      resetForm();
    } catch (error) {
      setMessage({ type: "error", text: (error as Error).message });
    } finally {
      setIsSaving(false);
    }
  };

  const deleteAccount = async () => {
    if (!form.id) return;
    if (!window.confirm("Delete this SMTP account?")) return;

    setIsDeleting(true);
    setMessage(null);
    try {
      const response = await fetch("/api/email/settings", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: form.id }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result?.error || "Unable to delete SMTP account.");
      }
      setMessage({ type: "success", text: "SMTP account deleted." });
      await loadSettings();
      resetForm();
    } catch (error) {
      setMessage({ type: "error", text: (error as Error).message });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className={styles.page}>
      <Text size={700} weight="semibold">
        Email settings
      </Text>
      <Text className={styles.helper}>
        Manage SMTP sender accounts and review authenticated SendPulse senders.
      </Text>
      <div className={styles.actions}>
        <Button
          appearance="secondary"
          onClick={() => {
            void loadSettings();
          }}
          disabled={isLoading}
        >
          {isLoading ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {message ? <MessageBar intent={message.type}>{message.text}</MessageBar> : null}

      {tableMissing ? (
        <MessageBar intent="warning">
          SMTP account storage is missing in this environment. Apply{" "}
          <code>0052_partner_email_smtp_accounts.sql</code> to manage MXRoute SMTP
          accounts here. SendPulse sending is unaffected.
        </MessageBar>
      ) : null}

      <div className={styles.split}>
        <Card className={styles.card}>
          <Text weight="semibold">SMTP accounts</Text>
          <Text className={styles.helper}>
            These accounts are used by Email send and can be reused in automations.
            This SMTP channel is optional if you only use SendPulse.
          </Text>

          {isLoading ? <Spinner label="Loading settings" /> : null}

          <div className={styles.tableWrap}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>Sender</TableHeaderCell>
                  <TableHeaderCell>SMTP host</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => (
                  <TableRow
                    key={account.id}
                    className={styles.clickableRow}
                    onClick={() => selectAccount(account)}
                  >
                    <TableCell>
                      <div>{account.name}</div>
                      <div>{account.fromEmail}</div>
                    </TableCell>
                    <TableCell>
                      {account.host}:{account.port}
                    </TableCell>
                    <TableCell>{account.isActive ? "Active" : "Inactive"}</TableCell>
                  </TableRow>
                ))}
                {accounts.length === 0 ? (
                  <TableRow>
                    <TableCell>No SMTP accounts</TableCell>
                    <TableCell>-</TableCell>
                    <TableCell>-</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>

          {envSender ? (
            <MessageBar intent="success">
              Environment fallback sender active: {envSender.name} ({envSender.email})
            </MessageBar>
          ) : smtpConfigured ? (
            <MessageBar>
              Environment fallback is not configured. Active SMTP accounts from the
              database will be used.
            </MessageBar>
          ) : (
            <MessageBar intent={tableMissing ? "warning" : "info"}>
              No SMTP sender is configured yet (no active SMTP account and no
              environment fallback).
            </MessageBar>
          )}
        </Card>

        <Card className={styles.card}>
          <Text weight="semibold">{form.id ? "Edit SMTP account" : "New SMTP account"}</Text>

          {tableMissing ? (
            <MessageBar>
              SMTP account editor is disabled until{" "}
              <code>partner_email_smtp_accounts</code> is available.
            </MessageBar>
          ) : null}

          <fieldset
            disabled={smtpEditorDisabled}
            style={{ border: "none", margin: 0, padding: 0, minWidth: 0 }}
          >
            <div className={styles.row}>
              <Field label="Account name">
                <Input
                  value={form.name}
                  onChange={(_, data) => setForm((prev) => ({ ...prev, name: data.value }))}
                  placeholder="Partner mailbox"
                />
              </Field>
              <Field label="From email">
                <Input
                  value={form.fromEmail}
                  onChange={(_, data) => setForm((prev) => ({ ...prev, fromEmail: data.value }))}
                  placeholder="partner@nordexo.se"
                />
              </Field>
            </div>

            <div className={styles.row}>
              <Field label="From name">
                <Input
                  value={form.fromName}
                  onChange={(_, data) => setForm((prev) => ({ ...prev, fromName: data.value }))}
                  placeholder="Nordexo Partner"
                />
              </Field>
              <Field label="SMTP host">
                <Input
                  value={form.host}
                  onChange={(_, data) => setForm((prev) => ({ ...prev, host: data.value }))}
                  placeholder="mail.yourhost.com"
                />
              </Field>
            </div>

            <div className={styles.row}>
              <Field label="SMTP port">
                <Input
                  value={form.port}
                  onChange={(_, data) => setForm((prev) => ({ ...prev, port: data.value }))}
                  placeholder="587"
                />
              </Field>
              <Field label="SMTP user">
                <Input
                  value={form.user}
                  onChange={(_, data) => setForm((prev) => ({ ...prev, user: data.value }))}
                  placeholder="partner@nordexo.se"
                />
              </Field>
            </div>

            <Field
              label={
                selectedAccount?.hasPassword
                  ? "SMTP password (leave blank to keep current)"
                  : "SMTP password"
              }
            >
              <Input
                type="password"
                value={form.password}
                onChange={(_, data) => setForm((prev) => ({ ...prev, password: data.value }))}
                placeholder={selectedAccount?.hasPassword ? "••••••••" : "password"}
              />
            </Field>

            <div className={styles.actions}>
              <Switch
                checked={form.secure}
                onChange={(_, data) => setForm((prev) => ({ ...prev, secure: data.checked }))}
                label="Use SSL/TLS"
              />
              <Switch
                checked={form.isActive}
                onChange={(_, data) => setForm((prev) => ({ ...prev, isActive: data.checked }))}
                label="Account active"
              />
            </div>

            <div className={styles.actions}>
              <Button appearance="primary" onClick={saveAccount} disabled={isSaving || tableMissing}>
                {isSaving ? "Saving..." : form.id ? "Update" : "Create"}
              </Button>
              <Button appearance="secondary" onClick={resetForm}>
                New
              </Button>
              <Button
                appearance="secondary"
                onClick={deleteAccount}
                disabled={!form.id || isDeleting || tableMissing}
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </fieldset>

          {selectedAccount ? (
            <Text className={styles.helper}>
              Created: {formatDate(selectedAccount.createdAt)} · Updated: {formatDate(selectedAccount.updatedAt)}
            </Text>
          ) : null}
        </Card>
      </div>

      <Card className={styles.card}>
        <Text weight="semibold">SendPulse authenticated senders</Text>
        {sendpulseError ? (
          <MessageBar intent="warning">{sendpulseError}</MessageBar>
        ) : (
          <Text className={styles.helper}>
            Used for SendPulse API channel in automations and transactional mail flows.
          </Text>
        )}

        <div className={styles.tableWrap}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Email</TableHeaderCell>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sendpulseSenders.map((sender) => (
                <TableRow key={sender.email}>
                  <TableCell>{sender.email}</TableCell>
                  <TableCell>{sender.name || "-"}</TableCell>
                  <TableCell>{sender.status || "-"}</TableCell>
                </TableRow>
              ))}
              {sendpulseSenders.length === 0 ? (
                <TableRow>
                  <TableCell>No senders found</TableCell>
                  <TableCell>-</TableCell>
                  <TableCell>-</TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
