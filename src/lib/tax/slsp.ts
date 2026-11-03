// BIR Summary List of Sales (SLS) in the RELIEF-style .DAT layout.
// One detail line per buyer TIN; sales without a buyer TIN are excluded from
// details and header totals (the SLS lists identified buyers only).

export type SlsSale = {
  buyer_tin?: string | null;
  buyer_name?: string | null;
  buyer_address?: string | null;
  vat_exempt_amount?: number | null;
  zero_rated_amount?: number | null;
  vatable_amount?: number | null;
  vat_amount?: number | null;
};

export type SlsOwner = {
  tin: string;
  registered_name: string;
  trade_name?: string | null;
  address?: string | null;
  rdo_code?: string | null;
};

const digits = (t: string | null | undefined) => String(t ?? "").replace(/\D/g, "").slice(0, 9);
const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, "").toUpperCase().slice(0, 50)}"`;
const n = (v: number) => (Math.round(v * 100) / 100).toFixed(2);

/** periodEnd as YYYY-MM-DD; returns MM/DD/YYYY. */
const mdY = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;

export function buildSlsDat(owner: SlsOwner, sales: SlsSale[], periodEnd: string) {
  const groups = new Map<string, { name: string; addr: string; ex: number; zr: number; tx: number; vat: number }>();
  let skipped = 0;
  for (const s of sales) {
    const tin = digits(s.buyer_tin);
    if (tin.length !== 9) {
      skipped++;
      continue;
    }
    const g = groups.get(tin) ?? { name: s.buyer_name ?? "", addr: s.buyer_address ?? "", ex: 0, zr: 0, tx: 0, vat: 0 };
    g.ex += Number(s.vat_exempt_amount ?? 0);
    g.zr += Number(s.zero_rated_amount ?? 0);
    g.tx += Number(s.vatable_amount ?? 0);
    g.vat += Number(s.vat_amount ?? 0);
    groups.set(tin, g);
  }
  const tot = { ex: 0, zr: 0, tx: 0, vat: 0 };
  const ownerTin = digits(owner.tin);
  const period = mdY(periodEnd);
  const details = [...groups.entries()].map(([tin, g]) => {
    tot.ex += g.ex; tot.zr += g.zr; tot.tx += g.tx; tot.vat += g.vat;
    return ["D", "S", q(tin), q(g.name), q(""), q(""), q(""), q(g.addr), q(""),
      n(g.ex), n(g.zr), n(g.tx), n(g.vat), ownerTin, period].join(",");
  });
  const header = ["H", "S", q(ownerTin), q(owner.registered_name), q(""), q(""), q(""),
    q(owner.trade_name ?? ""), q(owner.address ?? ""), q(""),
    n(tot.ex), n(tot.zr), n(tot.tx), n(tot.vat), owner.rdo_code ?? "", period, "12"].join(",");
  return { content: [header, ...details].join("\r\n") + "\r\n", buyers: groups.size, skipped };
}
