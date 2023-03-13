import type { ClientId, MessageId } from "dashboard-message-bus-common";
import { Response } from "./response";

export class MessageLifecycle {
  #messageId: MessageId;
  #messageBusClientResponsesForAllMessagesRef: WeakRef<
    Map<MessageId, Map<ClientId, Response>>
  >;

  constructor(
    messageId: MessageId,
    messageBusClientResponsesForAllMessages: Map<
      MessageId,
      Map<ClientId, Response>
    >
  ) {
    this.#messageId = messageId;
    this.#messageBusClientResponsesForAllMessagesRef = new WeakRef(
      messageBusClientResponsesForAllMessages
    );
  }

  get #messageBusClientResponsesForAllMessages() {
    const messageBusClientResponsesForAllMessages =
      this.#messageBusClientResponsesForAllMessagesRef.deref();
    if (!messageBusClientResponsesForAllMessages)
      throw new Error("Message bus client not found");
    return messageBusClientResponsesForAllMessages;
  }

  get #responses() {
    const responses = this.#messageBusClientResponsesForAllMessages.get(
      this.#messageId
    );
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
      if (response.didInit) resolve(response.dataToResolve);
      else response.pushResolveFunction(resolve);
    });
  }

  finish() {
    this.#responses.forEach(response => response.resolve());
    this.#messageBusClientResponsesForAllMessages.delete(this.#messageId);
  }
}
