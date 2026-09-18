"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import InputField from "@/components/forms/InputField";
import SelectField from "@/components/forms/SelectField";
import { ALERT_TYPE_OPTIONS, ALERT_FREQUENCY_OPTIONS } from "@/lib/constants";
import { createAlert, updateAlert } from "@/lib/actions/alert.actions";

const DEFAULT_VALUES: AlertData = {
  symbol: "",
  company: "",
  alertName: "",
  alertType: "upper",
  threshold: "",
  frequency: "once_per_day",
};

const AlertModal = ({
  alertId,
  alertData,
  action = "create",
  open,
  setOpen,
  watchlistOptions = [],
}: AlertModalProps) => {
  const router = useRouter();
  const hasFixedStock = Boolean(alertData?.symbol);

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<AlertData>({
    defaultValues: { ...DEFAULT_VALUES, ...alertData },
  });

  useEffect(() => {
    if (open) {
      reset({ ...DEFAULT_VALUES, ...alertData });
    }
  }, [open, alertData, reset]);

  const alertType = watch("alertType");
  const stockOptions = watchlistOptions.map((s) => ({
    value: s.symbol,
    label: `${s.company} (${s.symbol})`,
  }));

  const onSubmit = async (values: AlertData) => {
    if (!values.symbol) {
      toast.error("Please choose a stock");
      return;
    }

    const company = hasFixedStock
      ? values.company
      : watchlistOptions.find((s) => s.symbol === values.symbol)?.company ?? values.symbol;

    const payload: AlertData = { ...values, company };

    const result =
      action === "update" && alertId
        ? await updateAlert(alertId, payload)
        : await createAlert(payload);

    if (result.success) {
      toast.success(action === "update" ? "Alert updated" : "Alert created", {
        description: `${payload.symbol} — ${payload.alertName}`,
      });
      setOpen(false);
      router.refresh();
    } else {
      toast.error(result.error || "Failed to save alert");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="alert-dialog">
        <DialogHeader>
          <DialogTitle className="alert-title">
            {action === "update" ? "Update Alert" : "Create Alert"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          {hasFixedStock ? (
            <>
              <input type="hidden" {...register("symbol", { required: true })} />
              <input type="hidden" {...register("company", { required: true })} />
              <p className="text-sm text-gray-400">
                {alertData?.company} ({alertData?.symbol})
              </p>
            </>
          ) : (
            <SelectField
              name="symbol"
              label="Stock"
              placeholder="Select a stock"
              options={stockOptions}
              control={control}
              required
            />
          )}

          <InputField
            name="alertName"
            label="Alert Name"
            placeholder="e.g. Apple breakout"
            register={register}
            error={errors.alertName}
            validation={{ required: "Alert name is required" }}
          />

          <SelectField
            name="alertType"
            label="Alert Type"
            placeholder="Select alert type"
            options={ALERT_TYPE_OPTIONS}
            control={control}
            required
          />

          <InputField
            name="threshold"
            label={alertType === "volume" ? "Volume spike (% above average)" : "Target Price ($)"}
            placeholder={alertType === "volume" ? "e.g. 50" : "e.g. 240.00"}
            type="number"
            register={register}
            error={errors.threshold}
            validation={{
              required: "Threshold is required",
              min: { value: 0, message: "Must be a positive number" },
            }}
          />

          <SelectField
            name="frequency"
            label="Notify me"
            placeholder="Select frequency"
            options={ALERT_FREQUENCY_OPTIONS}
            control={control}
            required
          />

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting} className="add-alert">
              {action === "update" ? "Save Changes" : "Create Alert"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AlertModal;
