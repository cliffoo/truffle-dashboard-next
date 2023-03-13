import type {
  MessageId,
  ClientId,
  NamedSocket,
  SocketDataMessage,
  SocketDataResponse
} from "dashboard-message-bus-common/lib";
import type { ClientEntry } from "./client-entry";

export class Message {
  #id: MessageId;
  #publisherId: ClientId;
  #data: any;
  #responses: Map<
    ClientId,
    {
      exists: boolean;
      acknowledged: boolean;
      data: any;
    }
  >;

  constructor(id: MessageId, publisherEntry: ClientEntry, data: any) {
    this.#id = id;
    this.#publisherId = publisherEntry.id;
    this.#data = data;
    this.#responses = new Map(
      Array.from(publisherEntry.subscriberIds, subscriberId => [
        subscriberId,
        { exists: false, acknowledged: false, data: null }
      ])
    );
  }

  get publisherId() {
    return this.#publisherId;
  }
  get responses() {
    return new Map(this.#responses);
  }
  get finished() {
    return Array.from(this.#responses.values()).every(
      ({ exists, acknowledged }) => exists && acknowledged
    );
  }

  setResponseData(subscriberId: ClientId, data: any) {
    const response = this.#responses.get(subscriberId);
    if (response && !response.exists) {
      response.exists = true;
      response.data = data;
    }
  }
  acknowledgeResponse(subscriberId: ClientId) {
    const response = this.#responses.get(subscriberId);
    if (response) response.acknowledged = true;
  }
  hasResponseFrom(subscriberId: ClientId) {
    const response = this.#responses.get(subscriberId);
    return response && response.exists;
  }

  sendMessageTo(socket: NamedSocket) {
    const message = {
      type: "message",
      clientId: this.#publisherId,
      messageId: this.#id,
      data: this.#data
    } satisfies SocketDataMessage;
    socket.send(JSON.stringify(message));
  }
  sendResponseTo(socket: NamedSocket, subscriberId: ClientId) {
    const response = {
      type: "response",
      clientId: subscriberId,
      messageId: this.#id,
      data: this.#responses.get(subscriberId)?.data
    } satisfies SocketDataResponse;
    socket.send(JSON.stringify(response));
  }
}
