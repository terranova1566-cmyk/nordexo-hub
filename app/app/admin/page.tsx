"use client";

import {
  Card,
  MessageBar,
  Spinner,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { useEffect, useState } from "react";

const useStyles = makeStyles({
  page: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  heading: {
    fontWeight: tokens.fontWeightSemibold,
  },
  card: {
    padding: "16px",
    borderRadius: "var(--app-radius)",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  iframeWrap: {
    borderRadius: "12px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    overflow: "hidden",
    backgroundColor: tokens.colorNeutralBackground1,
    minHeight: "72vh",
    height: "72vh",
  },
  iframe: {
    width: "100%",
    height: "100%",
    border: "0",
    display: "block",
    backgroundColor: tokens.colorNeutralBackground1,
  },
});

export default function AdminPage() {
  const styles = useStyles();
  const [isAdminUser, setIsAdminUser] = useState<boolean | null>(null);
  const fileExplorerEmbedPath =
    process.env.NEXT_PUBLIC_FILE_EXPLORER_EMBED_PATH ?? "/app/filegator";

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      try {
        const response = await fetch("/api/settings/profile", {
          cache: "no-store",
        });
        if (!response.ok) {
          if (active) setIsAdminUser(false);
          return;
        }
        const payload = (await response.json().catch(() => null)) as
          | { is_admin?: boolean }
          | null;
        if (active) {
          setIsAdminUser(Boolean(payload?.is_admin));
        }
      } catch {
        if (active) setIsAdminUser(false);
      }
    };

    loadProfile();

    return () => {
      active = false;
    };
  }, []);

  if (isAdminUser === null) {
    return (
      <div className={styles.page}>
        <Card className={styles.card}>
          <Spinner label="Loading file explorer" />
        </Card>
      </div>
    );
  }

  if (!isAdminUser) {
    return (
      <div className={styles.page}>
        <Card className={styles.card}>
          <MessageBar intent="error">
            You do not have permission to access this area.
          </MessageBar>
        </Card>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Card className={styles.card}>
        <Text className={styles.heading} size={500}>
          File Explorer
        </Text>
        <div className={styles.iframeWrap}>
          <iframe
            title="File Explorer"
            src={fileExplorerEmbedPath}
            className={styles.iframe}
            allow="clipboard-read; clipboard-write"
          />
        </div>
      </Card>
    </div>
  );
}
