"use server";

import { connectToDatabase } from "@/database/mongoose";
import { Watchlist } from "@/database/models/watchlist.model";

type BetterAuthUser = {
  id?: string;
  _id?: { toString(): string };
  email?: string;
};

export const getWatchlistSymbolsByEmail = async (
  email: string
): Promise<string[]> => {
  try {
    if (!email) return [];

    const mongoose = await connectToDatabase();
    const db = mongoose.connection.db;
    if (!db) throw new Error("Failed to connect to MongoDB");

    const user = await db
      .collection<BetterAuthUser>("user")
      .findOne({ email });

    if (!user) return [];

    const userId = user.id || user._id?.toString();
    if (!userId) return [];

    const items = await Watchlist.find({ userId }, { symbol: 1, _id: 0 }).lean();
    return items
      .map((item) => item.symbol)
      .filter((symbol): symbol is string => Boolean(symbol));
  } catch (e) {
    console.error("Error fetching watchlist symbols by email:", e);
    return [];
  }
};
