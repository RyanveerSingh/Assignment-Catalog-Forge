"use client";

import { cn } from "cn";
import { COLUMNS, REPAIRS, ROWS, type Cell, type Column } from "./hero-sheet-data";
import { HeroListing, type ShopTile } from "./hero-listing";
import { AT, cellState, stepLabel, useHeroClock, type CellState } from "./hero-timeline";

const repairIndex = new Map(REPAIRS.map((r, i) => [`${r.row}:${r.col}`, i]));

function SheetCell({ cell, state }: { cell: Cell; state: CellState }) {
  const done = state === "repaired" && cell.fixed !== undefined;
  const hold = cell.kind === "review";
  return (
    <span className="relative grid">
      {/* The orange wash marks a cell the cleaner is touching; it stays on a held cell so a person sees it. */}
      <span aria-hidden className={cn("absolute -inset-x-2.5 -inset-y-[9px] bg-brand-soft opacity-0 transition-opacity duration-200", (state === "flagged" || (done && hold)) && "opacity-100")} />
      <span className={cn("relative truncate transition-[opacity,translate] duration-150 [grid-area:1/1]", state === "flagged" && "text-brand line-through", done && "-translate-y-2 opacity-0")}>
        {cell.raw || " "}
      </span>
      {cell.fixed !== undefined ? (
        <span className={cn("relative truncate opacity-0 translate-y-2 transition-[opacity,translate] duration-200 [grid-area:1/1]", done && "translate-y-0 opacity-100 delay-100", hold ? "text-brand" : "text-ink")}>{cell.fixed}</span>
      ) : null}
    </span>
  );
}

/**
 * The first screen: no headline, just the product working. A real supplier sheet repairs its broken
 * cells one by one, its vase rows become the published listing in three languages, and the listing
 * lands in the shop next to products the same import published. The server renders tick 0, the raw
 * sheet, so the first paint is text.
 */
export function HeroSheet({ tiles }: { tiles: readonly ShopTile[] }) {
  const { ref, tick, still } = useHeroClock();
  const step = stepLabel(tick, still);
  const writing = tick >= AT.card;

  return (
    <div ref={ref} className="flex flex-col gap-4 md:gap-5">
      <p className="num flex h-6 items-baseline gap-3 overflow-hidden text-[13px] whitespace-nowrap text-ink md:text-[15px]" aria-live="off">
        <span className="text-brand">{step.n}</span>
        <span key={step.text} className="animate-step-in truncate">
          {step.text}
        </span>
      </p>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
        <div className="overflow-hidden rounded-lg bg-card ring-1 ring-border">
          <div className="num flex items-center justify-between border-b border-border bg-paper px-3 py-2 text-[11px] text-ink-muted">
            <span>new-12.csv</span>
            <span className="max-sm:hidden">26 rows · 16 columns · as the supplier sent it</span>
          </div>
          <table className="num w-full table-fixed border-collapse text-[11.5px] leading-4 md:text-[12px]">
            <caption className="sr-only">Eleven rows of a supplier spreadsheet as they arrived, and what the cleaner makes of each broken cell</caption>
            <thead>
              <tr className="bg-paper text-left text-[10.5px] text-ink-muted">
                <th scope="col" className="w-9 border-r border-b border-border px-2 py-2 text-right font-normal">#</th>
                {COLUMNS.map((col) => (
                  <th key={col.key} scope="col" className={cn("border-r border-b border-border px-2.5 py-2 font-normal last:border-r-0", col.className)}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, r) => (
                <tr key={row.line} className="relative">
                  <td className={cn("border-r border-b border-border px-2 py-[9px] text-right text-ink-muted transition-colors duration-300", row.vase && writing && "bg-ink text-white")}>{row.line}</td>
                  {COLUMNS.map((col) => (
                    <td key={col.key} className={cn("overflow-hidden border-r border-b border-border px-2.5 py-[9px] text-ink last:border-r-0", col.className)}>
                      <SheetCell cell={row.cells[col.key as Column]} state={cellState(tick, repairIndex.get(`${r}:${col.key}`) ?? -1)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <HeroListing tick={tick} still={still} tiles={tiles} />
      </div>
    </div>
  );
}
