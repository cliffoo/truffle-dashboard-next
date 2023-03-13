import { ZoneId } from "dashboard-message-bus-common";

type Resolve = (data: [unknown, boolean]) => void;

export class Response {
  #acceptedZoneId: ZoneId | undefined;
  #data: unknown;
  #didInit = false;
  #resolveFunctions: Resolve[] = [];

  get acceptedZoneId() {
    return this.#acceptedZoneId;
  }

  get didInit() {
    return this.#didInit;
  }

  get dataToResolve(): [unknown, boolean] {
    return this.#didInit ? [this.#data, true] : [undefined, false];
  }

  init(acceptedZoneId: ZoneId, data: unknown) {
    if (this.#didInit) throw new Error("Response can only be initialized once");
    this.#acceptedZoneId = acceptedZoneId;
    this.#data = data;
    this.#didInit = true;
  }

  pushResolveFunction(resolveFunction: Resolve) {
    this.#resolveFunctions.push(resolveFunction);
  }

  resolve() {
    if (this.#resolveFunctions.length === 0) return;
    const resolveFunctions = this.#resolveFunctions;
    this.#resolveFunctions = [];
    resolveFunctions.forEach(resolveFunction =>
      resolveFunction(this.dataToResolve)
    );
  }
}
