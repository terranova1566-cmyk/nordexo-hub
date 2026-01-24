"use client";

import {
  Button,
  Card,
  Field,
  Image,
  Input,
  MessageBar,
  Spinner,
  Text,
  Title1,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/components/i18n-provider";

const useStyles = makeStyles({
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: "24px",
  },
  card: {
    width: "min(480px, 100%)",
    padding: "32px",
    borderRadius: "var(--app-radius)",
    boxShadow: "var(--app-shadow)",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
    backgroundColor: tokens.colorNeutralBackground1,
  },
  header: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  logoWrap: {
    display: "flex",
    alignItems: "center",
    marginBottom: "8px",
  },
  logo: {
    height: "40px",
    width: "auto",
    objectFit: "contain",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  actions: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  footer: {
    color: tokens.colorNeutralForeground3,
  },
});

function LoginForm() {
  const styles = useStyles();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const redirectedFrom = searchParams.get("redirectedFrom");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setIsLoading(false);
      return;
    }

    router.push("/app");
  };

  return (
    <div className={styles.page}>
      <Card className={styles.card}>
        <div className={styles.header}>
          <div className={styles.logoWrap}>
            <Image
              src="/brand/LogoFull.png"
              alt={t("app.brand")}
              className={styles.logo}
            />
          </div>
          <Title1>{t("auth.title")}</Title1>
          <Text size={300}>
            {t("auth.subtitle")}
          </Text>
        </div>

        {redirectedFrom ? (
          <MessageBar>
            {t("auth.sessionExpired")}
          </MessageBar>
        ) : null}

        {error ? <MessageBar intent="error">{error}</MessageBar> : null}

        <form className={styles.form} onSubmit={handleSubmit}>
          <Field label={t("auth.emailLabel")} required>
            <Input
              type="email"
              value={email}
              onChange={(_, data) => setEmail(data.value)}
              placeholder={t("auth.emailPlaceholder")}
            />
          </Field>

          <Field label={t("auth.passwordLabel")} required>
            <Input
              type="password"
              value={password}
              onChange={(_, data) => setPassword(data.value)}
            />
          </Field>

          <div className={styles.actions}>
            <Button appearance="primary" type="submit" disabled={isLoading}>
              {isLoading ? t("auth.signingIn") : t("auth.signIn")}
            </Button>
            <Text size={200} className={styles.footer}>
              {t("auth.accessRestricted")}
            </Text>
          </div>
        </form>
      </Card>
    </div>
  );
}

function LoginFallback() {
  const { t } = useI18n();
  return <Spinner label={t("auth.loadingLogin")} />;
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </Suspense>
  );
}
