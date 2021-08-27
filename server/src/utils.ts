import { RequestHandler, Request, Response } from "express"

export function delay(time: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, time))
}

export class ServiceError extends Error {
  constructor(message: string, public statusCode: number = 400, public statusMessage?: string) {
    super(message)
  }
}

export function asyncHandler(
  handler: (req: Request, res: Response) => Promise<void>
): RequestHandler {
  return async (req, res) => {
    try {
      await handler(req, res)
    } catch (e) {
      if (e instanceof ServiceError) {
        console.log('info', `Service Error while performing request ${req.method} ${req.originalUrl}`, e)
        res
          .status(e.statusCode)
          .send({ status: e.statusMessage ?? 'error', message: e.message })
      } else {
        sendServerError(req, res, e)
      }
    }
  }
}

function sendServerError(req: Request, res: Response, e?: any) {
  console.log('error', `Unexpected error while performing request ${req.method} ${req.originalUrl}`, e)
  res.status(500).send({ status: "unexpected-error", message: 'Unexpected error' })
}