import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
const allowedOrigins = process.env.CORS_ORIGIN
  ?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
if (allowedOrigins?.length) {
  app.use(
    cors({
      credentials: true,
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error("Origin is not allowed."));
      },
    }),
  );
}
app.use(helmet());
app.use(cookieParser());
app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

app.use(
  (
    error: unknown,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ): void => {
    const status =
      typeof error === "object" && error !== null && "status" in error &&
      typeof error.status === "number"
        ? error.status
        : 500;
    req.log.error(
      {
        status,
        errorName: error instanceof Error ? error.name : "unknown",
      },
      "API request failed",
    );
    res.status(status >= 400 && status < 500 ? status : 500).json({
      error:
        status === 413
          ? "The request is too large. Crop photos must be 8 MB or smaller."
          : "Something went wrong. Please try again.",
    });
  },
);

export default app;
