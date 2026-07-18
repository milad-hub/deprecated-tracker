export class TaggedService {
  /** @obsolete Use TaggedService.modernCall instead */
  public obsoleteTaggedMethod(): void {}

  /** @legacy */
  public legacyTaggedMethod(): void {}

  /** @deprecated */
  public reasonlessMethod(): void {}

  public modernCall(): void {}
}
