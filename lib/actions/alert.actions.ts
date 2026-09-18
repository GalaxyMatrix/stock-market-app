"use server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connectToDatabase } from "@/database/mongoose";
import { Alert, type AlertItem } from "@/database/models/alert.model";
import { auth } from "@/lib/better-auth/auth";
import { getStocksDetails } from "@/lib/actions/finnhub.actions";

type BetterAuthUser = {
  id?: string;
  _id?: { toString(): string };
  email?: string;
};

const serializeAlert = (alert: AlertItem, currentPrice?: number, changePercent?: number): Alert => ({
  id: alert._id?.toString() ?? "",
  symbol: alert.symbol,
  company: alert.company,
  alertName: alert.alertName,
  alertType: alert.alertType,
  threshold: alert.threshold,
  frequency: alert.frequency,
  currentPrice: currentPrice ?? 0,
  changePercent,
});

export const createAlert = async (data: AlertData) => {
  try {
    if (!auth) redirect("/sign-in");
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) redirect("/sign-in");

    await connectToDatabase();

    await new Alert({
      userId: session.user.id,
      symbol: data.symbol.toUpperCase(),
      company: data.company.trim(),
      alertName: data.alertName.trim(),
      alertType: data.alertType,
      threshold: Number(data.threshold),
      frequency: data.frequency,
      lastTriggeredAt: null,
    }).save();

    revalidatePath("/watchlist");
    return { success: true, message: "Alert created" };
  } catch (error) {
    console.error("Error creating alert:", error);
    return { success: false, error: "Failed to create alert" };
  }
};

export const updateAlert = async (alertId: string, data: AlertData) => {
  try {
    if (!auth) redirect("/sign-in");
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) redirect("/sign-in");

    await connectToDatabase();

    const updated = await Alert.findOneAndUpdate(
      { _id: alertId, userId: session.user.id },
      {
        symbol: data.symbol.toUpperCase(),
        company: data.company.trim(),
        alertName: data.alertName.trim(),
        alertType: data.alertType,
        threshold: Number(data.threshold),
        frequency: data.frequency,
      }
    );

    if (!updated) {
      return { success: false, error: "Alert not found" };
    }

    revalidatePath("/watchlist");
    return { success: true, message: "Alert updated" };
  } catch (error) {
    console.error("Error updating alert:", error);
    return { success: false, error: "Failed to update alert" };
  }
};

export const deleteAlert = async (alertId: string) => {
  try {
    if (!auth) redirect("/sign-in");
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) redirect("/sign-in");

    await connectToDatabase();
    await Alert.deleteOne({ _id: alertId, userId: session.user.id });

    revalidatePath("/watchlist");
    return { success: true, message: "Alert deleted" };
  } catch (error) {
    console.error("Error deleting alert:", error);
    return { success: false, error: "Failed to delete alert" };
  }
};

export const getUserAlerts = async (): Promise<Alert[]> => {
  try {
    if (!auth) redirect("/sign-in");
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) redirect("/sign-in");

    await connectToDatabase();

    const alerts = await Alert.find({ userId: session.user.id })
      .sort({ createdAt: -1 })
      .lean<AlertItem[]>();

    if (alerts.length === 0) return [];

    const enriched = await Promise.all(
      alerts.map(async (alert) => {
        try {
          const stockData = await getStocksDetails(alert.symbol);
          return serializeAlert(alert, stockData?.currentPrice, stockData?.changePercent);
        } catch (e) {
          console.warn(`Failed to fetch price data for alert ${alert.symbol}`, e);
          return serializeAlert(alert);
        }
      })
    );

    return JSON.parse(JSON.stringify(enriched));
  } catch (error) {
    console.error("Error fetching alerts:", error);
    throw new Error("Failed to fetch alerts");
  }
};

export type CronAlertItem = {
  id: string;
  userId: string;
  symbol: string;
  company: string;
  alertName: string;
  alertType: "upper" | "lower" | "volume";
  threshold: number;
  frequency: "once_per_minute" | "once_per_hour" | "once_per_day";
  lastTriggeredAt: Date | null;
  email: string;
};

export const getActiveAlertsForCron = async (): Promise<CronAlertItem[]> => {
  const mongoose = await connectToDatabase();
  const db = mongoose.connection.db;
  if (!db) throw new Error("Failed to connect to MongoDB");

  const alerts = await Alert.find({}).lean<AlertItem[]>();
  if (alerts.length === 0) return [];

  const userIds = Array.from(new Set(alerts.map((a) => a.userId)));
  const users = await db
    .collection<BetterAuthUser>("user")
    .find({ id: { $in: userIds } }, { projection: { id: 1, email: 1 } })
    .toArray();

  const emailByUserId = new Map(users.map((u) => [u.id, u.email]));

  const result: CronAlertItem[] = [];
  for (const alert of alerts) {
    const email = emailByUserId.get(alert.userId);
    if (!email) continue;
    result.push({
      id: (alert._id as { toString(): string }).toString(),
      userId: alert.userId,
      symbol: alert.symbol,
      company: alert.company,
      alertName: alert.alertName,
      alertType: alert.alertType,
      threshold: alert.threshold,
      frequency: alert.frequency,
      lastTriggeredAt: alert.lastTriggeredAt,
      email,
    });
  }

  return result;
};
