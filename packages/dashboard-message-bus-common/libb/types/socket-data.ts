import type { ZoneId, ClientId, MessageId } from "./ids";

interface SocketDataBase {
  // From `clientId` in `zoneId`
  type: "message" | "response" | "response-acknowledgment";
  zoneId: ZoneId;
  clientId: ClientId;
}

/**
 * A client can:
 * - As a publisher, publish `SocketDataMessage`.
 * - As a subscriber, respond to `SocketDataMessage` with `SocketDataResponse`.
 * - As a publisher, acknowledge `SocketDataResponse` with
 *   `SocketDataResponseAcknowledgment`.
 */

export interface SocketDataMessage extends SocketDataBase {
  // Message (id: `messageId`) with `data`
  type: "message";
  messageId: MessageId;
  data: any;
}

export interface SocketDataResponse extends SocketDataBase {
  // Response to message (id: `messageId`) with `data`
  type: "response";
  messageId: MessageId;
  data: any;
}

export interface SocketDataResponseAcknowledgment extends SocketDataBase {
  // Acknowledgment of subscriber (`subscriberClientId` in `subscriberZoneId`)
  // response to message (id: `messageId`)
  type: "response-acknowledgment";
  subscriberZoneId: ZoneId | undefined;
  subscriberClientId: ClientId;
  messageId: MessageId;
}

export type SocketData =
  | SocketDataMessage
  | SocketDataResponse
  | SocketDataResponseAcknowledgment;
