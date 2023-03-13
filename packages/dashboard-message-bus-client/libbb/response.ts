import { ZoneId } from "dashboard-message-bus-common/libbb";

type Resolve = (data: any) => void;

export class Response {
  #firstZoneId: ZoneId | undefined;
  #data: any;
  #exists = false;
  #resolveFunctions: Resolve[] = [];

  get firstZoneId() {
    return this.#firstZoneId;
  }

  get exists() {
    return this.#exists;
  }

  get resolveData() {
    return this.#exists ? [this.#data, true] : [undefined, false];
  }

  set(firstZoneId: ZoneId, data: any) {
    if (this.#exists) throw new Error("");
    this.#firstZoneId = firstZoneId;
    this.#data = data;
    this.#exists = true;
  }

  pushResolveFunction(resolveFunction: Resolve) {
    this.#resolveFunctions.push(resolveFunction);
  }

  resolve() {
    const resolveFunctions = this.#resolveFunctions;
    this.#resolveFunctions = [];
    resolveFunctions.forEach(resolveFunction =>
      resolveFunction(this.resolveData)
    );
  }
}
