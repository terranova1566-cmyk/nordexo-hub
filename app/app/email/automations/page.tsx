"use client";

import {
  Button,
  Card,
  Checkbox,
  Combobox,
  Dropdown,
  Field,
  Input,
  MessageBar,
  Option,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  mergeClasses,
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

type AutomationRule = {
  id: string;
  salesChannelId: string;
  templateId: string;
  templateQuery: string;
  senderEmail: string;
  subject: string;
  deliveryTime: string;
  includeTracking: boolean;
  includeOrderNumber: boolean;
  includeDeliveryTime: boolean;
};

const STORAGE_KEY = "emailAutomationRules";

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
  helper: {
    color: tokens.colorNeutralForeground3,
  },
  card: {
    padding: "18px",
    borderRadius: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap",
  },
  actionsRow: {
    display: "flex",
    gap: "12px",
    alignItems: "center",
    flexWrap: "wrap",
  },
  table: {
    borderRadius: "12px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    overflow: "hidden",
  },
  columnHeader: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightRegular,
  },
  rowCell: {
    verticalAlign: "top",
    paddingTop: "10px",
    paddingBottom: "10px",
  },
  stackedCell: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  comboField: {
    minWidth: "180px",
  },
  subjectField: {
    minWidth: "220px",
  },
  variablesCell: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  inlineCheckbox: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  subjectHelper: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    lineHeight: "1.4",
  },
  variableList: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  removeButton: {
    backgroundColor: tokens.colorNeutralBackground1,
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground2,
    },
  },
  emptyText: {
    color: tokens.colorNeutralForeground3,
  },
});

const salesChannelOptions = [
  { value: "SK-SE", label: "email.automations.salesChannel.SK_SE" },
  { value: "OF-FI", label: "email.automations.salesChannel.OF_FI" },
  { value: "LD-SE", label: "email.automations.salesChannel.LD_SE" },
  { value: "LD-NO", label: "email.automations.salesChannel.LD_NO" },
  { value: "DI-SE", label: "email.automations.salesChannel.DI_SE" },
  { value: "TI-SE", label: "email.automations.salesChannel.TI_SE" },
  { value: "WL-SE", label: "email.automations.salesChannel.WL_SE" },
];

