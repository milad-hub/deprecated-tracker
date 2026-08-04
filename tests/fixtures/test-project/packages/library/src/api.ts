export function Deprecated(_reason?: string): any {
  return () => undefined;
}

export function obsolete(_reason?: string): any {
  return () => undefined;
}

export function Other(): any {
  return () => undefined;
}

export namespace Compat {
  export function deprecated(_reason?: string): any {
    return () => undefined;
  }
}

export class Api {
  /** @deprecated since 1.4, removed in 2.0. Use newMethod instead */
  public oldMethod(): void {}

  /** @deprecated since 2023-01-15, removed in 2024-06-30. Use newProperty instead */
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

  @Compat.deprecated("Use compatFree instead")
  public oldCompat(): void {}

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

/** @deprecated since v3.2. Use newFunction instead */
export function oldFunction(): void {}

/** @deprecated since 4.0, removed in 2024-13-45. Use newFunction instead */
export const oldArrow = (): void => {};

/** @deprecated Use newValue instead. Removal 2099-12-31 */
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
