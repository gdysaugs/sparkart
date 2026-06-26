export type PurchasePlan = {
  id: string
  label: string
  price: number
  tickets: number
  priceId: string
}

export const PURCHASE_PLANS: PurchasePlan[] = [
  { id: 'light', label: 'ライト', price: 690, tickets: 30, priceId: 'price_1TmcRhArrLCjV5GlfTXWODeP' },
  { id: 'basic', label: 'ベーシック', price: 1680, tickets: 80, priceId: 'price_1TmcRwArrLCjV5GldEbZcgtd' },
  { id: 'standard', label: 'スタンダード', price: 3280, tickets: 170, priceId: 'price_1TmcSBArrLCjV5GlbuasefaN' },
  { id: 'pro', label: 'プロ', price: 6480, tickets: 380, priceId: 'price_1TmcSTArrLCjV5GlQcdrmkI9' },
]
