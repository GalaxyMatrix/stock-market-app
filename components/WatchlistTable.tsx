"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { WATCHLIST_TABLE_HEADER } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import WatchlistButton from "@/components/WatchlistButton";
import AlertModal from "@/components/AlertModal";
import { useRouter } from "next/navigation";
import { cn, getChangeColorClass } from "@/lib/utils";

export function WatchlistTable({ watchlist }: WatchlistTableProps) {
  const router = useRouter();
  const [alertModalStock, setAlertModalStock] = useState<{ symbol: string; company: string } | null>(
    null
  );

  return (
    <>
    <Table className="scrollbar-hide-default watchlist-table">
      <TableHeader>
        <TableRow className="table-header-row">
          {WATCHLIST_TABLE_HEADER.map((label) => (
            <TableHead className="table-header" key={label}>
              {label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {watchlist.map((item, index) => (
          <TableRow
            key={item.symbol + index}
            className="table-row"
            onClick={() =>
              router.push(`/stocks/${encodeURIComponent(item.symbol)}`)
            }
          >
            <TableCell className="pl-4 table-cell">{item.company}</TableCell>
            <TableCell className="table-cell">{item.symbol}</TableCell>
            <TableCell className="table-cell">
              {item.priceFormatted || "—"}
            </TableCell>
            <TableCell
              className={cn("table-cell", getChangeColorClass(item.changePercent))}
            >
              {item.changeFormatted || "—"}
            </TableCell>
            <TableCell className="table-cell">{item.marketCap || "—"}</TableCell>
            <TableCell className="table-cell">{item.peRatio || "—"}</TableCell>
            <TableCell onClick={(e) => e.stopPropagation()}>
              <Button
                className="add-alert"
                onClick={() => setAlertModalStock({ symbol: item.symbol, company: item.company })}
              >
                Add Alert
              </Button>
            </TableCell>
            <TableCell onClick={(e) => e.stopPropagation()}>
              <WatchlistButton
                symbol={item.symbol}
                company={item.company}
                isInWatchlist={true}
                showTrashIcon={true}
                type="icon"
                onWatchlistChange={() => router.refresh()}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    <AlertModal
      open={alertModalStock !== null}
      setOpen={(open) => {
        if (!open) setAlertModalStock(null);
      }}
      action="create"
      alertData={
        alertModalStock
          ? {
              symbol: alertModalStock.symbol,
              company: alertModalStock.company,
              alertName: "",
              alertType: "upper",
              threshold: "",
              frequency: "once_per_day",
            }
          : undefined
      }
    />
    </>
  );
}