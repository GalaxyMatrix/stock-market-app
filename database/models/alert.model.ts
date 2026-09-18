import { Schema, model, models, type Document } from "mongoose";

export interface AlertItem extends Document {
  userId: string;
  symbol: string;
  company: string;
  alertName: string;
  alertType: "upper" | "lower" | "volume";
  threshold: number;
  frequency: "once_per_minute" | "once_per_hour" | "once_per_day";
  lastTriggeredAt: Date | null;
  createdAt: Date;
}

const AlertSchema = new Schema<AlertItem>({
  userId: { type: String, required: true, index: true },
  symbol: { type: String, required: true, uppercase: true, trim: true },
  company: { type: String, required: true, trim: true },
  alertName: { type: String, required: true, trim: true },
  alertType: { type: String, enum: ["upper", "lower", "volume"], required: true },
  threshold: { type: Number, required: true },
  frequency: {
    type: String,
    enum: ["once_per_minute", "once_per_hour", "once_per_day"],
    required: true,
    default: "once_per_day",
  },
  lastTriggeredAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

export const Alert = models?.Alert || model<AlertItem>("Alert", AlertSchema);
