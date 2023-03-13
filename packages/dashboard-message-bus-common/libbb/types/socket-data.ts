import type { ZoneId, ClientId, MessageId } from "./ids";

/** From `clientId` in `zoneId` */
interface SocketDataBase {
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

/** Message (id: `messageId`) with `data` */
export interface SocketDataMessage extends SocketDataBase {
  type: "message";
  messageId: MessageId;
  data: any;
}

/** Response to message (id: `messageId`) with `data` */
export interface SocketDataResponse extends SocketDataBase {
  type: "response";
  messageId: MessageId;
  data: any;
}

/**
 * Acknowledgment of response to message (id: messageId). Cases:
 *
 * - Both publisher and message bus are aware of message.
 *   ```
 *   {
 *     firstResponseSubscriberZoneId: ZoneId,
 *     subscriberClientId: ClientId
 *   }
 *   ```
 *   For all subscribers with `subscriberClientId`, response from the one in
 *   `firstResponseSubscriberZoneId` reached message bus first, and is the
 *   only one "respected" by publisher.
 *
 * - Either publisher or message bus is unaware of message.
 *    ```
 *   {
 *     firstResponseSubscriberZoneId: undefined,
 *     subscriberClientId: ClientId
 *   }
 *   ```
 *   Response is not "respected".
 */
export interface SocketDataResponseAcknowledgment extends SocketDataBase {
  type: "response-acknowledgment";
  firstResponseSubscriberZoneId: ZoneId | undefined;
  subscriberClientId: ClientId;
  messageId: MessageId;
}

export type SocketData =
  | SocketDataMessage
  | SocketDataResponse
  | SocketDataResponseAcknowledgment;
