import { oldFunction } from "./api";

export { oldFunction as renamedOld } from "./api";

/** @deprecated Use latinName instead */
export function старыйМетод(): void {}

/** @deprecated Money method retired */
export function old$Method$$(): void {}

export class StrangeApi {
  /** @deprecated Use camelCaseMethod instead */
  public "old method with spaces"(): void {}

  /** @deprecated Use camelCaseMethod instead */
  public "old-kebab-case"(): void {}

  /** @deprecated Old overload: pass an options object instead */
  public load(path: string): void;
  public load(options: { path: string }): void;
  public load(_arg: string | { path: string }): void {}

  /** @deprecated Reading twin is retired; writing is still fine */
  public get twin(): string {
    return "old";
  }

  public set twin(_value: string) {}

  /** @deprecated Use InstanceCounter instead */
  public static oldStatic = 0;

  /** @deprecated Use narrowGeneric instead */
  public oldGeneric<T>(value: T): T {
    return value;
  }

  /**
   * @deprecated Use `renderModern` — survives {{placeholders}}, $& capture groups,
   * and multi-line reasons without corrupting the webview.
   */
  public hostileReason(): void {}
}

export abstract class OldContractBase {
  /** @deprecated Use processBatch instead */
  public abstract oldAbstract(): void;
}

/** @deprecated Wrapper around another deprecated symbol */
export function nestedDeprecated(): void {
  oldFunction();
}
