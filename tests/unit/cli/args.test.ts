import * as path from "path";
import { DEFAULT_BASELINE_FILE } from "../../../src/constants";
import { USAGE, parseArgs } from "../../../src/cli/args";

const CWD = path.resolve("/repo");

const parse = (...argv: string[]) => parseArgs(argv, CWD);

const options = (...argv: string[]) => {
  const result = parse(...argv);
  if (!result.ok) {
    throw new Error(`expected a parse, got: ${result.error}`);
  }
  return result.options;
};

const failure = (...argv: string[]) => {
  const result = parse(...argv);
  if (result.ok) {
    throw new Error("expected a parse failure");
  }
  return result.error;
};

describe("parseArgs", () => {
  describe("defaults", () => {
    it("scans the working directory with no arguments", () => {
      const parsed = options();
      expect(parsed.root).toBe(CWD);
      expect(parsed.baselinePath).toBe(path.join(CWD, DEFAULT_BASELINE_FILE));
      expect(parsed.format).toBe("text");
      expect(parsed.annotate).toBe("none");
      expect(parsed.maxNew).toBe(0);
      expect(parsed.failOnAny).toBe(false);
      expect(parsed.quiet).toBe(false);
      expect(parsed.outputPath).toBeUndefined();
    });

    it("resolves a relative path argument against the working directory", () => {
      expect(options("packages/app").root).toBe(
        path.resolve(CWD, "packages/app"),
      );
    });

    it("keeps the baseline beside the scanned project, not the caller", () => {
      const parsed = options("packages/app");
      expect(parsed.baselinePath).toBe(
        path.join(path.resolve(CWD, "packages/app"), DEFAULT_BASELINE_FILE),
      );
    });
  });

  describe("flags", () => {
    it("reads boolean flags", () => {
      const parsed = options(
        "--update-baseline",
        "--fail-on-any",
        "--quiet",
      );
      expect(parsed.updateBaseline).toBe(true);
      expect(parsed.failOnAny).toBe(true);
      expect(parsed.quiet).toBe(true);
    });

    it.each([
      ["--help", "help"],
      ["-h", "help"],
      ["--version", "version"],
      ["-v", "version"],
    ])("%s sets %s", (flag, field) => {
      expect(options(flag)[field as "help" | "version"]).toBe(true);
    });

    it("accepts a value as a separate argument", () => {
      const parsed = options("--format", "sarif", "--max-new", "3");
      expect(parsed.format).toBe("sarif");
      expect(parsed.maxNew).toBe(3);
    });

    it("accepts a value joined with an equals sign", () => {
      const parsed = options("--format=json", "--annotate=github");
      expect(parsed.format).toBe("json");
      expect(parsed.annotate).toBe("github");
    });

    it("resolves --baseline and --output against the working directory", () => {
      const parsed = options("--baseline", "ci/base.json", "--output", "r.txt");
      expect(parsed.baselinePath).toBe(path.resolve(CWD, "ci/base.json"));
      expect(parsed.outputPath).toBe(path.resolve(CWD, "r.txt"));
    });

    it("takes the last value when a flag repeats", () => {
      expect(options("--format", "json", "--format", "sarif").format).toBe(
        "sarif",
      );
    });
  });

  describe("rejections", () => {
    it("rejects an unknown option", () => {
      expect(failure("--bogus")).toBe("Unknown option: --bogus");
    });

    it("rejects a second path", () => {
      expect(failure("one", "two")).toBe("Only one path may be given");
    });

    it.each(["--baseline", "--output"])("%s needs a value", (flag) => {
      expect(failure(flag)).toContain("needs a file path");
    });

    it.each([
      ["--max-new"],
      ["--max-new", "-1"],
      ["--max-new", "1.5"],
      ["--max-new", "lots"],
    ])("rejects a bad --max-new (%s %s)", (...argv) => {
      expect(failure(...argv)).toBe("--max-new needs a whole number >= 0");
    });

    it.each([["--format"], ["--format", "xml"]])(
      "rejects a bad --format",
      (...argv) => {
        expect(failure(...argv)).toContain("--format must be");
      },
    );

    it.each([["--annotate"], ["--annotate", "jenkins"]])(
      "rejects a bad --annotate",
      (...argv) => {
        expect(failure(...argv)).toContain("--annotate must be");
      },
    );

    it("accepts zero as a --max-new value rather than reading it as missing", () => {
      expect(options("--max-new", "0").maxNew).toBe(0);
    });
  });

  it("documents every option it accepts", () => {
    for (const flag of [
      "--baseline",
      "--update-baseline",
      "--max-new",
      "--fail-on-any",
      "--format",
      "--output",
      "--annotate",
      "--quiet",
      "--help",
      "--version",
    ]) {
      expect(USAGE).toContain(flag);
    }
  });
});
