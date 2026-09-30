import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  GetCurrentUserResponse,
  LoginBody,
  LoginResponse,
  LogoutResponse,
  RegisterBody,
  RegisterResponse,
} from "@workspace/api-zod";
import { db, usersTable } from "@workspace/db";
import { clearSessionCookie, requireAuth, setSessionCookie } from "../middlewares/auth";
import { withUserContext } from "../lib/userDb";

const router: IRouter = Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Please try again later." },
});
const dummyHash = bcrypt.hashSync("constant-non-account-password", 12);

function publicUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    preferredLanguage: user.preferredLanguage,
    regionState: user.regionState,
    createdAt: user.createdAt,
  };
}

router.post("/auth/register", authLimiter, async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Check the account details and try again." });
    return;
  }

  const input = parsed.data;
  const id = randomUUID();
  const email = input.email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(input.password, 12);

  try {
    const [user] = await withUserContext(id, (tx) =>
      tx
        .insert(usersTable)
        .values({
          id,
          email,
          passwordHash,
          fullName: input.fullName.trim(),
          phone: input.phone ?? null,
          preferredLanguage: input.preferredLanguage,
          regionState: input.regionState?.trim() || null,
        })
        .returning(),
    );
    setSessionCookie(res, user.id);
    res.status(201).json(RegisterResponse.parse(publicUser(user)));
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      res.status(409).json({ error: "An account already exists for this email." });
      return;
    }
    throw error;
  }
});

router.post("/auth/login", authLimiter, async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid email and password." });
    return;
  }
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, parsed.data.email.trim().toLowerCase()))
    .limit(1);
  const passwordMatches = await bcrypt.compare(
    parsed.data.password,
    user?.passwordHash ?? dummyHash,
  );
  if (!user || !passwordMatches) {
    res.status(401).json({ error: "Email or password is incorrect." });
    return;
  }

  setSessionCookie(res, user.id);
  res.json(LoginResponse.parse(publicUser(user)));
});

router.post("/auth/logout", (_req, res): void => {
  clearSessionCookie(res);
  res.status(204).json(LogoutResponse.parse(undefined));
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const user = await withUserContext(req.userId!, async (tx) => {
    const [row] = await tx
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.userId!))
      .limit(1);
    return row;
  });
  if (!user) {
    clearSessionCookie(res);
    res.status(401).json({ error: "Your account is no longer available." });
    return;
  }
  res.json(GetCurrentUserResponse.parse(publicUser(user)));
});

export default router;