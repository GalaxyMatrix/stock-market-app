"use server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connectToDatabase } from "@/database/mongoose";
import { Watchlist } from "@/database/models/watchlist.model";
import { auth } from "@/lib/better-auth/auth";
import { getStocksDetails } from "@/lib/actions/finnhub.actions";

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

export const addToWatchlist = async (symbol: string, company: string) => {
  try {
    if (!auth) redirect("/sign-in");
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session?.user) redirect("/sign-in");
    await connectToDatabase();
    const upperSymbol = symbol.toUpperCase();
    const existingItem = await Watchlist.findOne({
      userId: session.user.id,
      symbol: upperSymbol,
    });
    if (existingItem) {
      return { success: false, error: "Stock already in watchlist" };
    }
    await new Watchlist({
      userId: session.user.id,
      symbol: upperSymbol,
      company: company.trim(),
    }).save();
    revalidatePath("/watchlist");
    revalidatePath("/WatchList"); // temporary if folder casing differs
    return { success: true, message: "Stock added to watchlist" };
  } catch (error) {
    console.error("Error adding to watchlist:", error);
    throw new Error("Failed to add stock to watchlist");
  }
};
export const removeFromWatchlist = async (symbol: string) => {
  try {
    if (!auth) redirect("/sign-in");
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session?.user) redirect("/sign-in");
    await connectToDatabase();
    await Watchlist.deleteOne({
      userId: session.user.id,
      symbol: symbol.toUpperCase(),
    });
    revalidatePath("/watchlist");
    revalidatePath("/WatchList");
    return { success: true, message: "Stock removed from watchlist" };
  } catch (error) {
    console.error("Error removing from watchlist:", error);
    throw new Error("Failed to remove stock from watchlist");
  }
};

export const getUserWatchlist = async () => {
  try {
    if (!auth) redirect("/sign-in");

    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session?.user) redirect("/sign-in");

    await connectToDatabase();

    const watchlist = await Watchlist.find({ userId: session.user.id })
      .sort({ addedAt: -1 })
      .lean();

    return JSON.parse(JSON.stringify(watchlist));
  } catch (error) {
    console.error("Error fetching watchlist:", error);
    throw new Error("Failed to fetch watchlist");
  }
};


export const getWatchlistWithData = async () => {
  try {
    if (!auth) redirect("/sign-in");

    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session?.user) redirect("/sign-in");

    await connectToDatabase();

    const watchlist = await Watchlist.find({ userId: session.user.id })
      .sort({ addedAt: -1 })
      .lean();

    if (watchlist.length === 0) return [];

    const stocksWithData = await Promise.all(
      watchlist.map(async (item) => {
        try {
          const stockData = await getStocksDetails(item.symbol);
          if (!stockData) {
            console.warn(`Failed to fetch data for ${item.symbol}`);
            return {
              userId: item.userId,
              symbol: item.symbol,
              company: item.company,
              addedAt: item.addedAt,
            };
          }

          return {
            userId: item.userId,
            symbol: stockData.symbol,
            company: stockData.company,
            addedAt: item.addedAt,
            currentPrice: stockData.currentPrice,
            priceFormatted: stockData.priceFormatted,
            changeFormatted: stockData.changeFormatted,
            changePercent: stockData.changePercent,
            marketCap: stockData.marketCapFormatted,
            peRatio: stockData.peRatio,
          };
        } catch (e) {
          console.warn(`Failed to fetch data for ${item.symbol}`, e);
          return {
            userId: item.userId,
            symbol: item.symbol,
            company: item.company,
            addedAt: item.addedAt,
          };
        }
      })
    );

    return JSON.parse(JSON.stringify(stocksWithData));
  } catch (error) {
    console.error("Error loading watchlist:", error);
    throw new Error("Failed to fetch watchlist");
  }
};