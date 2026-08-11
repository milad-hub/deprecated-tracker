import {
  RESERVED_JSDOC_TAGS,
  describeTagProblem,
  isValidRegex,
  normalizeTag,
  validateTagInput,
} from "../../../src/config/tagValidation";

describe("normalizeTag", () => {
  it("strips a leading @, trims and lowercases", () => {
    expect(normalizeTag("  @Legacy ")).toBe("legacy");
  });

  it("leaves a bare name alone apart from casing", () => {
    expect(normalizeTag("OBSOLETE")).toBe("obsolete");
  });
});

describe("describeTagProblem", () => {
  it("accepts a well-formed tag", () => {
    expect(describeTagProblem("@legacy")).toBeUndefined();
  });

  it.each([undefined, null, 42, "", "   "])("rejects %p", (value) => {
    expect(describeTagProblem(value)).toBe("Tag name is required");
  });

  it("requires the @ prefix", () => {
    expect(describeTagProblem("legacy")).toBe("Tag must start with @");
  });

  // The whole point of sharing this with the settings page: a config file must
  // not be able to hijack a tag the compiler already means something by.
  it("refuses a reserved JSDoc tag", () => {
    expect(describeTagProblem("@param")).toBe(
      'Tag "@param" conflicts with reserved JSDoc tag "@param". Please choose a different name.',
    );
  });

  it("refuses a reserved tag whatever its casing", () => {
    expect(describeTagProblem("@Returns")).toContain("conflicts with reserved");
  });

  it("lists @deprecated itself as reserved", () => {
    expect(RESERVED_JSDOC_TAGS).toContain("@deprecated");
  });
});

describe("validateTagInput", () => {
  it("passes a complete tag", () => {
    expect(() => validateTagInput("@legacy", "Legacy", "#abc")).not.toThrow();
  });

  it("throws the same message describeTagProblem returns", () => {
    expect(() => validateTagInput("@param", "Param")).toThrow(
      'Tag "@param" conflicts with reserved JSDoc tag "@param". Please choose a different name.',
    );
  });

  it("requires a label", () => {
    expect(() => validateTagInput("@legacy", "  ")).toThrow("Label is required");
  });

  it("requires a hex colour when one is given", () => {
    expect(() => validateTagInput("@legacy", "Legacy", "red")).toThrow(
      "Color must be a valid hex value",
    );
  });

  it("accepts a six-digit colour", () => {
    expect(() =>
      validateTagInput("@legacy", "Legacy", " #A1B2C3 "),
    ).not.toThrow();
  });
});

describe("isValidRegex", () => {
  it("accepts a compilable pattern", () => {
    expect(isValidRegex("^legacy[A-Z]")).toBe(true);
  });

  it("rejects one that does not compile", () => {
    expect(isValidRegex("([unclosed")).toBe(false);
  });
});
