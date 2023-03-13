export type ResponseAcknowledgmentHandler = (
  responseAccepted: boolean
) => void | Promise<void>;
