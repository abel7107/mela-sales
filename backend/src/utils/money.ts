import { HttpError } from "../middleware/errorMiddleware.js";

export const MAX_MONEY_CENTS = 999999999999n;

/** Convert a decimal money string to integer cents without float math. */
export function moneyToCents(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");

  if (!/^\d+$/.test(whole) || !/^\d{0,2}$/.test(fraction)) {
    throw new HttpError(400, `Invalid money amount: ${value}`);
  }

  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

/** Convert a quantity string to thousandths. "2.5" becomes 2500. */
export function quantityToThousandths(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");

  if (!/^\d+$/.test(whole) || !/^\d{0,3}$/.test(fraction)) {
    throw new HttpError(400, `Invalid quantity: ${value}`);
  }

  return BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0"));
}

/** Render integer cents as a fixed 2-decimal money string. */
export function centsToMoney(cents: bigint): string {
  const sign = cents < 0n ? "-" : "";
  const abs = cents < 0n ? -cents : cents;

  return `${sign}${abs / 100n}.${(abs % 100n)
    .toString()
    .padStart(2, "0")}`;
}

export function assertMoneyRange(amount: bigint): void {
  if (amount < 0n || amount > MAX_MONEY_CENTS) {
    throw new HttpError(
      400,
      "The calculated amount exceeds the supported money range."
    );
  }
}

/** Round an extended price (unit * qty) to the nearest cent. */
export function extendPrice(
  unitPriceCents: bigint,
  quantityThousandths: bigint
): bigint {
  return (unitPriceCents * quantityThousandths + 500n) / 1000n;
}
