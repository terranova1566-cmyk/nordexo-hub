"use client";

import {
  Button,
  Card,
  Combobox,
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
import { useI18n } from "@/components/i18n-provider";

type TemplateOption = {
  id: string;
  name: string;
};

type SenderOption = {
  email: string;
  name?: string | null;
  status?: string | null;
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
  errorText: {
    color: tokens.colorStatusDangerForeground1,
  },
});

export default function ManualEmailSenderPage() {
  const styles = useStyles();
  const { t } = useI18n();
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [senders, setSenders] = useState<SenderOption[]>([]);
  const [templateQuery, setTemplateQuery] = useState("");
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
        const response = await fetch("/api/sendpulse/templates");
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || "Unable to load templates.");
        }
        const payload = await response.json();
        setTemplates(payload.templates ?? []);
      } catch (error) {
        setMessage({
          type: "error",
          text: (error as Error).message || t("email.templates.error"),
        });
      } finally {
        setIsLoadingTemplates(false);
      }
    };

    const loadSenders = async () => {
      setIsLoadingSenders(true);
      try {
        const response = await fetch("/api/sendpulse/senders");
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || "Unable to load senders.");
        }
        const payload = await response.json();
        setSenders(payload.senders ?? []);
      } catch (error) {
        setMessage({
          type: "error",
          text: (error as Error).message || t("email.senders.error"),
        });
      } finally {
        setIsLoadingSenders(false);
      }
    };

    loadTemplates();
    loadSenders();
  }, [t]);

  const filteredTemplates = useMemo(() => {
    const query = templateQuery.trim().toLowerCase();
    if (!query) return templates;
    return templates.filter((template) =>
      template.name.toLowerCase().includes(query)
    );
  }, [templates, templateQuery]);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId),
    [templates, selectedTemplateId]
  );

  const addVariable = () => {
    if (!variableKey.trim()) return;
    setVariables((prev) => [
      ...prev,
      { key: variableKey.trim(), value: variableValue.trim() },
    ]);
    setVariableKey("");
    setVariableValue("");
  };

  const removeVariable = (key: string) => {
    setVariables((prev) => prev.filter((row) => row.key !== key));
  };

  const handleSend = async () => {
    setIsSending(true);
    setMessage(null);
    try {
      const payload = {
        to: toValue,
        subject,
        templateId: selectedTemplateId,
        senderEmail: selectedSender,
        variables: variables.reduce<Record<string, string>>((acc, row) => {
          acc[row.key] = row.value;
          return acc;
        }, {}),
      };
      const response = await fetch("/api/sendpulse/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || t("email.sendError"));
      }
      setMessage({ type: "success", text: t("email.sendSuccess") });
      setToValue("");
      setSubject("");
      setVariables([]);
      setVariableKey("");
      setVariableValue("");
    } catch (error) {
      setMessage({
        type: "error",
        text: (error as Error).message || t("email.sendError"),
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Text size={700} weight="semibold">
          {t("email.title")}
        </Text>
        <Text size={300} className={styles.helper}>
          {t("email.subtitle")}
        </Text>
      </div>

      <Card className={styles.formCard}>
        {message ? (
          <MessageBar intent={message.type}>{message.text}</MessageBar>
        ) : null}

        <div className={styles.row}>
          <Field label={t("email.to.label")} className={styles.grow}>
            <Input
              value={toValue}
              onChange={(_, data) => setToValue(data.value)}
              placeholder={t("email.to.placeholder")}
            />
          </Field>
          <Field label={t("email.subject.label")} className={styles.grow}>
            <Input
              value={subject}
              onChange={(_, data) => setSubject(data.value)}
              placeholder={t("email.subject.placeholder")}
            />
          </Field>
        </div>

        <div className={styles.row}>
          <Field label={t("email.template.label")} className={styles.grow}>
            <Combobox
              value={templateQuery}
              placeholder={
                isLoadingTemplates
                  ? t("email.templates.loading")
                  : t("email.template.placeholder")
              }
              onInput={(event) => setTemplateQuery(event.currentTarget.value)}
              onOptionSelect={(_, data) => {
                const value = String(data.optionValue ?? "");
                setSelectedTemplateId(value);
                const template = templates.find((item) => item.id === value);
                setTemplateQuery(template?.name ?? "");
              }}
            >
              {filteredTemplates.map((template) => (
                <Option key={template.id} value={template.id}>
                  {template.name}
                </Option>
              ))}
            </Combobox>
          </Field>
          <Field label={t("email.sender.label")} className={styles.grow}>
            <Dropdown
              value={
                selectedSender ||
                (isLoadingSenders ? t("email.senders.loading") : "")
              }
              selectedOptions={selectedSender ? [selectedSender] : []}
              placeholder={t("email.sender.placeholder")}
              onOptionSelect={(_, data) => setSelectedSender(String(data.optionValue))}
            >
              {senders.map((sender) => (
                <Option key={sender.email} value={sender.email}>
                  {sender.name
                    ? `${sender.name} (${sender.email})`
                    : sender.email}
                </Option>
              ))}
            </Dropdown>
          </Field>
        </div>

        <div>
          <Text weight="semibold">{t("email.variables.title")}</Text>
          <Text size={200} className={styles.helper}>
            {t("email.variables.helper")}
          </Text>
        </div>

        <div className={styles.variableRow}>
          <Field label={t("email.variables.key")}>
            <Input
              value={variableKey}
              onChange={(_, data) => setVariableKey(data.value)}
              placeholder={t("email.variables.keyPlaceholder")}
            />
          </Field>
          <Field label={t("email.variables.value")}>
            <Input
              value={variableValue}
              onChange={(_, data) => setVariableValue(data.value)}
              placeholder={t("email.variables.valuePlaceholder")}
            />
          </Field>
          <Button appearance="outline" onClick={addVariable}>
            {t("email.variables.add")}
          </Button>
        </div>

        {variables.length > 0 ? (
          <div className={styles.variableTable}>
            <Table size="small">
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>{t("email.variables.key")}</TableHeaderCell>
                  <TableHeaderCell>{t("email.variables.value")}</TableHeaderCell>
                  <TableHeaderCell>{t("email.variables.actions")}</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {variables.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell>{row.key}</TableCell>
                    <TableCell>{row.value}</TableCell>
                    <TableCell>
                      <Button
                        appearance="subtle"
                        onClick={() => removeVariable(row.key)}
                      >
                        {t("email.variables.remove")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <Text size={200} className={styles.helper}>
            {t("email.variables.empty")}
          </Text>
        )}

        <div className={styles.actionsRow}>
          <Button
            appearance="primary"
            onClick={handleSend}
            disabled={isSending}
          >
            {isSending ? <Spinner size="tiny" /> : t("email.send")}
          </Button>
          {selectedTemplate ? (
            <Text size={200} className={styles.helper}>
              {t("email.template.selected")} {selectedTemplate.name}
            </Text>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
