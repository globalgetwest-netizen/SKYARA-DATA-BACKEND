/** Format an amount as "GHS 10.00". */
export function formatMoney(amount: number, currency = 'GHS'): string {
  return `${currency} ${amount.toFixed(2)}`;
}