const createRule = (): AutomationRule => {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `rule-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return {
    id,
    salesChannelId: "",
    templateId: "",
    templateQuery: "",
    senderEmail: "",
    subject: "",
    deliveryTime: "",
    includeTracking: true,
    includeOrderNumber: true,
    includeDeliveryTime: false,
  };
};

export default function EmailAutomationsPage() {
  const styles = useStyles();
  const { t } = useI18n();
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [senders, setSenders] = useState<SenderOption[]>([]);
  const [rules, setRules] = useState<AutomationRule[]>([createRule()]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [isLoadingSenders, setIsLoadingSenders] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as AutomationRule[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        setRules(
          parsed.map((rule) => {
            const base = createRule();
            const legacyRule = rule as AutomationRule & {
              marketplace?: string;
              includeCustomerOrder?: boolean;
              includeUpick?: boolean;
            };
            const normalizedChannel =
              rule.salesChannelId === "any" ? "" : rule.salesChannelId;
            return {
              ...base,
              ...rule,
              id: rule.id || base.id,
              salesChannelId:
                normalizedChannel ??
                legacyRule.marketplace ??
                base.salesChannelId,
              includeOrderNumber:
                legacyRule.includeCustomerOrder ??
                rule.includeOrderNumber ??
                base.includeOrderNumber,
              deliveryTime: rule.deliveryTime ?? "",
              includeDeliveryTime:
                rule.includeDeliveryTime ?? base.includeDeliveryTime,
            };
          })
        );
      }
    } catch {
      return;
    }
  }, []);

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

  useEffect(() => {
    if (templates.length === 0) return;
    setRules((prev) =>
      prev.map((rule) => {
        if (rule.templateId && !rule.templateQuery) {
          const match = templates.find((item) => item.id === rule.templateId);
          return { ...rule, templateQuery: match?.name ?? "" };
        }
        return rule;
      })
    );
  }, [templates]);

  const updateRule = (id: string, patch: Partial<AutomationRule>) => {
    setRules((prev) => prev.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)));
  };

  const addRule = () => {
    setRules((prev) => [...prev, createRule()]);
  };

  const removeRule = (id: string) => {
    setRules((prev) => prev.filter((rule) => rule.id !== id));
  };

  const saveRules = () => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
      }
      setMessage({ type: "success", text: t("email.automations.actions.saved") });
    } catch (error) {
      setMessage({
        type: "error",
        text: (error as Error).message || t("email.automations.actions.error"),
      });
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Text size={700} weight="semibold">
          {t("email.automations.title")}
        </Text>
        <Text size={300} className={styles.helper}>
          {t("email.automations.subtitle")}
        </Text>
      </div>

      <Card className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <Text size={500} weight="semibold">
              {t("email.automations.section.orderDelivery")}
            </Text>
            <Text size={200} className={styles.helper}>
              {t("email.automations.section.helper")}
            </Text>
          </div>
          <div className={styles.actionsRow}>
            <Button appearance="outline" onClick={addRule}>
              {t("email.automations.actions.addRow")}
            </Button>
            <Button appearance="primary" onClick={saveRules}>
              {t("email.automations.actions.save")}
            </Button>
          </div>
        </div>

        {message ? (
          <MessageBar intent={message.type}>{message.text}</MessageBar>
        ) : null}

        {rules.length === 0 ? (
          <Text size={200} className={styles.emptyText}>
            {t("email.automations.empty")}
          </Text>
        ) : (
          <Table size="small" className={styles.table}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell className={styles.columnHeader}>
                  {t("email.automations.columns.channelTemplate")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.columnHeader}>
                  {t("email.automations.columns.sender")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.columnHeader}>
                  {t("email.automations.columns.subjectDelivery")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.columnHeader}>
                  {t("email.automations.columns.placeholders")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.columnHeader}>
                  {t("email.automations.columns.variables")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.columnHeader}>
                  {t("email.automations.columns.actions")}
                </TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => {
                const filteredTemplates = (() => {
                  const query = rule.templateQuery.trim().toLowerCase();
                  if (!query) return templates;
                  return templates.filter((template) =>
                    template.name.toLowerCase().includes(query)
                  );
                })();

                return (
                  <TableRow key={rule.id}>
                    <TableCell className={mergeClasses(styles.rowCell, styles.stackedCell)}>
                      <Field className={styles.comboField}>
                        <Dropdown
                          value={rule.salesChannelId || ""}
                          selectedOptions={
                            rule.salesChannelId ? [rule.salesChannelId] : []
                          }
                          placeholder={t("email.automations.salesChannel.placeholder")}
                          onOptionSelect={(_, data) =>
                            updateRule(rule.id, {
                              salesChannelId: String(data.optionValue ?? ""),
                            })
                          }
                        >
                          {salesChannelOptions.map((option) => (
                            <Option key={option.value} value={option.value}>
                              {option.label.startsWith("email.")
                                ? t(option.label)
                                : option.label}
                            </Option>
                          ))}
                        </Dropdown>
                      </Field>
                      <Field className={styles.comboField}>
                        <Combobox
                          value={rule.templateQuery}
                          placeholder={
                            isLoadingTemplates
                              ? t("email.templates.loading")
                              : t("email.template.placeholder")
                          }
                          onInput={(event) =>
                            updateRule(rule.id, {
                              templateQuery: event.currentTarget.value,
                            })
                          }
                          onOptionSelect={(_, data) => {
                            const value = String(data.optionValue ?? "");
                            const template = templates.find(
                              (item) => item.id === value
                            );
                            updateRule(rule.id, {
                              templateId: value,
                              templateQuery: template?.name ?? "",
                            });
                          }}
                        >
                          {filteredTemplates.map((template) => (
                            <Option key={template.id} value={template.id}>
                              {template.name}
                            </Option>
                          ))}
                        </Combobox>
                      </Field>
                    </TableCell>
                    <TableCell className={styles.rowCell}>
                      <Field className={styles.comboField}>
                        <Dropdown
                          value={
                            rule.senderEmail ||
                            (isLoadingSenders ? t("email.senders.loading") : "")
                          }
                          selectedOptions={
                            rule.senderEmail ? [rule.senderEmail] : []
                          }
                          placeholder={t("email.sender.placeholder")}
                          onOptionSelect={(_, data) =>
                            updateRule(rule.id, {
                              senderEmail: String(data.optionValue ?? ""),
                            })
                          }
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
                    </TableCell>
                    <TableCell
                      className={mergeClasses(styles.rowCell, styles.stackedCell)}
                    >
                      <div>
                        <Field className={styles.subjectField}>
                          <Input
                            value={rule.subject}
                            placeholder={t("email.subject.placeholder")}
                            onChange={(_, data) =>
                              updateRule(rule.id, { subject: data.value })
                            }
                          />
                        </Field>
                      </div>
                      <Field className={styles.subjectField}>
                        <Input
                          value={rule.deliveryTime}
                          placeholder={t("email.automations.delivery.placeholder")}
                          disabled={!rule.includeDeliveryTime}
                          onChange={(_, data) =>
                            updateRule(rule.id, { deliveryTime: data.value })
                          }
                        />
                      </Field>
                    </TableCell>
                    <TableCell className={styles.rowCell}>
                      <div className={styles.variableList}>
                        <Text className={styles.subjectHelper}>
                          {"{order_number}"}
                        </Text>
                        <Text className={styles.subjectHelper}>
                          {"{tracking_number}"}
                        </Text>
                        <Text className={styles.subjectHelper}>
                          {"{delivery_time}"}
                        </Text>
                      </div>
                    </TableCell>
                    <TableCell className={styles.rowCell}>
                      <div className={styles.variablesCell}>
                        <Checkbox
                          className={styles.inlineCheckbox}
                          label={t("email.automations.variables.tracking")}
                          checked={rule.includeTracking}
                          onChange={(_, data) =>
                            updateRule(rule.id, {
                              includeTracking: Boolean(data.checked),
                            })
                          }
                        />
                        <Checkbox
                          className={styles.inlineCheckbox}
                          label={t("email.automations.variables.orderNumber")}
                          checked={rule.includeOrderNumber}
                          onChange={(_, data) =>
                            updateRule(rule.id, {
                              includeOrderNumber: Boolean(data.checked),
                            })
                          }
                        />
                        <Checkbox
                          className={styles.inlineCheckbox}
                          label={t("email.automations.variables.deliveryTime")}
                          checked={rule.includeDeliveryTime}
                          onChange={(_, data) =>
                            updateRule(rule.id, {
                              includeDeliveryTime: Boolean(data.checked),
                            })
                          }
                        />
                      </div>
                    </TableCell>
                    <TableCell className={styles.rowCell}>
                      <Button
                        appearance="outline"
                        className={styles.removeButton}
                        onClick={() => removeRule(rule.id)}
                      >
                        {t("email.automations.actions.remove")}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
