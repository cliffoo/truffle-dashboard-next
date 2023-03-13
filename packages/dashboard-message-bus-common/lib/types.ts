import type WebSocket from "ws";

export type MessageId = string;
export type ClientId = string;

export interface NamedSocket extends WebSocket.WebSocket {
  clientId: ClientId;
}

interface SocketDataBase {
  type: "message" | "response" | "response-acknowledgement";
  clientId: ClientId;
}
/**
 * A client can:
 * - As a publisher, publish `SocketDataMessage`.
 * - As a subscriber, respond to `SocketDataMessage` with `SocketDataResponse`.
 * - As a publisher, acknowledge `SocketDataResponse` with
 *   `SocketDataResponseAcknowledgement`.
 */
export interface SocketDataMessage extends SocketDataBase {
  // `clientId`'s message (id: `messageId`) with `data`.
  type: "message";
  messageId: MessageId;
  data: any;
}
export interface SocketDataResponse extends SocketDataBase {
  // `clientId`'s response to message (id: `messageId`) with `data`.
  type: "response";
  messageId: MessageId;
  data: any;
}
export interface SocketDataResponseAcknowledgement extends SocketDataBase {
  // `clientId`'s acknowledgement of `subscriberId`'s response to message (id:
  // `messageId`).
  type: "response-acknowledgement";
  subscriberId: ClientId;
  messageId: MessageId;
}

// `MessageBus`' WebSocket server can handle this entire union type, but
// `MessageBusClient` can only handle messages and responses, because response
// acknowledgements are only useful to `MessageBus`.
export type SocketData =
  | SocketDataMessage
  | SocketDataResponse
  | SocketDataResponseAcknowledgement;
