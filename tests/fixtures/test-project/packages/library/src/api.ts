export function Deprecated(_reason?: string): any {
  return () => undefined;
}

export function obsolete(_reason?: string): any {
  return () => undefined;
}

export function Other(): any {
  return () => undefined;
}

export class Api {
  /** @deprecated Use newMethod instead */
  public oldMethod(): void {}

  /** @deprecated Use newProperty instead */
  public oldProperty = "old";

  @Deprecated("Use newAccessor instead")
  public get oldAccessor(): string {
    return "old";
  }

  @Deprecated()
  public set oldSetting(_value: string) {}

  @obsolete()
  public oldCustom(): void {}

  @Other()
  public currentMethod(): void {}

  /** @deprecated Use newMethod instead */
  public ["oldComputed"](): void {}
}

/** @deprecated Use NewType instead */
export type OldType = string;

/** @deprecated Use CurrentEnum instead */
export enum OldEnum {
  Value,
}

export enum CurrentEnum {
  /** @deprecated Use CurrentEnum.NewValue instead */
  OldMember,
  NewValue,
}

/** @deprecated Use NewNamespace instead */
export namespace OldNamespace {
  export const value = 1;
}

/** @deprecated Use newFunction instead */
export function oldFunction(): void {}

/** @deprecated Use newFunction instead */
export const oldArrow = (): void => {};

/** @deprecated Use newValue instead */
export const oldValue = 1;

export function parameterUsage(
  /** @deprecated Use newParameter instead */ oldParameter: string,
): string {
  return oldParameter;
}

export class Legacy {
  /** @deprecated Use Legacy.create instead */
  public constructor() {}
}

export interface Callable {
  /** @deprecated Use callable.run instead */
  (): void;
}

export interface Factory {
  /** @deprecated Use Factory.create instead */
  new (): Legacy;
}

export interface Dictionary {
  /** @deprecated Use dictionary.get instead */
  [key: string]: string;
}

export interface Contract {
  /** @deprecated Use Contract.newMethod instead */
  oldInterfaceMethod(): void;
}

export class Implementation implements Contract {
  public oldInterfaceMethod(): void {}
}

export class Base {
  /** @deprecated Use Base.newMethod instead */
  public oldBaseMethod(): void {}
}

export class Child extends Base {
  public override oldBaseMethod(): void {}
}
