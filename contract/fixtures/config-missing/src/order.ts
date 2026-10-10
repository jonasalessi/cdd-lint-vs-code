export class Order {
  total(items: number[], discount: number): number {
    let sum = 0;
    for (const item of items) {
      if (item > 0 && discount > 0) {
        sum += item;
      } else if (item < 0 || discount < 0) {
        sum -= item;
      }
    }
    return sum > 100 ? sum - discount : sum;
  }
}
