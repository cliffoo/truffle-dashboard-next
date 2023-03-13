import WebSocket from "ws";
import type {
  MessageId,
  ClientId,
  NamedSocket,
  SocketDataMessage,
  SocketDataResponse,
  SocketDataResponseAcknowledgement,
  SocketData
} from "dashboard-message-bus-common/lib";
import { Message } from "./message";
import { ClientEntry } from "./client-entry";
import type { Subscriptions } from "./types";

export class MessageBus {
  #messages: Map<MessageId, Message>;
  #clientEntries: Map<ClientId, ClientEntry>;
  #wsServer: WebSocket.Server<NamedSocket>;

  constructor(subscriptions: Subscriptions) {
    this.#messages = new Map();
    this.#clientEntries = new Map();
    this.#wsServer = new WebSocket.Server();
    this.#setupClientEntries(subscriptions);
    this.#setupWsServer();
  }

  /** Get mapping of client id to client secret. */
  get secrets() {
    return new Map(
      Array.from(this.#clientEntries, ([clientId, { secret }]) => [
        clientId,
        secret
      ])
    );
  }

  /** Get all WebSocket connections. */
  get #sockets() {
    return this.#wsServer.clients;
  }

  /**
   * Solve all publish-subscribe relationships and populate `this.#clientEntries`.
   * @param subscriptions - Mapping of subscriber id to array of publisher ids.
   */
  #setupClientEntries(subscriptions: Subscriptions) {
    for (const [subscriberId, publisherIds] of Object.entries(subscriptions)) {
      publisherIds.forEach(publisherId => {
        this.#setupClientEntry(subscriberId);
        this.#setupClientEntry(publisherId).addSubscriberId(subscriberId);
      });
    }
  }

  /**
   * Create (if not present) and return ClientEntry.
   * @param clientId
   * @returns ClientEntry.
   */
  #setupClientEntry(clientId: ClientId) {
    let clientEntry = this.#clientEntries.get(clientId);
    if (!clientEntry) {
      clientEntry = new ClientEntry(clientId);
      this.#clientEntries.set(clientId, clientEntry);
    }
    return clientEntry;
  }

  /**
   * Handle authenticated connections to the WebSocket server.
   * On connect, send all outstanding messages and responses.
   * Listen for incoming socket data. The `type` property of the parsed socket
   * data communicates the action to perform:
   * - "message": As publisher, publish message to all subscribers.
   * - "response": As subscriber, send response to message.
   * - "response-acknowledgment": As publisher, acknowledge response (to a
   *    previously published message) as received.
   */
  #setupWsServer() {
    this.#wsServer.on("connection", socket => {
      this.#sendOutstandingMessagesAndResponses(socket);

      socket.on("message", (rawSocketData: string) => {
        const socketData: SocketData = JSON.parse(rawSocketData);
        if (socketData.clientId !== socket.clientId) return;

        switch (socketData.type) {
          case "message":
            return this.#handleMessage(socketData);
          case "response":
            return this.#handleResponse(socketData);
          case "response-acknowledgement":
            return this.#handleResponseAcknowledgement(socketData);
        }
      });
    });
  }

  /**
   * Send to socket:
   * - (Socket as subscriber) messages that haven't been responded to.
   * - (Socket as publisher) responses that haven't been acknowledged.
   * This should be done when socket connection is first established, to make
   * up for any missed messages and responses while disconnected.
   * @param socket - Socket to send to.
   */
  #sendOutstandingMessagesAndResponses(socket: NamedSocket) {
    // Send messages that haven't been responded to.
    this.#clientEntries.forEach(clientEntry => {
      if (clientEntry.hasSubscriberId(socket.clientId)) {
        clientEntry.messageIds.forEach(messageId => {
          const message = this.#messages.get(messageId)!;
          if (!message.hasResponseFrom(socket.clientId)) {
            message.sendMessageTo(socket);
          }
        });
      }
    });

    // Send responses that haven't been acknowledged.
    const clientEntry = this.#clientEntries.get(socket.clientId)!;
    clientEntry.messageIds.forEach(messageId => {
      const message = this.#messages.get(messageId)!;
      message.responses.forEach((response, subscriberId) => {
        if (response.exists && !response.acknowledged) {
          message.sendResponseTo(socket, subscriberId);
        }
      });
    });
  }

  #handleMessage({
    clientId: publisherId,
    messageId,
    data
  }: SocketDataMessage) {
    const publisherEntry = this.#clientEntries.get(publisherId)!;

    const noSubscribers = publisherEntry.subscriberIds.size === 0;
    const duplicateMessageIds = this.#messages.has(messageId);
    if (noSubscribers || duplicateMessageIds) return;

    const message = new Message(messageId, publisherEntry, data);
    this.#messages.set(messageId, message);
    publisherEntry.addMessageId(messageId);

    for (const socket of this.#sockets) {
      if (publisherEntry.hasSubscriberId(socket.clientId))
        message.sendMessageTo(socket);
    }
  }

  #handleResponse({
    clientId: subscriberId,
    messageId,
    data
  }: SocketDataResponse) {
    const message = this.#messages.get(messageId);
    if (!message) return;

    message.setResponseData(subscriberId, data);

    for (const socket of this.#sockets) {
      if (socket.clientId === message.publisherId) {
        return message.sendResponseTo(socket, subscriberId);
      }
    }
  }

  #handleResponseAcknowledgement({
    clientId: publisherId,
    subscriberId,
    messageId
  }: SocketDataResponseAcknowledgement) {
    const message = this.#messages.get(messageId);
    if (!message) return;

    message.acknowledgeResponse(subscriberId);

    if (message.finished) {
      const publisherEntry = this.#clientEntries.get(publisherId)!;
      publisherEntry.removeMessageId(messageId);
      this.#messages.delete(messageId);
    }
  }
}
