import type { ZoneId, ClientId, MessageId } from "dashboard-message-bus-common";
import type { AuthenticatedMessageBusClientSocket } from "./types";

export class Message {
  #id: MessageId;
  #data: any;
  #publisherZoneId: ZoneId;
  #publisherClientId: ClientId;
  #numSubscriberClientIds: number;
  #firstResponses: Map<
    ClientId,
    { subscriberZoneId: ZoneId; acknowledged: boolean; data: any }
  >;

  constructor(
    id: MessageId,
    data: any,
    publisherZoneId: ZoneId,
    publisherClientId: ClientId,
    numSubscriberClientIds: number
  ) {
    this.#id = id;
    this.#data = data;
    this.#publisherZoneId = publisherZoneId;
    this.#publisherClientId = publisherClientId;
    this.#numSubscriberClientIds = numSubscriberClientIds;
    this.#firstResponses = new Map();
  }

  get id() {
    return this.#id;
  }

  get data() {
    return this.#data;
  }

  get publisherZoneId() {
    return this.#publisherZoneId;
  }

  get publisherClientId() {
    return this.#publisherClientId;
  }

  get firstResponses() {
    return this.#firstResponses;
  }

  get finished() {
    return (
      this.#firstResponses.size === this.#numSubscriberClientIds &&
      [...this.#firstResponses]
        .map(([_subscriberClientId, { acknowledged }]) => acknowledged)
        .every(Boolean)
    );
  }

  isPublishedBySocket(socket: AuthenticatedMessageBusClientSocket) {
    return (
      this.#publisherZoneId === socket.zoneId &&
      this.#publisherClientId === socket.clientId
    );
  }
}
