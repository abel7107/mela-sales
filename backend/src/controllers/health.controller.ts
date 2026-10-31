import { Request, Response, NextFunction } from "express";

export const getHealthStatus = async (
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    res
      .status(200)
      .json({ status: "healthy", timestamp: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
};
