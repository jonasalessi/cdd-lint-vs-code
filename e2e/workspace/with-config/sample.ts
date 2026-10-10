export class Order {
  total(prices: number[]): number {
    return prices.reduce((sum, price) => sum + price, 0);
  }
}

export function isPaid(balance: number): boolean {
  return balance === 0;
}
