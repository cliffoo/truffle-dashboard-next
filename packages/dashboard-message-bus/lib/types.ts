import type { ClientId } from "dashboard-message-bus-common";

export type Subscriptions = Record<ClientId, Set<ClientId>>;
