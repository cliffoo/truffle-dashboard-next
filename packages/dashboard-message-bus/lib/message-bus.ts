import WebSocket from "ws";
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
  SocketDataFromBus
} from "dashboard-message-bus-common";
import { Message } from "./message";
import type {
  Subscriptions,
  AuthenticatedMessageBusClientSocket,
  UnauthenticatedMessageBusClientSocket,
  MessageBusClientSocket
} from "./types";

export class MessageBus {
  #messages: Map<MessageId, Message>;
  #publisherClientIdToSubscriberClientIds: Subscriptions;
  #secrets: Map<ClientId, string>;
  #wsServer: WebSocket.Server<MessageBusClientSocket>;

  constructor(publisherClientIdToSubscriberClientIds: Subscriptions) {
    this.#messages = new Map();
    this.#publisherClientIdToSubscriberClientIds =
      publisherClientIdToSubscriberClientIds;
    this.#secrets = this.#createSecrets();
    this.#wsServer = this.#createWsServer();
  }

  /** Mapping of client id to client secret */
  get secrets() {
    return new Map(this.#secrets);
  }

  /** Set of all open socket connections */
  get #sockets() {
    return this.#wsServer.clients;
  }

  #createSecrets() {
    if (!this.#publisherClientIdToSubscriberClientIds)
      throw new Error("Cannot create secrets without subscription info");

    const secrets: Map<ClientId, string> = new Map();
    this.#publisherClientIdToSubscriberClientIds.forEach(
      (subscriberClientIds, publisherClientId) => {
        [...subscriberClientIds, publisherClientId].forEach(
          clientId => void !secrets.has(clientId) && secrets.set(clientId, v4())
        );
      }
    );
    return secrets;
  }

  /**
   * Create and return WebSocket server set up with necessary handlers.
   *
   * The `type` property of parsed incoming socket data is used to communicate
   * the action to perform:
   * - "auth-request": Request to authenticate socket.
   *     On initial successful authentication, send all outstanding messages
   *     and responses.
   * - "message": Socket, as publisher, publish message to all subscribers.
   * - "response": Socket, as subscriber, respond to message.
   * - "response-acknowledgment": Socket, as publisher, acknowledge response
   *   (to a previously published message) as received, and possibly accepted.
   *
   * All actions require socket to be authenticated, except for "auth-request".
   */
  #createWsServer() {
    const wsServer = new WebSocket.Server<MessageBusClientSocket>({
      clientTracking: true
    });

    wsServer.on("connection", socket => {
      socket.authenticated = false;

      socket.on("message", (rawSocketData: string) => {
        const socketData: SocketDataFromClient = JSON.parse(rawSocketData);

        if (socketData.type === "auth-request")
          this.#handleAuthRequest(socketData, socket);

        if (
          !socket.authenticated ||
          socket.zoneId !== socketData.zoneId ||
          socket.clientId !== socketData.clientId
        )
          return socket.close();

        if (!socket.sentOutstandingMessagesAndResponsesTo)
          this.#sendOutstandingMessagesAndResponses(socket);

        switch (socketData.type) {
          case "message":
            return this.#handleMessage(socketData, socket);
          case "response":
            return this.#handleResponse(socketData, socket);
          case "response-acknowledgment":
            return this.#handleResponseAcknowledgment(socketData, socket);
        }
      });
    });

    return wsServer;
  }

  #send<T extends SocketDataFromBus>(
    socketData: T,
    socket: MessageBusClientSocket
  ) {
    if (socket.readyState === WebSocket.OPEN)
      socket.send(JSON.stringify(socketData));
  }

  #sendAuthResponse(authenticated: boolean, socket: MessageBusClientSocket) {
    return this.#send<SocketDataAuthResponse>(
      { type: "auth-response", authenticated },
      socket
    );
  }

  #sendMessage(
    publisherZoneId: ZoneId,
    publisherClientId: ClientId,
    messageId: MessageId,
    data: any,
    subscriberSocket: AuthenticatedMessageBusClientSocket
  ) {
    return this.#send<SocketDataMessage>(
      {
        type: "message",
        zoneId: publisherZoneId,
        clientId: publisherClientId,
        messageId,
        data
      },
      subscriberSocket
    );
  }

  #sendResponse(
    subscriberZoneId: ZoneId,
    subscriberClientId: ClientId,
    messageId: MessageId,
    data: any,
    publisherSocket: AuthenticatedMessageBusClientSocket
  ) {
    return this.#send<SocketDataResponse>(
      {
        type: "response",
        zoneId: subscriberZoneId,
        clientId: subscriberClientId,
        messageId,
        data
      },
      publisherSocket
    );
  }

  #sendResponseAcknowledgment(
    publisherZoneId: ZoneId,
    publisherClientId: ClientId,
    responseAccepted: boolean,
    messageId: MessageId,
    subscriberSocket: AuthenticatedMessageBusClientSocket
  ) {
    return this.#send<SocketDataResponseAcknowledgment>(
      {
        type: "response-acknowledgment",
        zoneId: publisherZoneId,
        clientId: publisherClientId,
        subscriberZoneId: subscriberSocket.zoneId,
        subscriberClientId: subscriberSocket.clientId,
        responseAccepted,
        messageId
      },
      subscriberSocket
    );
  }

  /**
   * Send to socket:
   * - (Socket as subscriber) messages that socket hasn't responded to.
   * - (Socket as publisher) responses that socket hasn't acknowledged.
   *
   * This should be done when connection is established, to try to recover from
   * any missed messages and responses due to dropped connection.
   *
   * Limitation: Missed response acknowledgments due to dropped subscriber
   * connection are not recovered.
   */
  #sendOutstandingMessagesAndResponses(
    socket: AuthenticatedMessageBusClientSocket
  ) {
    if (socket.sentOutstandingMessagesAndResponsesTo)
      throw new Error(
        "Already sent outstanding messages and responses to socket"
      );

    // Send messages that socket hasn't responded to
    this.#sockets.forEach(publisherSocket => {
      if (
        publisherSocket.authenticated &&
        publisherSocket.subscriberClientIds.has(socket.clientId)
      ) {
        publisherSocket.messages.forEach(message => {
          if (!message.firstResponses.has(socket.clientId)) {
            this.#sendMessage(
              publisherSocket.zoneId,
              publisherSocket.clientId,
              message.id,
              message.data,
              socket
            );
          }
        });
      }
    });

    // Send responses that socket hasn't acknowledged
    socket.messages.forEach(message => {
      message.firstResponses.forEach(
        (firstResponse, subscriberClientId) =>
          void !firstResponse.acknowledged &&
          this.#sendResponse(
            firstResponse.subscriberZoneId,
            subscriberClientId,
            message.id,
            message.data,
            socket
          )
      );
    });

    socket.sentOutstandingMessagesAndResponsesTo = true;
  }

  /**
   * Mutate socket with initialized `AuthenticatedMessageBusClientSocket` type
   * properties.
   */
  #initAuthenticatedClient(
    zoneId: ZoneId,
    clientId: ClientId,
    unauthenticatedSocket: UnauthenticatedMessageBusClientSocket
  ) {
    const socket =
      unauthenticatedSocket as unknown as AuthenticatedMessageBusClientSocket;
    socket.authenticated = true;
    socket.zoneId = zoneId;
    socket.clientId = clientId;
    socket.subscriberClientIds =
      this.#publisherClientIdToSubscriberClientIds.get(clientId)!;
    socket.messages = new Map();
    this.#messages.forEach(
      message =>
        void message.isPublishedBySocket(socket) &&
        socket.messages.set(message.id, message)
    );
    socket.sentOutstandingMessagesAndResponsesTo = false;
  }

  #getSocketByIds(zoneId: ZoneId, clientId: ClientId) {
    for (const socket of this.#sockets) {
      if (
        socket.authenticated &&
        socket.zoneId === zoneId &&
        socket.clientId === clientId
      ) {
        return socket;
      }
    }
  }

  #getSubscriberSockets(publisherSocket: AuthenticatedMessageBusClientSocket) {
    return [...this.#sockets].filter(
      socket =>
        socket.authenticated &&
        publisherSocket.subscriberClientIds.has(socket.clientId) &&
        (publisherSocket.zoneId === socket.zoneId ||
          publisherSocket.zoneId === "*" ||
          socket.zoneId === "*")
    ) as AuthenticatedMessageBusClientSocket[];
  }

  #handleAuthRequest(
    { zoneId, clientId, secret }: SocketDataAuthRequest,
    socket: MessageBusClientSocket
  ) {
    if (socket.authenticated) return this.#sendAuthResponse(true, socket);
    if (typeof secret === "string" && this.#secrets.get(clientId) === secret) {
      this.#initAuthenticatedClient(zoneId, clientId, socket);
      this.#sendAuthResponse(true, socket);
    } else {
      this.#sendAuthResponse(false, socket);
    }
  }

  #handleMessage(
    { messageId, data }: SocketDataMessage,
    publisherSocket: AuthenticatedMessageBusClientSocket
  ) {
    const noSubscribers = publisherSocket.subscriberClientIds.size === 0;
    const duplicateMessageIds = this.#messages.has(messageId);
    if (noSubscribers || duplicateMessageIds) return;

    const message = new Message(
      messageId,
      data,
      publisherSocket.zoneId,
      publisherSocket.clientId,
      this.#publisherClientIdToSubscriberClientIds.get(
        publisherSocket.clientId
      )!.size
    );
    this.#messages.set(messageId, message);
    publisherSocket.messages.set(messageId, message);

    this.#getSubscriberSockets(publisherSocket).forEach(subscriberSocket =>
      this.#sendMessage(
        publisherSocket.zoneId,
        publisherSocket.clientId,
        messageId,
        data,
        subscriberSocket
      )
    );
  }

  #handleResponse(
    { messageId, data }: SocketDataResponse,
    subscriberSocket: AuthenticatedMessageBusClientSocket
  ) {
    const message = this.#messages.get(messageId);
    if (!message)
      return this.#sendResponseAcknowledgment(
        "",
        "",
        false,
        messageId,
        subscriberSocket
      );
    const { publisherZoneId, publisherClientId } = message;

    /**
     * If response already exists, send response acknowledgment back directly.
     * We do this instead of relaying new response to publisher, because:
     * - We already know if new response will be accepted.
     * - Publisher socket may be disconnected, and no acknowledgment will be
     *   made, if and when it reconnects.
     */
    const firstResponse = message.firstResponses.get(subscriberSocket.clientId);
    if (firstResponse)
      return this.#sendResponseAcknowledgment(
        publisherZoneId,
        publisherClientId,
        firstResponse.subscriberZoneId === subscriberSocket.zoneId,
        messageId,
        subscriberSocket
      );

    message.firstResponses.set(subscriberSocket.clientId, {
      subscriberZoneId: subscriberSocket.zoneId,
      acknowledged: false,
      data
    });

    const publisherSocket = this.#getSocketByIds(
      publisherZoneId,
      publisherClientId
    );
    if (publisherSocket)
      this.#sendResponse(
        subscriberSocket.zoneId,
        subscriberSocket.clientId,
        messageId,
        data,
        publisherSocket
      );
  }

  #handleResponseAcknowledgment(
    {
      messageId,
      subscriberZoneId,
      subscriberClientId,
      responseAccepted
    }: SocketDataResponseAcknowledgment,
    publisherSocket: AuthenticatedMessageBusClientSocket
  ) {
    const message = this.#messages.get(messageId);
    if (!message) return;

    const subscriberSocket = this.#getSocketByIds(
      subscriberZoneId,
      subscriberClientId
    );
    if (subscriberSocket)
      this.#sendResponseAcknowledgment(
        publisherSocket.zoneId,
        publisherSocket.clientId,
        responseAccepted,
        messageId,
        subscriberSocket
      );

    const response = message.firstResponses.get(subscriberClientId);
    if (response?.subscriberZoneId === subscriberZoneId)
      response.acknowledged = true;

    if (message.finished) {
      publisherSocket.messages.delete(messageId);
      this.#messages.delete(messageId);
    }
  }
}
