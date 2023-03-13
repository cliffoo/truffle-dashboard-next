import type WebSocket from "ws";
import type { ZoneId, ClientId, MessageId } from "dashboard-message-bus-common";
import type { Message } from "./message";

export type Subscriptions = Map<ClientId, Set<ClientId>>;

export interface AuthenticatedMessageBusClientSocket
  extends WebSocket.WebSocket {
  authenticated: true;
  zoneId: ZoneId;
  clientId: ClientId;
  subscriberClientIds: Set<ClientId>;
  messages: Map<MessageId, Message>;
  sentOutstandingMessagesAndResponsesTo: boolean;
}

export interface UnauthenticatedMessageBusClientSocket
  extends WebSocket.WebSocket {
  authenticated: false;
}

export type MessageBusClientSocket =
  | AuthenticatedMessageBusClientSocket
  | UnauthenticatedMessageBusClientSocket;
