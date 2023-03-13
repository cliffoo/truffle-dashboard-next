import WebSocket from "isomorphic-ws";
import { v4 } from "uuid";
import type {
  MessageId,
  ClientId,
  SocketDataMessage,
  SocketDataResponse,
  SocketDataResponseAcknowledgement
} from "dashboard-message-bus-common/lib";
import { sleep } from "./utils";

export class MessageBusClient<
  MessageData = any,
  PublisherId extends string = ClientId
> {
  #id: ClientId;
  #wsServerUri: string;
  #messageHandlers: Map<PublisherId, Function>;
  #responseHandlers: Map<MessageId, Map<ClientId, Function>>;
  #socket: WebSocket.WebSocket;

  constructor(
    id: ClientId,
    wsServerUri: string,
    messageHandlers: [PublisherId, Function][]
  ) {
    this.#id = id;
    this.#wsServerUri = wsServerUri;
    this.#messageHandlers = new Map(messageHandlers);
    this.#responseHandlers = new Map();
    this.#socket = this.#createSocket();
    this.#setupSocket();
  }

  #createSocket() {
    return new WebSocket.WebSocket(this.#wsServerUri);
  }

  #setupSocket() {
    this.#socket.on("message", (rawSocketData: string) => {
      const socketData: SocketDataMessage | SocketDataResponse =
        JSON.parse(rawSocketData);

      switch (socketData.type) {
        case "message":
          return this.#handleMessage(socketData);
        case "response":
          return this.#handleResponse(socketData);
      }
    });
  }

  async ensureConnected(recursionDepth = 0): Promise<void> {
    if (recursionDepth === 10) {
      this.#socket.terminate();
      return this.ensureConnected();
    }

    switch (this.#socket.readyState) {
      case WebSocket.OPEN:
        return;
      case WebSocket.CONNECTING:
      case WebSocket.CLOSING:
        await sleep(50);
        return this.ensureConnected(recursionDepth + 1);
      case WebSocket.CLOSED:
        this.#socket = this.#createSocket();
        return this.ensureConnected();
    }
  }

  async #handleMessage({
    clientId: publisherId,
    messageId,
    data
  }: SocketDataMessage) {
    const handler = this.#messageHandlers.get(publisherId as PublisherId);

    const response = {
      type: "response",
      clientId: this.#id,
      messageId,
      data: await handler?.(data)
    } satisfies SocketDataResponse;

    await this.ensureConnected();
    this.#socket.send(JSON.stringify(response));
  }

  async #handleResponse({
    clientId: subscriberId,
    messageId,
    data
  }: SocketDataResponse) {
    const handler = this.#responseHandlers.get(messageId);

    await handler?.get(subscriberId)?.(data);
    handler?.delete(subscriberId);

    const acknowledgement = {
      type: "response-acknowledgement",
      clientId: this.#id,
      subscriberId,
      messageId
    } satisfies SocketDataResponseAcknowledgement;

    await this.ensureConnected();
    this.#socket.send(JSON.stringify(acknowledgement));

    if (handler?.size === 0) this.#responseHandlers.delete(messageId);
  }

  async publish(
    data: MessageData,
    responseHandlers: [ClientId, Function][] = []
  ) {
    const messageId = v4();
    if (responseHandlers.length > 0)
      this.#responseHandlers.set(messageId, new Map(responseHandlers));

    const message = {
      type: "message",
      clientId: this.#id,
      messageId,
      data
    } satisfies SocketDataMessage;

    await this.ensureConnected();
    this.#socket.send(JSON.stringify(message));
  }
}
