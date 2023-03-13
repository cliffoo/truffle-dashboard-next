import type { ZoneId, ClientId } from "dashboard-message-bus-common/libbb";
import type { Response } from "./response";

export type ResponseAcknowledgmentHandler = (
  ownResponseIsFirst: boolean
) => void | Promise<void>;

export type MessageHandler = (
  messageData: unknown,
  respond: (responseData: any) => void
) =>
  | ResponseAcknowledgmentHandler
  | void
  | Promise<ResponseAcknowledgmentHandler>
  | Promise<void>;

export type Responses = Map<ClientId, Response>;
