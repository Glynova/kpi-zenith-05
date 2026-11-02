// Philippine tax computation strategies (BIR CAS Phase 1).
// Each strategy turns a gross line amount into a VAT breakdown so receipts,
// sale headers and tax ledgers all use one formula.

export type TaxBreakdown = {
  gross: number; // amount before statutory discount, as entered
  vatable_sales: number; // net of VAT
  vat_amount: number;
  vat_exempt_sales: number;
  zero_rated_sales: number;
  statutory_discount: number; // SC/PWD discount
  total: number; // amount payable
};

export type TaxStrategyKind =
  | "vat_inclusive"
  | "vat_exclusive"
  | "vat_exempt"
  | "zero_rated"
  | "sc_pwd";

export const PH_VAT_RATE = 12;
export const SC_PWD_DISCOUNT_RATE = 20;

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const empty = (gross: number): TaxBreakdown => ({
  gross: r2(gross),
  vatable_sales: 0,
  vat_amount: 0,
  vat_exempt_sales: 0,
  zero_rated_sales: 0,
  statutory_discount: 0,
  total: 0,
});

export interface TaxStrategy {
  kind: TaxStrategyKind;
  compute(gross: number, vatRate?: number): TaxBreakdown;
}

export const VatInclusive: TaxStrategy = {
  kind: "vat_inclusive",
  compute(gross, vatRate = PH_VAT_RATE) {
    const net = gross / (1 + vatRate / 100);
    const vat = r2(gross - net);
    return { ...empty(gross), vatable_sales: r2(gross - vat), vat_amount: vat, total: r2(gross) };
  },
};

export const VatExclusive: TaxStrategy = {
  kind: "vat_exclusive",
  compute(gross, vatRate = PH_VAT_RATE) {
    const vat = r2((gross * vatRate) / 100);
    return { ...empty(gross), vatable_sales: r2(gross), vat_amount: vat, total: r2(gross + vat) };
  },
};

export const VatExempt: TaxStrategy = {
  kind: "vat_exempt",
  compute(gross) {
    return { ...empty(gross), vat_exempt_sales: r2(gross), total: r2(gross) };
  },
};

export const ZeroRated: TaxStrategy = {
  kind: "zero_rated",
  compute(gross) {
    return { ...empty(gross), zero_rated_sales: r2(gross), total: r2(gross) };
  },
};

/**
 * Senior Citizen / PWD (RA 9994 / RA 10754), VAT-inclusive shelf price:
 *   VAT-exempt base = gross / (1 + VAT)
 *   discount        = base × 20%
 *   payable         = base − discount   (no VAT charged)
 */
export const ScPwdDiscount: TaxStrategy = {
  kind: "sc_pwd",
  compute(gross, vatRate = PH_VAT_RATE) {
    const base = r2(gross / (1 + vatRate / 100));
    const discount = r2((base * SC_PWD_DISCOUNT_RATE) / 100);
    return {
      ...empty(gross),
      vat_exempt_sales: base,
      statutory_discount: discount,
      total: r2(base - discount),
    };
  },
};

export const TAX_STRATEGIES: Record<TaxStrategyKind, TaxStrategy> = {
  vat_inclusive: VatInclusive,
  vat_exclusive: VatExclusive,
  vat_exempt: VatExempt,
  zero_rated: ZeroRated,
  sc_pwd: ScPwdDiscount,
};

/** Choose a strategy from a line's tax type and the sale context. */
export function resolveStrategy(input: {
  taxType?: string | null;
  taxInclusive: boolean;
  scPwd?: boolean;
}): TaxStrategy {
  const t = (input.taxType ?? "VAT").toUpperCase();
  if (t === "ZERO_RATED") return ZeroRated;
  if (t === "VAT_EXEMPT" || t === "EXEMPT") return VatExempt;
  if (input.scPwd) return ScPwdDiscount;
  return input.taxInclusive ? VatInclusive : VatExclusive;
}

/** Sum line breakdowns into a BIR receipt summary. */
export function summarize(lines: TaxBreakdown[]): TaxBreakdown {
  return lines.reduce<TaxBreakdown>(
    (acc, l) => ({
      gross: r2(acc.gross + l.gross),
      vatable_sales: r2(acc.vatable_sales + l.vatable_sales),
      vat_amount: r2(acc.vat_amount + l.vat_amount),
      vat_exempt_sales: r2(acc.vat_exempt_sales + l.vat_exempt_sales),
      zero_rated_sales: r2(acc.zero_rated_sales + l.zero_rated_sales),
      statutory_discount: r2(acc.statutory_discount + l.statutory_discount),
      total: r2(acc.total + l.total),
    }),
    empty(0),
  );
}
