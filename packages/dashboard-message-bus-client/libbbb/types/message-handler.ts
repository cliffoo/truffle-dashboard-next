import { ResponseAcknowledgmentHandler } from "./response-acknowledgment-handler";

export type MessageHandler = (
  messageData: unknown,
  respond: (responseData: any) => void
) =>
  | ResponseAcknowledgmentHandler
  | void
  | Promise<ResponseAcknowledgmentHandler>
  | Promise<void>;
