import WebSocket from "isomorphic-ws";
import { v4 } from "uuid";
import type {
  ZoneId,
  ClientId,
  MessageId,
  SocketDataMessage,
  SocketDataResponse,
  SocketDataResponseAcknowledgment,
  SocketData
} from "dashboard-message-bus-common/libbb";
import { Response } from "./response";
import { Lifecycle } from "./lifecycle";
import { sleep } from "./utils";
import type {
  MessageHandler,
  Responses,
  ResponseAcknowledgmentHandler
} from "./types";

export class MessageBusClient {
  #zoneId: ZoneId;
  #clientId: ClientId;
  #secret: string;
  #serverHost: string;
  #messageHandlers: Map<ClientId, MessageHandler>;
  #responses: Map<MessageId, Responses>;
  #responseAcknowledgmentHandlers: Map<ClientId, ResponseAcknowledgmentHandler>;
  #socket: WebSocket.WebSocket;

  constructor(
    zoneId: ZoneId,
    clientId: ClientId,
    secret: string,
    serverHost: string,
    messageHandlers: Record<ClientId, MessageHandler>
  ) {
    this.#zoneId = zoneId;
    this.#clientId = clientId;
    this.#secret = secret;
    this.#serverHost = serverHost;
    this.#messageHandlers = new Map(Object.entries(messageHandlers));
    this.#responses = new Map();
    this.#responseAcknowledgmentHandlers = new Map();
    this.#socket = this.#createSocket();
  }

  get #ids() {
    return { zoneId: this.#zoneId, clientId: this.#clientId };
  }

  #createSocket() {
    const params = [
      ["zone_id", this.#zoneId],
      ["client_id", this.#clientId],
      ["secret", this.#secret]
    ]
      .map(param => param.join("="))
      .join("&");
    const url = "ws://" + this.#serverHost + "?" + params;

    const socket = new WebSocket.WebSocket(url);
    socket.on("message", (rawSocketData: string) => {
      const socketData: SocketData = JSON.parse(rawSocketData);

      switch (socketData.type) {
        case "message":
          return this.#handleMessage(socketData);
        case "response":
          return this.#handleResponse(socketData);
        case "response-acknowledgment":
          return this.#handleResponseAcknowledgment(socketData);
      }
    });

    return socket;
  }

  async ensureConnected(recursionDepth = 0): Promise<void> {
    if (recursionDepth === 20) {
      this.#socket.terminate();
      return this.ensureConnected();
    }

    switch (this.#socket.readyState) {
      case WebSocket.OPEN:
        return;
      case WebSocket.CONNECTING:
      case WebSocket.CLOSING:
        await sleep(100);
        return this.ensureConnected(recursionDepth + 1);
      case WebSocket.CLOSED:
        this.#socket = this.#createSocket();
        return this.ensureConnected();
    }
  }

  async #send<T extends SocketData>(socketData: T) {
    await this.ensureConnected();
    this.#socket.send(JSON.stringify(socketData));
  }

  #sendMessage(messageId: MessageId, data: any) {
    return this.#send<SocketDataMessage>({
      type: "message",
      ...this.#ids,
      messageId,
      data
    });
  }

  #sendResponse(messageId: MessageId, data: any) {
    return this.#send<SocketDataResponse>({
      type: "response",
      ...this.#ids,
      messageId,
      data
    });
  }

  #sendResponseAcknowledgment(
    messageId: MessageId,
    firstResponseSubscriberZoneId: ZoneId | undefined,
    subscriberClientId: ClientId
  ) {
    return this.#send<SocketDataResponseAcknowledgment>({
      type: "response-acknowledgment",
      ...this.#ids,
      firstResponseSubscriberZoneId,
      subscriberClientId,
      messageId
    });
  }

  async #handleMessage({
    clientId: publisherClientId,
    messageId,
    data
  }: SocketDataMessage) {
    const handler = this.#messageHandlers.get(publisherClientId);
    if (!handler)
      throw new Error(`Cannot handle messages from ${publisherClientId}`);

    const responseAcknowledgmentHandler = await handler(data, responseData =>
      this.#sendResponse(messageId, responseData)
    );
    if (responseAcknowledgmentHandler) {
      this.#responseAcknowledgmentHandlers.set(
        messageId,
        responseAcknowledgmentHandler
      );
    }
  }

  async #handleResponse({
    zoneId: subscriberZoneId,
    clientId: subscriberClientId,
    messageId,
    data
  }: SocketDataResponse) {
    const acknowledgeResponse = (firstZoneId: ZoneId | undefined) =>
      this.#sendResponseAcknowledgment(
        messageId,
        firstZoneId,
        subscriberClientId
      );

    const responses = this.#responses.get(messageId);
    if (!responses) return acknowledgeResponse(undefined);

    const response =
      responses.get(subscriberClientId) ||
      responses
        .set(subscriberClientId, new Response())
        .get(subscriberClientId)!;
    if (!response.exists) response.set(subscriberZoneId, data);
    await acknowledgeResponse(response.firstZoneId);

    response.resolve();
  }

  async #handleResponseAcknowledgment({
    firstResponseSubscriberZoneId,
    messageId
  }: SocketDataResponseAcknowledgment) {
    const handler = this.#responseAcknowledgmentHandlers.get(messageId);
    if (!handler) return;
    this.#responseAcknowledgmentHandlers.delete(messageId);

    await handler(this.#zoneId === firstResponseSubscriberZoneId);
  }

  async publish(data: any) {
    const messageId = v4();
    this.#responses.set(messageId, new Map());
    await this.#sendMessage(messageId, data);
    return new Lifecycle(messageId, new WeakRef(this.#responses));
  }
}
