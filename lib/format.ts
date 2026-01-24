export function formatDate(value?: string | number | null) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && value === 0) return "";
  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized || normalized === "0") return "";
    if (normalized.toLowerCase() === "n/a") return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDateTime(value?: string | number | null) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && value === 0) return "";
  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized || normalized === "0") return "";
    if (normalized.toLowerCase() === "n/a") return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

export function formatCurrency(value?: number | string | null, currency = "SEK") {
  if (value === null || value === undefined || value === "") return "";
  const numeric = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(numeric)) return "";
  if (numeric === 0) return "";
  const normalizedCurrency = currency.toUpperCase();
  const useDecimals = normalizedCurrency === "EUR";
  const maximumFractionDigits = useDecimals ? 2 : 0;
  const minimumFractionDigits = useDecimals ? 0 : 0;
  return new Intl.NumberFormat("en-SE", {
    style: "currency",
    currency,
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(numeric);
}
