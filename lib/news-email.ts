import { createHmac, timingSafeEqual } from "crypto";
import { connectToDatabase } from "@/database/mongoose";

export const APP_URL = "https://signalist-zeta-kohl.vercel.app";

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const signingSecret = () => {
    const secret = process.env.BETTER_AUTH_SECRET;
    if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");
    return secret;
};

const signEmail = (email: string) =>
    createHmac("sha256", signingSecret()).update(email).digest("base64url");

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const createUnsubscribeToken = (email: string) => {
    const normalized = normalizeEmail(email);
    const payload = Buffer.from(normalized, "utf8").toString("base64url");
    return `${payload}.${signEmail(normalized)}`;
};

export const readUnsubscribeToken = (token: string): string | null => {
    const separator = token.indexOf(".");
    if (separator <= 0) return null;

    const payload = token.slice(0, separator);
    const signature = token.slice(separator + 1);
    const email = Buffer.from(payload, "base64url").toString("utf8");
    if (!email.includes("@")) return null;

    const expected = signEmail(email);
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (actualBuffer.length !== expectedBuffer.length) return null;
    if (!timingSafeEqual(actualBuffer, expectedBuffer)) return null;
    return email;
};

export const buildUnsubscribeUrl = (email: string) =>
    `${APP_URL}/unsubscribe?token=${encodeURIComponent(createUnsubscribeToken(email))}`;

export type UnsubscribeResult = "unsubscribed" | "invalid";

export const unsubscribeFromNews = async (token: string): Promise<UnsubscribeResult> => {
    const email = readUnsubscribeToken(token);
    if (!email) return "invalid";

    const mongoose = await connectToDatabase();
    const db = mongoose.connection.db;
    if (!db) return "invalid";

    const result = await db.collection("user").updateOne(
        { email: { $regex: `^${escapeRegex(email)}$`, $options: "i" } },
        { $set: { newsEmailOptOut: true } }
    );

    return result.matchedCount > 0 ? "unsubscribed" : "invalid";
};
