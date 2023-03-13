import { v4 } from "uuid";
import type { MessageId, ClientId } from "dashboard-message-bus-common";

export class ClientEntry {
  #id: ClientId;
  #secret: string;
  #messageIds: Set<MessageId>;
  #subscriberIds: Set<ClientId>;

  constructor(id: ClientId) {
    this.#id = id;
    this.#secret = v4();
    this.#messageIds = new Set();
    this.#subscriberIds = new Set();
  }

  get id() {
    return this.#id;
  }
  get secret() {
    return this.#secret;
  }
  get messageIds() {
    return new Set(this.#messageIds);
  }
  get subscriberIds() {
    return new Set(this.#subscriberIds);
  }

  addMessageId(messageId: MessageId) {
    this.#messageIds.add(messageId);
  }
  removeMessageId(messageId: MessageId) {
    this.#messageIds.delete(messageId);
  }
  addSubscriberId(clientId: ClientId) {
    this.#subscriberIds.add(clientId);
  }
  hasSubscriberId(clientId: ClientId) {
    return this.#subscriberIds.has(clientId);
  }
}
