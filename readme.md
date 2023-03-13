## Interfaces

```ts
const zoneId = "random";
const clientId = "my-plugin";
const secret = "pa55w0rd";
const serverHost = "127.0.0.1:24012";
const serverProtocol = "ws";
```

```ts
// No types for simplicity

// Subscriptions handling
const client = new MessageBusClient(
  zoneId, clientId, secret, serverHost, serverProtocol,
  {
    "some-client-my-plugin-is-subscribed-to": async messageData => {
    /* Do something. You can update internal state here */

    // If response is dependent on user action, you can await it like so:
    let setResponse;
    const responsePromise = new Promise(resolve => { setResponse = resolve });
    // Use `setResponse` outside
    const response = await responsePromise;

    return {
      response,
      onAck: (responseAccepted) => {
      /**
       * You should "undo" the updates (if any) made to internal state here.
       * You can do things conditionally based on whether or not this specific
       * client's response was respected.
       */
      }
    }
  },
  "some-other-client": ...
})

// Publishing
const messageLifecycle = await client.publish(myMessage);
const [response, responseExists] =
  await messageLifecycle.responseFrom("some-subscriber");
await messageLifecycle.finish();
```

```ts
// With types
export const subscriptions = [
  "some-client-my-plugin-is-subscribed-to",
  "some-other-client"
] as const;
type Subscription = (typeof subscriptions)[number];
// Message and responses types should be defined in a separate types package

const client = new MessageBusClient<
  Subscription,
  MyPluginMessage,
  MyPluginResponses
>(zoneId, clientId, secret, serverHost, {
  "some-client-my-plugin-is-subscribed-to": (
    messageData: SomeClientMyPluginIsSubscribedToMessage,
    respond
  ) => {
    // Do something
    return ownResponseRespected => { };
  },
  ...
});

const messageLifecycle = await client.publish(myMessage);
const [response]: SomeSubscriberResponses.MyPlugin =
  await messageLifecycle.responseFrom("some-subscriber");
await messageLifecycle.finish();
```

## Message bus design

[gist](https://gist.github.com/cliffoo/c85f17577e21c6cf74a2969339e514b4)

### Notes

- _Why zones?_
  - The point is that a client can only publish and subscribe to other clients in its zone (and by extension, clients in all zones).
- _What would be an all-zone client?_
  - The client in Truffle CLI would be all-zone. Clients in plugins are zoned.
- _Can zones have different sets of clients?_
  - This normally wouldn't happen but should be handled nonetheless.
- _How do I know this is how it's supposed to work?_
  - For a given message it is known that:
    - Publisher: Sends the message, receives n responses, and acknowledges each of the n responses once.
    - Subscriber: Receives the message, sends a response, and receives a response acknowledgement.
  - You can see this by looking at each participant one-by-one on the diagrams.
- _Limitations?_
  - No duplicate clients in the same zone.
- _Why store messages at all?_
  - In case a client is disconnected (either during or outside the message lifecycle), the outstanding messages / responses can be sent to the client when it reconnects.
- _Why the `onAck` abbreviation?_
  - `onAcknowledge` is semantically inconsistent, "acknowledgment" and "acknowledgement" are both correct spelling.

## Misc.

- Some sort of debug mode during dev to record, replay, and visualize message bus state?
- Plugins should be able to specify if they should always be mounted (default should be no).
