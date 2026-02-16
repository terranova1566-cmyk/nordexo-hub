export type MarginInput = {
  marginPercent: number;
  marginFixed: number;
};

export type PriceComputationInput = {
  currency: string;
  exchangeRateCny: number;
  unitCostCny: number | null;
  brandingCostsCny?: unknown;
  packagingCostsCny?: unknown;
  margin: MarginInput;
};

export type PriceComputation = {
  ok: true;
  currency: string;
  exchangeRateCny: number;
  baseUnitCostCny: number;
  extraUnitCostsCny: number;
  totalUnitCostCny: number;
  totalUnitCostCustomer: number;
  marginPercent: number;
  marginFixed: number;
  customerUnitPrice: number;
} | {
  ok: false;
  error: string;
};

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const sumJsonNumbers = (value: unknown): number => {
  if (value === null || value === undefined) return 0;
  const direct = toFiniteNumber(value);
  if (direct !== null) return direct;
  if (Array.isArray(value)) {
    return value.reduce((acc, entry) => acc + sumJsonNumbers(entry), 0);
  }
  if (typeof value === "object") {
    let acc = 0;
    Object.values(value as Record<string, unknown>).forEach((entry) => {
      acc += sumJsonNumbers(entry);
    });
    return acc;
  }
  return 0;
};

export const computeCustomerUnitPrice = (
  input: PriceComputationInput
): PriceComputation => {
  const exchangeRateCny = Number(input.exchangeRateCny);
  if (!Number.isFinite(exchangeRateCny) || exchangeRateCny <= 0) {
    return { ok: false, error: "Missing/invalid exchange rate." };
  }

  const unitCostCny =
    input.unitCostCny === null || input.unitCostCny === undefined
      ? null
      : Number(input.unitCostCny);
  if (unitCostCny === null || !Number.isFinite(unitCostCny) || unitCostCny < 0) {
    return { ok: false, error: "Missing/invalid unit cost (CNY)." };
  }

  const marginPercent = Math.max(0, Number(input.margin.marginPercent) || 0);
  const marginFixed = Math.max(0, Number(input.margin.marginFixed) || 0);

  const brandingCostsCny = sumJsonNumbers(input.brandingCostsCny);
  const packagingCostsCny = sumJsonNumbers(input.packagingCostsCny);
  const extraUnitCostsCny = brandingCostsCny + packagingCostsCny;

  const totalUnitCostCny = unitCostCny + extraUnitCostsCny;
  const totalUnitCostCustomer = totalUnitCostCny * exchangeRateCny;
  const customerUnitPrice =
    totalUnitCostCustomer * (1 + marginPercent / 100) + marginFixed;

  return {
    ok: true,
    currency: input.currency,
    exchangeRateCny,
    baseUnitCostCny: unitCostCny,
    extraUnitCostsCny,
    totalUnitCostCny,
    totalUnitCostCustomer,
    marginPercent,
    marginFixed,
    customerUnitPrice,
  };
};

