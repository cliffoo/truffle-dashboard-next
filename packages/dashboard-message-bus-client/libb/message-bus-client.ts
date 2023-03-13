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
} from "dashboard-message-bus-common/libb";
import { sleep } from "./utils";
import type {
  ResponseAcknowledgmentHandler,
  MessageHandler,
  Responses
} from "./types";

export class MessageBusClient {
  #zoneId: ZoneId;
  #clientId: ClientId;
  #secret: string;
  #serverHost: string;
  #messageHandlers: Map<ClientId, MessageHandler>;
  #responses: Map<MessageId, Responses>;
  #responseAcknowledgmentHandlers: Map<
    MessageId,
    ResponseAcknowledgmentHandler
  >;
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

  async #sendMessage(messageId: MessageId, data: any) {
    await this.#send<SocketDataMessage>({
      type: "message",
      zoneId: this.#zoneId,
      clientId: this.#clientId,
      messageId,
      data
    });
  }

  async #sendResponse(messageId: MessageId, data: any) {
    await this.#send<SocketDataResponse>({
      type: "response",
      zoneId: this.#zoneId,
      clientId: this.#clientId,
      messageId,
      data
    });
  }

  async #sendResponseAcknowledgment(
    messageId: MessageId,
    subscriberZoneId: ZoneId | undefined,
    subscriberClientId: ClientId
  ) {
    await this.#send<SocketDataResponseAcknowledgment>({
      type: "response-acknowledgment",
      zoneId: this.#zoneId,
      clientId: this.#clientId,
      subscriberZoneId,
      subscriberClientId,
      messageId
    });
  }

  async #handleMessage({
    zoneId: _publisherZoneId,
    clientId: publisherClientId,
    messageId,
    data
  }: SocketDataMessage) {
    const handler = this.#messageHandlers.get(publisherClientId);
    if (!handler) return;

    const { response: responseData, onAck } = await handler(data);
    if (onAck) this.#responseAcknowledgmentHandlers.set(messageId, onAck);

    await this.#sendResponse(messageId, responseData);
  }

  async #handleResponse({
    zoneId: subscriberZoneId,
    clientId: subscriberClientId,
    messageId,
    data
  }: SocketDataResponse) {
    const responses = this.#responses.get(messageId);
    if (!responses) {
      await this.#sendResponseAcknowledgment(
        messageId,
        undefined,
        subscriberClientId
      );
      return;
    }

    let response = responses.get(subscriberClientId);
    if (response?.hasData) {
      await this.#sendResponseAcknowledgment(
        messageId,
        response.subscriberZoneId,
        subscriberClientId
      );
      return;
    }

    if (!response) {
      await this.#sendResponseAcknowledgment(
        messageId,
        subscriberZoneId,
        subscriberClientId
      );
      response = responses
        .set(subscriberClientId, {
          subscriberZoneId,
          data,
          hasData: true
        })
        .get(subscriberClientId)!;
    }

    response.resolveData?.([data, true]);
  }

  async #handleResponseAcknowledgment({
    zoneId: _publisherZoneId,
    clientId: _publisherClientId,
    subscriberZoneId,
    subscriberClientId,
    messageId
  }: SocketDataResponseAcknowledgment) {
    const handler = this.#responseAcknowledgmentHandlers.get(messageId);
    if (!handler) return;

    const ownResponseAcknowledged =
      this.#zoneId === subscriberZoneId &&
      this.#clientId === subscriberClientId;
    await handler(ownResponseAcknowledged);

    this.#responseAcknowledgmentHandlers.delete(messageId);
  }

  #createMessageLifecycle(messageId: MessageId) {
    return {
      responseFrom: (subscriberClientId: ClientId) => {
        const responses = this.#responses.get(messageId);
        if (!responses) throw new Error("Message not found");

        const response =
          responses.get(subscriberClientId) ||
          responses.set(subscriberClientId, {}).get(subscriberClientId)!;

        return new Promise<unknown>(resolve => {
          if (response.hasData) resolve([response.data, true]);
          response.resolveData = resolve;
        });
      },
      finish: () => {
        const responses = this.#responses.get(messageId);
        if (!responses) throw new Error("Message not found");

        responses.forEach(response =>
          response.resolveData?.([undefined, false])
        );

        this.#responses.delete(messageId);
      }
    };
  }

  async publish(data: any) {
    const messageId = v4();

    this.#responses.set(messageId, new Map());

    await this.#sendMessage(messageId, data);

    return this.#createMessageLifecycle(messageId);
  }
}
