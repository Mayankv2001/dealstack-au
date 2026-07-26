import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import {
  listTransferBonuses,
  type AdminTransferBonus,
} from "@/lib/admin/repos/transferBonuses";
import {
  AdminListTable,
  type AdminColumn,
  type AdminRow,
} from "@/components/admin/AdminListTable";
import { Button } from "@/components/ui/button";
import { REWARDS_PROGRAMMES } from "@/lib/rewards/programmes";
import { bonusPercentLabel } from "@/lib/rewards/transferBonus";
import { toggleTransferBonusPublished } from "./actions";

export const metadata: Metadata = {
  title: "Transfer bonuses | DealStack AU admin",
};

const COLUMNS: AdminColumn[] = [
  { key: "route", header: "Transfer" },
  { key: "bonus", header: "Bonus" },
  { key: "ends", header: "Ends" },
  { key: "confidence", header: "Confidence" },
  { key: "status", header: "Status" },
];

const programmeName = (slug: string): string =>
  REWARDS_PROGRAMMES.find((programme) => programme.slug === slug)?.shortName ??
  slug;

function toRow(bonus: AdminTransferBonus): AdminRow {
  const route = `${programmeName(bonus.fromProgramme)} → ${programmeName(bonus.toProgramme)}`;
  const percent = bonusPercentLabel(bonus);
  return {
    id: bonus.id,
    searchText: `${route} ${percent}`.toLowerCase(),
    filterValue: bonus.isPublished ? "published" : "draft",
    editHref: `/admin/transfer-bonuses/${bonus.id}/edit`,
    cells: {
      route: { kind: "text", text: route, strong: true },
      bonus: { kind: "text", text: percent },
      ends: bonus.expiryDate
        ? { kind: "text", text: bonus.expiryDate }
        : { kind: "text", text: "No end date", muted: true },
      confidence: { kind: "confidence", value: bonus.confidence },
      status: {
        kind: "badge",
        text: bonus.isPublished ? "Published" : "Draft",
        tone: bonus.isPublished ? "secondary" : "outline",
      },
    },
    actions: [
      {
        action: toggleTransferBonusPublished.bind(
          null,
          bonus.id,
          !bonus.isPublished
        ),
        label: bonus.isPublished ? "Unpublish" : "Publish",
      },
    ],
  };
}

export default async function TransferBonusesListPage() {
  // Belt-and-suspenders gate — the protected layout already checks, but every
  // admin page verifies independently (the proxy is only an optimistic check).
  await requireAdmin();
  const bonuses = await listTransferBonuses();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold">
            Transfer bonuses
          </h1>
          <p className="text-sm text-muted-foreground">
            Promotions on moving points between programmes. Manual entry —
            drafts stay hidden until published, then show on the destination
            programme’s card.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/transfer-bonuses/new">New bonus</Link>
        </Button>
      </header>

      {bonuses.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No transfer bonuses yet.{" "}
          <Link
            href="/admin/transfer-bonuses/new"
            className="font-medium underline"
          >
            Create the first one
          </Link>
          .
        </p>
      ) : (
        <AdminListTable
          columns={COLUMNS}
          rows={bonuses.map(toRow)}
          searchPlaceholder="Search programme or bonus…"
          filter={{
            label: "Status",
            options: [
              { value: "published", label: "Published" },
              { value: "draft", label: "Draft" },
            ],
          }}
        />
      )}
    </div>
  );
}
