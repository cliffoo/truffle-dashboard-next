import type { ClientId, MessageId } from "dashboard-message-bus-common/libbb";
import { Response } from "./response";
import type { Responses } from "./types";

export class Lifecycle {
  #messageId: MessageId;
  #messageBusClientResponsesRef: WeakRef<Map<MessageId, Responses>>;

  constructor(
    messageId: MessageId,
    messageBusClientResponsesRef: WeakRef<Map<MessageId, Responses>>
  ) {
    this.#messageId = messageId;
    this.#messageBusClientResponsesRef = messageBusClientResponsesRef;
  }

  get #responsesForAllMessages() {
    const messageBusClientResponses =
      this.#messageBusClientResponsesRef.deref();
    if (!messageBusClientResponses)
      throw new Error("Message bus client not found");
    return messageBusClientResponses;
  }

  get #responses() {
    const responses = this.#responsesForAllMessages.get(this.#messageId);
    if (!responses) throw new Error("Message not found");

    return responses;
  }

  responseFrom(subscriberClientId: ClientId) {
    const response =
      this.#responses.get(subscriberClientId) ||
      this.#responses
        .set(subscriberClientId, new Response())
        .get(subscriberClientId)!;
    return new Promise(resolve => {
      if (response.exists) resolve(response.resolveData);
      else response.pushResolveFunction(resolve);
    });
  }

  finish() {
    this.#responses.forEach(response => response.resolve());
    this.#responsesForAllMessages.delete(this.#messageId);
  }
}
