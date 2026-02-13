"use client";

import {
  Button,
  Card,
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
import { useI18n } from "@/components/i18n-provider";

type DeliveryBatch = {
  id: string;
  createdAt: string;
  itemCount: number;
  excelFileName: string;
  imagesZipFileName: string;
};

const useStyles = makeStyles({
  layout: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  header: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  title: {
    fontSize: tokens.fontSizeHero700,
    fontWeight: tokens.fontWeightSemibold,
  },
  subtitle: {
    color: tokens.colorNeutralForeground3,
  },
  tableCard: {
    padding: "16px",
    borderRadius: "var(--app-radius)",
  },
  fileActions: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
});

const PLACEHOLDER_BATCHES: DeliveryBatch[] = [
  {
    id: "batch-1",
    createdAt: "2026-02-12 08:15",
    itemCount: 24,
    excelFileName: "digideal_batch_20260212_0815.xlsx",
    imagesZipFileName: "digideal_batch_20260212_0815_images.zip",
  },
  {
    id: "batch-2",
    createdAt: "2026-02-11 19:42",
    itemCount: 16,
    excelFileName: "digideal_batch_20260211_1942.xlsx",
    imagesZipFileName: "digideal_batch_20260211_1942_images.zip",
  },
  {
    id: "batch-3",
    createdAt: "2026-02-10 13:06",
    itemCount: 31,
    excelFileName: "digideal_batch_20260210_1306.xlsx",
    imagesZipFileName: "digideal_batch_20260210_1306_images.zip",
  },
];

export default function DigiDealProductDeliveryPage() {
  const styles = useStyles();
  const { t } = useI18n();

  return (
    <div className={styles.layout}>
      <div className={styles.header}>
        <Text className={styles.title}>{t("digidealDelivery.title")}</Text>
        <Text className={styles.subtitle}>{t("digidealDelivery.subtitle")}</Text>
      </div>

      <Card className={styles.tableCard}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeaderCell>{t("digidealDelivery.table.createdAt")}</TableHeaderCell>
              <TableHeaderCell>{t("digidealDelivery.table.itemCount")}</TableHeaderCell>
              <TableHeaderCell>{t("digidealDelivery.table.downloads")}</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {PLACEHOLDER_BATCHES.map((batch) => (
              <TableRow key={batch.id}>
                <TableCell>{batch.createdAt}</TableCell>
                <TableCell>{batch.itemCount}</TableCell>
                <TableCell>
                  <div className={styles.fileActions}>
                    <Button as="a" href="#" appearance="outline" size="small">
                      {batch.excelFileName}
                    </Button>
                    <Button as="a" href="#" appearance="outline" size="small">
                      {batch.imagesZipFileName}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

