/**
 * Synthetic demo data for a fictional company, "Acme Coffee Co.". Every
 * number here is made up.
 */
import type { Block, ChatSource } from '../../types';

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
export const MONTHLY_REVENUE = [182400, 176900, 201350, 214800, 229100, 243650];
export const MONTHLY_ORDERS = [6120, 5890, 6604, 7015, 7380, 7742];

export const TOP_PRODUCTS: Array<[string, number, number, number]> = [
  // product, revenue, share of revenue (percent), units
  ['House Blend 1 kg', 312450.5, 24.81, 14210],
  ['Cold Brew Concentrate', 228310.25, 18.13, 19870],
  ['Single Origin Sampler', 164905.0, 13.09, 5120],
  ['Oat Latte Kit', 121780.75, 9.67, 8044],
  ['Espresso Pods (50)', 98420.0, 7.81, 7311],
];

export const SALES_SQL = `SELECT date_trunc('month', ordered_at) AS month,
       SUM(total) AS revenue,
       COUNT(*)   AS orders
FROM   orders
WHERE  ordered_at >= DATE '2026-01-01'
  AND  ordered_at <  DATE '2026-07-01'
GROUP  BY 1
ORDER  BY 1;`;

export const PRODUCTS_SQL = `SELECT p.name,
       SUM(oi.quantity * oi.unit_price) AS revenue,
       SUM(oi.quantity)                 AS units
FROM   order_items oi
JOIN   products p ON p.id = oi.product_id
GROUP  BY p.name
ORDER  BY revenue DESC
LIMIT  5;`;

export const DEMO_SOURCES: ChatSource[] = [
  { title: 'Sales data dictionary', heading: 'orders.total', url: 'https://example.com/docs/orders' },
  { title: 'Metric definitions', heading: 'Revenue' },
];

const formatUsd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export function revenueTrendAnswer(): Block[] {
  const first = MONTHLY_REVENUE[0];
  const last = MONTHLY_REVENUE[MONTHLY_REVENUE.length - 1];
  const growth = (((last - first) / first) * 100).toFixed(1);
  return [
    {
      type: 'text',
      content: `Revenue grew **${growth}%** from January (${formatUsd(first)}) to June (${formatUsd(last)}). February was the only month that dipped.`,
    },
    { type: 'text', label: 'Executed SQL', content: '```sql\n' + SALES_SQL + '\n```' },
    {
      type: 'chart',
      data: [
        {
          type: 'bar',
          name: 'Revenue',
          x: MONTHS,
          y: MONTHLY_REVENUE,
          marker: { color: '#2563eb' },
        },
      ],
      layout: {
        title: { text: 'Monthly revenue, 2026 H1' },
        yaxis: { tickprefix: '$', separatethousands: true },
        height: 280,
      },
    },
  ];
}

export function topProductsAnswer(): Block[] {
  return [
    { type: 'text', content: 'Here are the five best-selling products by revenue:' },
    {
      type: 'table',
      headers: ['Product', 'Revenue', 'Share', 'Units'],
      rows: TOP_PRODUCTS.map(([name, revenue, share, units]) => [
        name,
        revenue.toFixed(2),
        share.toFixed(2),
        String(units),
      ]),
      column_formats: [null, 'currency', 'percent', 'integer'],
    },
    { type: 'text', label: 'Executed SQL', content: '```sql\n' + PRODUCTS_SQL + '\n```' },
  ];
}

export function ordersTableAnswer(): Block[] {
  return [
    {
      type: 'table',
      headers: ['Month', 'Orders', 'Revenue'],
      rows: MONTHS.map((m, i) => [m, String(MONTHLY_ORDERS[i]), MONTHLY_REVENUE[i].toFixed(2)]),
      column_formats: [null, 'integer', 'currency'],
    },
  ];
}

export function helpAnswer(): string {
  return [
    "I'm a **demo assistant** answering from synthetic data for *Acme Coffee Co.* Try:",
    '',
    '- "Show the revenue trend as a chart"',
    '- "What are the top products?"',
    '- "How is revenue defined?"',
    '- `/sql select * from orders` (a pass-through command handled by the data source)',
    '- "Simulate an error"',
  ].join('\n');
}

export function definitionAnswer(): string {
  return [
    '**Revenue** is the sum of `orders.total` for completed orders, after discounts and before tax.',
    '',
    '| Metric | Definition |',
    '| --- | --- |',
    '| Revenue | Sum of order totals |',
    '| Orders | Count of completed orders |',
    '| AOV | Revenue ÷ Orders |',
  ].join('\n');
}
