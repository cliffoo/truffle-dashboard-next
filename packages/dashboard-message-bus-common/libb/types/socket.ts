import type WebSocket from "ws";
import type { ZoneId, ClientId } from "./ids";

export interface LabeledSocket extends WebSocket.WebSocket {
  zoneId: ZoneId;
  clientId: ClientId;
}
