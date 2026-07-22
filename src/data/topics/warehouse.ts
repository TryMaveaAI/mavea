// warehouse.ts, "Which SKUs need a PO this week" — a small DTC/CPG brand's ops manager
// checking stock health across the top SKUs before the weekly buying meeting. The showcase +
// render-coverage demo for `inventoryreorder`, the stats family's supply-chain reorder card.
import type { ConversationSpec } from '../conversation';

export const warehouse: ConversationSpec = {
  id: 'warehouse',
  workspace: 'Inventory',
  title: 'Which SKUs need a PO this week',
  sub: 'Stock levels against safety stock and reorder point, across your top SKUs.',
  opener:
    "Two SKUs are already below their reorder point, and the ceramic mug is about to join them. Here's the full picture.",
  switchSay: "Let's check stock levels.",
  gather: 'Reading current stock + reorder rules',
  found: 'Two SKUs need a PO now, one more within the week.',
  tint: '#f5b95c',
  context: [
    { name: 'Inventory export.csv', color: 'var(--insight)' },
    { name: 'Reorder rules', color: 'var(--presence-soft)' },
  ],
  blocks: [
    {
      type: 'insight',
      col: 12,
      id: 'call',
      num: '1',
      delay: 0,
      props: {
        title: 'Cut a PO today for the steel water bottle and the canvas tote',
        conf: 'strong',
        summary:
          'Both are already under their reorder point; the 21-day lead time on the bottle means a delay now becomes a stockout in three weeks.',
        sources: [{ file: 'Inventory export.csv' }],
      },
    },
    {
      type: 'inventoryreorder',
      col: 12,
      id: 'stock',
      delay: 90,
      props: {
        title: 'Stock vs. reorder point, by SKU',
        icon: 'cart',
        iconColor: 'var(--presence)',
        items: [
          {
            sku: 'SKU-1042',
            label: 'Steel water bottle, 24oz',
            level: 86,
            reorderPoint: 150,
            safetyStock: 60,
            max: 600,
            leadTimeDays: 21,
          },
          {
            sku: 'SKU-1108',
            label: 'Canvas tote bag',
            level: 40,
            reorderPoint: 120,
            safetyStock: 50,
            max: 500,
            leadTimeDays: 14,
          },
          {
            sku: 'SKU-2231',
            label: 'Ceramic mug, matte black',
            level: 168,
            reorderPoint: 180,
            safetyStock: 80,
            max: 700,
            leadTimeDays: 18,
          },
          {
            sku: 'SKU-3387',
            label: 'Cork yoga mat',
            level: 210,
            reorderPoint: 100,
            safetyStock: 40,
            max: 400,
            leadTimeDays: 30,
          },
          {
            sku: 'SKU-4471',
            label: 'Bamboo cutlery set',
            level: 340,
            reorderPoint: 90,
            safetyStock: 35,
            max: 450,
            leadTimeDays: 10,
          },
        ],
        footer: 'Reorder points assume the same 6-week sell-through rate as last quarter.',
      },
    },
  ],
  proof: null,
  extras: {},

  group: 'docs',
  tryChip: { label: 'Check my stock levels', route: 'topic:warehouse' },
  suggests: [],
  keywords: [
    {
      test: /reorder point|safety stock|stock level|which skus?|purchase order\b/,
      route: 'topic:warehouse',
    },
  ],
};
