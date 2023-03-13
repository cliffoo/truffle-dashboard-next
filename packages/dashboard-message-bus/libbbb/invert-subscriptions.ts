import type { Subscriptions } from "./types";

export function invertSubscriptions(subscriptions: Subscriptions) {
  const inverted: Subscriptions = new Map();

  subscriptions.forEach((valueClientIds, keyClientId) => {
    valueClientIds.forEach(valueClientId => {
      const invertedValue =
        inverted.get(valueClientId) ||
        inverted.set(valueClientId, new Set()).get(valueClientId)!;
      invertedValue.add(keyClientId);
    });
  });

  return inverted;
}
