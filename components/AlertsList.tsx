"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import AlertModal from "@/components/AlertModal";
import { deleteAlert } from "@/lib/actions/alert.actions";
import { ALERT_FREQUENCY_OPTIONS } from "@/lib/constants";
import { cn, formatChangePercent, formatPrice, getAlertText, getChangeColorClass } from "@/lib/utils";

type AlertsListComponentProps = AlertsListProps & {
  watchlist?: { symbol: string; company: string }[];
};

const frequencyLabel = (frequency: Alert["frequency"]) =>
  ALERT_FREQUENCY_OPTIONS.find((f) => f.value === frequency)?.label ?? frequency;

const AlertsList = ({ alertData, watchlist = [] }: AlertsListComponentProps) => {
  const router = useRouter();
  const [modal, setModal] = useState<{ open: boolean; alertId?: string; alertData?: AlertData }>({
    open: false,
  });

  const openCreate = () => setModal({ open: true, alertId: undefined, alertData: undefined });

  const openEdit = (alert: Alert) =>
    setModal({
      open: true,
      alertId: alert.id,
      alertData: {
        symbol: alert.symbol,
        company: alert.company,
        alertName: alert.alertName,
        alertType: alert.alertType,
        threshold: String(alert.threshold),
        frequency: alert.frequency,
      },
    });

  const handleDelete = async (alert: Alert) => {
    const result = await deleteAlert(alert.id);
    if (result.success) {
      toast.success("Alert deleted", { description: `${alert.symbol} — ${alert.alertName}` });
      router.refresh();
    } else {
      toast.error(result.error || "Failed to delete alert");
    }
  };

  return (
    <div className="watchlist-alerts">
      <div className="flex items-center justify-between w-full">
        <h2 className="watchlist-title">Alerts</h2>
        <Button className="add-alert" onClick={openCreate}>
          Create Alert
        </Button>
      </div>

      <div className="alert-list">
        {!alertData || alertData.length === 0 ? (
          <p className="alert-empty">No alerts yet. Create one to get notified.</p>
        ) : (
          alertData.map((alert) => (
            <div key={alert.id} className="alert-item">
              <h4 className="alert-name">{alert.alertName}</h4>

              <div className="alert-details">
                <div className="flex items-center gap-2">
                  <span className="watchlist-icon">{alert.company.charAt(0).toUpperCase()}</span>
                  <div>
                    <p className="alert-company">{alert.company}</p>
                    <p className="text-xs text-gray-500">{alert.symbol}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="alert-price">{formatPrice(alert.currentPrice)}</p>
                  {alert.changePercent !== undefined && (
                    <p className={cn("text-xs", getChangeColorClass(alert.changePercent))}>
                      {formatChangePercent(alert.changePercent)}
                    </p>
                  )}
                </div>
              </div>

              <p className="text-sm text-gray-400 mb-2">{getAlertText(alert)}</p>

              <div className="alert-actions">
                <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-600/10 text-yellow-500 border border-yellow-600/20 whitespace-nowrap">
                  {frequencyLabel(alert.frequency)}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="alert-update-btn"
                    onClick={() => openEdit(alert)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="alert-delete-btn"
                    onClick={() => handleDelete(alert)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <AlertModal
        open={modal.open}
        setOpen={(open) => setModal((s) => ({ ...s, open }))}
        alertId={modal.alertId}
        alertData={modal.alertData}
        action={modal.alertId ? "update" : "create"}
        watchlistOptions={watchlist}
      />
    </div>
  );
};

export default AlertsList;
