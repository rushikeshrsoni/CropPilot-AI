import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";

export const SESSION_COOKIE = "crop_pilot_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 characters.");
  }
  return secret;
}

export function setSessionCookie(res: Response, userId: string): void {
  const token = jwt.sign({ sub: userId }, sessionSecret(), {
    expiresIn: "7d",
    issuer: "croppilot-ai",
    audience: "croppilot-web",
  });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: SESSION_TTL_MS,
    path: "/api",
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api",
  });
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== "string") {
    res.status(401).json({ error: "Please sign in to continue." });
    return;
  }

  try {
    const payload = jwt.verify(token, sessionSecret(), {
      issuer: "croppilot-ai",
      audience: "croppilot-web",
    });
    if (typeof payload === "string" || typeof payload.sub !== "string") {
      res.status(401).json({ error: "Your session is invalid. Please sign in again." });
      return;
    }
    req.userId = payload.sub;
    next();
  } catch {
    clearSessionCookie(res);
    res.status(401).json({ error: "Your session has expired. Please sign in again." });
  }
}