import type { Server } from "http";
import WebSocket from "ws";
import { v4 } from "uuid";
import {
  ZoneId,
  ClientId,
  MessageId,
  LabeledSocket
} from "dashboard-message-bus-common/libbbb";

export class ClientEntry {
  #clientId: ClientId;
  #subscriberClientIds: Set<ClientId>;
  #messages: Map<ZoneId, Set<MessageId>>;
  #secret: string;

  constructor(clientId: ClientId) {
    this.#clientId = clientId;
    this.#subscriberClientIds = new Set();
    this.#messages = new Map();
    this.#secret = v4();
  }

  get secret() {
    return this.#secret;
  }

  addSubscriberId(clientId: ClientId) {
    this.#subscriberClientIds.add(clientId);
  }
  hasSubscriberId(clientId: ClientId) {
    return this.#subscriberClientIds.has(clientId);
  }
}

export type Subscriptions = Record<ClientId, Set<ClientId>>;

export class MessageBus {
  #messages: Map<MessageId, any>;
  #clientEntries: Map<ClientId, ClientEntry>;
  #wsServer: WebSocket.Server<LabeledSocket>;

  constructor(subscriptions: Subscriptions, server: Server) {
    this.#messages = new Map();
    this.#clientEntries = new Map();
    this.#wsServer = new WebSocket.Server({ server });
    this.#setupClientEntries(subscriptions);
    this.#setupWsServer();
  }

  get secrets() {
    return new Map(
      Array.from(this.#clientEntries, ([clientId, { secret }]) => [
        clientId,
        secret
      ])
    );
  }

  get #sockets() {
    return this.#wsServer.clients;
  }

  #setupClientEntries(subscriptions: Subscriptions) {
    for (const [subscriberId, publisherIds] of Object.entries(subscriptions)) {
      publisherIds.forEach(publisherId => {
        this.#setupClientEntry(subscriberId);
        this.#setupClientEntry(publisherId).addSubscriberId(subscriberId);
      });
    }
  }

  #setupClientEntry(clientId: ClientId) {
    return (
      this.#clientEntries.get(clientId) ||
      this.#clientEntries
        .set(clientId, new ClientEntry(clientId))
        .get(clientId)!
    );
  }

  #setupWsServer() {
    this.#wsServer.on("connection", socket => {
      // Auth, then send outstanding, then handle all
    });
  }
}
