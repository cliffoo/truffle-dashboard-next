import type { ZoneId, ClientId, MessageId } from "./ids";

interface SocketDataBase {
  type:
    | "auth-request"
    | "auth-response"
    | "message"
    | "response"
    | "response-acknowledgment";
}

interface SocketDataAuthBase extends SocketDataBase {
  type: "auth-request" | "auth-response";
}

/** Request to authenticate `clientId` in `zoneId` */
export interface SocketDataAuthRequest extends SocketDataAuthBase {
  type: "auth-request";
  zoneId: ZoneId;
  clientId: ClientId;
  secret: string;
}

/** Response to `SocketDataAuthRequest` */
export interface SocketDataAuthResponse extends SocketDataAuthBase {
  type: "auth-response";
  authenticated: boolean;
}

/**
 * From `clientId` in `zoneId`.
 *
 * Currently there is one case where the sender is not known: When a subscriber
 * responds to a message that the message bus isn't aware of. In this case the
 * message bus should send `SocketDataResponseAcknowledgment` with `clientId`
 * and `zoneId` as empty strings.
 */
interface SocketDataLifecycleBase extends SocketDataBase {
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
export interface SocketDataMessage extends SocketDataLifecycleBase {
  type: "message";
  messageId: MessageId;
  data: any;
}

/** Response to message (id: `messageId`) with `data` */
export interface SocketDataResponse extends SocketDataLifecycleBase {
  type: "response";
  messageId: MessageId;
  data: any;
}

/**
 * Acknowledgment of response (from `subscriberClientId` in `subscriberZoneId`)
 * to message (id: messageId).
 *
 * Let:
 * - A: Both publisher and message bus are aware of message.
 * - B: For all subscribers with `subscriberClientId`, response from the one in
 *      `subscriberZoneId` reached message bus first, and is the only one
 *      accepted by publisher.
 *
 * `responseAccepted` is:
 * - `true` if A && B.
 * - `false` otherwise.
 */
export interface SocketDataResponseAcknowledgment
  extends SocketDataLifecycleBase {
  type: "response-acknowledgment";
  subscriberZoneId: ZoneId;
  subscriberClientId: ClientId;
  responseAccepted: boolean;
  messageId: MessageId;
}

type SocketDataLifecycle =
  | SocketDataMessage
  | SocketDataResponse
  | SocketDataResponseAcknowledgment;

export type SocketDataFromClient = SocketDataAuthRequest | SocketDataLifecycle;

export type SocketDataFromBus = SocketDataAuthResponse | SocketDataLifecycle;
