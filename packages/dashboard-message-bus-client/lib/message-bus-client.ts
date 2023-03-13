import WebSocket from "isomorphic-ws";
import { v4 } from "uuid";
import type {
  ZoneId,
  ClientId,
  MessageId,
  SocketDataAuthRequest,
  SocketDataAuthResponse,
  SocketDataMessage,
  SocketDataResponse,
  SocketDataResponseAcknowledgment,
  SocketDataFromClient,
  SocketDataFromBus,
  WebSocketProtocol
} from "dashboard-message-bus-common";
import { Response } from "./response";
import { MessageLifecycle } from "./message-lifecycle";
import { sleep } from "./utils";
import type { MessageHandler, ResponseAcknowledgmentHandler } from "./types";

export class MessageBusClient {
  #zoneId: ZoneId;
  #clientId: ClientId;
  #secret: string;
  #serverHost: string;
  #serverProtocol: WebSocketProtocol;
  #messageHandlers: Map<ClientId, MessageHandler>;
  #responsesForAllMessages: Map<MessageId, Map<ClientId, Response>>;
  #responseAcknowledgmentHandlers: Map<ClientId, ResponseAcknowledgmentHandler>;
  #socket: WebSocket.WebSocket;
  #socketAuthenticated: boolean;

  constructor(
    zoneId: ZoneId,
    clientId: ClientId,
    secret: string,
    serverHost: string,
    serverProtocol: WebSocketProtocol,
    messageHandlers: Record<ClientId, MessageHandler>
  ) {
    this.#zoneId = zoneId;
    this.#clientId = clientId;
    this.#secret = secret;
    this.#serverHost = serverHost;
    this.#serverProtocol = serverProtocol;
    this.#messageHandlers = new Map(Object.entries(messageHandlers));
    this.#responsesForAllMessages = new Map();
    this.#responseAcknowledgmentHandlers = new Map();
    this.#socket = this.#createSocket();
    this.#socketAuthenticated = false;
  }

  get #ids() {
    return {
      zoneId: this.#zoneId,
      clientId: this.#clientId
    };
  }

  #createSocket() {
    const url = this.#serverProtocol + "://" + this.#serverHost;
    const socket = new WebSocket.WebSocket(url);
    socket.on("open", () => {
      socket.send(
        JSON.stringify({
          type: "auth-request",
          ...this.#ids,
          secret: this.#secret
        } satisfies SocketDataAuthRequest)
      );
    });
    socket.on("message", (rawSocketData: string) => {
      const socketData: SocketDataFromBus = JSON.parse(rawSocketData);
      switch (socketData.type) {
        case "auth-response":
          return this.#handleAuthResponse(socketData);
        case "message":
          return this.#handleMessage(socketData);
        case "response":
          return this.#handleResponse(socketData);
        case "response-acknowledgment":
          return this.#handleResponseAcknowledgment(socketData);
      }
    });
    socket.on("close", () => (this.#socketAuthenticated = false));
    return socket;
  }

  async ready(recursionDepth = 0): Promise<void> {
    if (recursionDepth === 60) {
      this.#socket.terminate();
      return this.ready();
    }
    switch (this.#socket.readyState) {
      case WebSocket.OPEN:
        if (this.#socketAuthenticated) return;
      case WebSocket.CONNECTING:
      case WebSocket.CLOSING:
        await sleep(50);
        return this.ready(recursionDepth + 1);
      case WebSocket.CLOSED:
        this.#socket = this.#createSocket();
        this.#socketAuthenticated = false;
        return this.ready();
    }
  }

  async #send<T extends SocketDataFromClient>(socketData: T) {
    await this.ready();
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
    subscriberZoneId: ZoneId,
    subscriberClientId: ClientId,
    responseAccepted: boolean
  ) {
    return this.#send<SocketDataResponseAcknowledgment>({
      type: "response-acknowledgment",
      ...this.#ids,
      subscriberZoneId,
      subscriberClientId,
      responseAccepted,
      messageId
    });
  }

  #handleAuthResponse({ authenticated }: SocketDataAuthResponse) {
    this.#socketAuthenticated = authenticated;
    if (!authenticated) throw new Error("Failed to authenticate");
  }

  async #handleMessage({
    clientId: publisherClientId,
    messageId,
    data
  }: SocketDataMessage) {
    const handler = this.#messageHandlers.get(publisherClientId);
    if (!handler)
      throw new Error(`Unable to handle messages from ${publisherClientId}`);

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
    const acknowledgeResponse = (responseAccepted: boolean) =>
      this.#sendResponseAcknowledgment(
        messageId,
        subscriberZoneId,
        subscriberClientId,
        responseAccepted
      );

    const responses = this.#responsesForAllMessages.get(messageId);
    if (!responses) return acknowledgeResponse(false);

    const response =
      responses.get(subscriberClientId) ||
      responses
        .set(subscriberClientId, new Response())
        .get(subscriberClientId)!;
    if (!response.didInit) response.init(subscriberZoneId, data);
    await acknowledgeResponse(response.acceptedZoneId! === subscriberZoneId);

    response.resolve();
  }

  async #handleResponseAcknowledgment({
    responseAccepted,
    messageId
  }: SocketDataResponseAcknowledgment) {
    const handler = this.#responseAcknowledgmentHandlers.get(messageId);
    if (!handler) return;
    this.#responseAcknowledgmentHandlers.delete(messageId);
    await handler(responseAccepted);
  }

  async publish(data: any) {
    const messageId = v4();
    this.#responsesForAllMessages.set(messageId, new Map());
    await this.#sendMessage(messageId, data);
    return new MessageLifecycle(messageId, this.#responsesForAllMessages);
  }
}
