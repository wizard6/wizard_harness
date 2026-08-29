import type { ElementGroup, TableElement } from '@wizard-harness/contracts';

/** 内置 / 运行时登记的 catalog 种子 */
export interface CatalogSeed {
  id: string;
  title: string;
  blurb: string;
  periods: number;
  groups: readonly ElementGroup[];
  formal: readonly Omit<TableElement, 'kind'>[];
  demo: readonly Omit<TableElement, 'kind'>[];
}
