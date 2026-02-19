"use client";

import {
  Button,
  Card,
  Dropdown,
  Field,
  Input,
  MessageBar,
  Option,
  Spinner,
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
import { useEffect, useMemo, useState } from "react";

type TemplateOption = {
  template_id: string;
  name: string;
  description?: string | null;
  macros?: string[];
};

type SenderOption = {
  id?: string;
  email: string;
  name?: string | null;
  status?: string | null;
  channel?: string | null;
  source?: string | null;
};

type VariableRow = {
  key: string;
  value: string;
};

const useStyles = makeStyles({
  page: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  header: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  formCard: {
    padding: "18px",
    borderRadius: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  row: {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
    alignItems: "flex-end",
  },
  grow: {
    flex: 1,
    minWidth: "240px",
  },
  helper: {
    color: tokens.colorNeutralForeground3,
  },
  variableRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
    alignItems: "flex-end",
  },
  variableTable: {
    borderRadius: "10px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    overflow: "hidden",
  },
  actionsRow: {
    display: "flex",
    gap: "12px",
    alignItems: "center",
  },
  status: {
    fontSize: tokens.fontSizeBase200,
  },
});

export default function ManualEmailSenderPage() {
  const styles = useStyles();
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [senders, setSenders] = useState<SenderOption[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [selectedSender, setSelectedSender] = useState<string>("");
  const [toValue, setToValue] = useState("");
  const [subject, setSubject] = useState("");
  const [variables, setVariables] = useState<VariableRow[]>([]);
  const [variableKey, setVariableKey] = useState("");
  const [variableValue, setVariableValue] = useState("");
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [isLoadingSenders, setIsLoadingSenders] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );

  useEffect(() => {
    const loadTemplates = async () => {
      setIsLoadingTemplates(true);
      try {
        const response = await fetch("/api/email/templates");
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error || "Unable to load templates.");
        }
        const nextTemplates = payload.templates ?? [];
        setTemplates(nextTemplates);
        if (!selectedTemplateId && nextTemplates.length > 0) {
          setSelectedTemplateId(nextTemplates[0].template_id);
        }
      } catch (error) {
        setMessage({ type: "error", text: (error as Error).message });
      } finally {
        setIsLoadingTemplates(false);
      }
    };

    const loadSenders = async () => {
      setIsLoadingSenders(true);
      try {
        const response = await fetch("/api/email/senders");
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error || "Unable to load senders.");
        }
        const nextSenders = payload.senders ?? [];
        setSenders(nextSenders);
        setSelectedSender((prev) => {
          if (prev) return prev;
          const first = nextSenders[0];
          return first ? String(first.id ?? first.email) : "";
        });
      } catch (error) {
        setMessage({ type: "error", text: (error as Error).message });
      } finally {
        setIsLoadingSenders(false);
      }
    };

    loadTemplates();
    loadSenders();
  }, []);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.template_id === selectedTemplateId),
    [templates, selectedTemplateId]
  );

  const selectedSenderOption = useMemo(
    () =>
      senders.find(
        (sender) => String(sender.id ?? sender.email) === selectedSender
      ) ?? null,
    [senders, selectedSender]
  );

  const addVariable = () => {
    if (!variableKey.trim()) return;
    setVariables((prev) => {
      const filtered = prev.filter((entry) => entry.key !== variableKey.trim());
      return [...filtered, { key: variableKey.trim(), value: variableValue.trim() }];
    });
    setVariableKey("");
    setVariableValue("");
  };

  const removeVariable = (key: string) => {
    setVariables((prev) => prev.filter((row) => row.key !== key));
  };

  const setMacroKey = (macro: string) => {
    setVariableKey(macro);
  };

  const handleSend = async () => {
    setIsSending(true);
    setMessage(null);

    try {
      const payload = {
        to: toValue,
        subject,
        templateId: selectedTemplateId,
        senderId: selectedSenderOption?.id || undefined,
        senderEmail: selectedSenderOption?.email || "",
        variables: variables.reduce<Record<string, string>>((acc, row) => {
          acc[row.key] = row.value;
          return acc;
        }, {}),
      };
      const response = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || "Unable to send email.");
      }
      setMessage({ type: "success", text: "Email sent." });
      setToValue("");
      setSubject("");
      setVariables([]);
      setVariableKey("");
      setVariableValue("");
    } catch (error) {
      setMessage({ type: "error", text: (error as Error).message });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Text size={700} weight="semibold">
          Send partner email
        </Text>
        <Text size={300} className={styles.helper}>
          Send low-volume partner updates using internal templates and MXRoute SMTP.
        </Text>
      </div>

      <Card className={styles.formCard}>
        {message ? <MessageBar intent={message.type}>{message.text}</MessageBar> : null}

        <div className={styles.row}>
          <Field label="To" className={styles.grow}>
            <Input
              value={toValue}
              onChange={(_, data) => setToValue(data.value)}
              placeholder="email1@example.com, email2@example.com"
            />
          </Field>
          <Field label="Subject override (optional)" className={styles.grow}>
            <Input
              value={subject}
              onChange={(_, data) => setSubject(data.value)}
              placeholder="Leave empty to use template subject"
            />
          </Field>
        </div>

        <div className={styles.row}>
          <Field label="Template" className={styles.grow}>
            <Dropdown
              value={
                selectedTemplate
                  ? `${selectedTemplate.name} (${selectedTemplate.template_id})`
                  : isLoadingTemplates
                    ? "Loading templates..."
                    : ""
              }
              selectedOptions={selectedTemplateId ? [selectedTemplateId] : []}
              placeholder="Select template"
              onOptionSelect={(_, data) => setSelectedTemplateId(String(data.optionValue))}
            >
              {templates.map((template) => (
                <Option
                  key={template.template_id}
                  value={template.template_id}
                  text={`${template.name} (${template.template_id})`}
                >
                  {template.name} ({template.template_id})
                </Option>
              ))}
            </Dropdown>
          </Field>
          <Field label="Sender" className={styles.grow}>
            <Dropdown
              value={
                selectedSenderOption
                  ? selectedSenderOption.name
                    ? `${selectedSenderOption.name} (${selectedSenderOption.email})`
                    : selectedSenderOption.email
                  : isLoadingSenders
                    ? "Loading senders..."
                    : ""
              }
              selectedOptions={selectedSender ? [selectedSender] : []}
              placeholder="Select sender"
              onOptionSelect={(_, data) => setSelectedSender(String(data.optionValue))}
            >
              {senders.map((sender) => (
                <Option
                  key={String(sender.id ?? sender.email)}
                  value={String(sender.id ?? sender.email)}
                  text={sender.name ? `${sender.name} (${sender.email})` : sender.email}
                >
                  {sender.name ? `${sender.name} (${sender.email})` : sender.email}
                </Option>
              ))}
            </Dropdown>
          </Field>
        </div>

        {isLoadingTemplates || isLoadingSenders ? <Spinner label="Loading" /> : null}
        {!isLoadingSenders && senders.length === 0 ? (
          <MessageBar intent="warning">
            No SMTP sender is configured. Add one under Email settings.
          </MessageBar>
        ) : null}

        <div>
          <Text weight="semibold">Template variables</Text>
          <Text size={200} className={styles.helper}>
            Use keys like partner_name, products_csv_url, top_sellers_url, date_range,
            PARTNER_CONTACT_NAME.
          </Text>
          {selectedTemplate?.macros?.length ? (
            <Text size={200} className={styles.helper}>
              Suggested macros: {selectedTemplate.macros.join(", ")}
            </Text>
          ) : null}
        </div>

        <div className={styles.variableRow}>
          <Field label="Key">
            <Input
              value={variableKey}
              onChange={(_, data) => setVariableKey(data.value)}
              placeholder="partner_name"
            />
          </Field>
          <Field label="Value" className={styles.grow}>
            <Input
              value={variableValue}
              onChange={(_, data) => setVariableValue(data.value)}
              placeholder="Nordexo Partner"
            />
          </Field>
          <Button appearance="secondary" onClick={addVariable}>
            Add variable
          </Button>
        </div>

        {selectedTemplate?.macros?.length ? (
          <div className={styles.actionsRow}>
            {selectedTemplate.macros.map((macro) => (
              <Button
                key={macro}
                size="small"
                appearance="subtle"
                onClick={() => setMacroKey(macro)}
              >
                + {macro}
              </Button>
            ))}
          </div>
        ) : null}

        <div className={styles.variableTable}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Key</TableHeaderCell>
                <TableHeaderCell>Value</TableHeaderCell>
                <TableHeaderCell>Actions</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {variables.length === 0 ? (
                <TableRow>
                  <TableCell>No variables added.</TableCell>
                  <TableCell>-</TableCell>
                  <TableCell>-</TableCell>
                </TableRow>
              ) : (
                variables.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell>{row.key}</TableCell>
                    <TableCell>{row.value || "-"}</TableCell>
                    <TableCell>
                      <Button appearance="subtle" onClick={() => removeVariable(row.key)}>
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className={styles.actionsRow}>
          <Button
            appearance="primary"
            onClick={handleSend}
            disabled={
              isSending || !toValue.trim() || !selectedTemplateId || !selectedSenderOption
            }
          >
            {isSending ? "Sending..." : "Send email"}
          </Button>
          <Text className={styles.status}>Template: {selectedTemplateId || "-"}</Text>
        </div>
      </Card>
    </div>
  );
}
