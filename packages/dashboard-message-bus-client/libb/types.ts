import type { ZoneId, ClientId } from "dashboard-message-bus-common/libb";

export type ResponseAcknowledgmentHandler = (
  ownResponseAcknowledged: boolean
) => void | Promise<void>;

interface MessageHandlerReturnValue {
  response?: unknown;
  onAck?: ResponseAcknowledgmentHandler;
}

export type MessageHandler = (
  messageData: any
) => MessageHandlerReturnValue | Promise<MessageHandlerReturnValue>;

interface Response {
  subscriberZoneId: ZoneId;
  data: any;
  hasData: true;
  resolveData?(data: any): void;
  acknowledgeResponse?(): Promise<void>;
  acknowledged?: boolean;
}

type EmptyResponse = Partial<Record<keyof Response, undefined>>;

export type Responses = Map<ClientId, Response | EmptyResponse>;
