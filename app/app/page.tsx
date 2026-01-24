"use client";

import { Card, Text, Title2, makeStyles, tokens } from "@fluentui/react-components";
import { useI18n } from "@/components/i18n-provider";

const useStyles = makeStyles({
  card: {
    padding: "24px",
    borderRadius: "var(--app-radius)",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    backgroundColor: tokens.colorNeutralBackground1,
  },
  subtitle: {
    color: tokens.colorNeutralForeground3,
    whiteSpace: "pre-line",
  },
});

export default function LandingPage() {
  const styles = useStyles();
  const { t } = useI18n();

  return (
    <Card className={styles.card}>
      <Title2>{t("home.title")}</Title2>
      <Text className={styles.subtitle}>{t("home.subtitle")}</Text>
    </Card>
  );
}
