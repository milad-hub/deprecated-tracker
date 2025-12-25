import * as vscode from "vscode";
import { DEFAULT_HISTORY_RETENTION } from "../../../src/constants";
import { ScanHistory } from "../../../src/history";
import { DeprecatedItem } from "../../../src/interfaces";

describe("ScanHistory", () => {
    let mockContext: vscode.ExtensionContext;
    let scanHistory: ScanHistory;
    let mockStorage: Map<string, unknown>;

    beforeEach(() => {
        mockStorage = new Map();
        mockContext = {
            workspaceState: {
                get: jest.fn((key: string) => mockStorage.get(key)),
                update: jest.fn((key: string, value: unknown) => {
                    mockStorage.set(key, value);
                    return Promise.resolve();
                }),
            },
        } as unknown as vscode.ExtensionContext;
        scanHistory = new ScanHistory(mockContext);
    });

    describe("saveScan", () => {
        it("should save a scan with metadata", async () => {
            const results: DeprecatedItem[] = [
                {
                    name: "oldMethod",
                    fileName: "test.ts",
                    filePath: "/test.ts",
                    line: 1,
                    character: 1,
                    kind: "method",
                },
                {
                    name: "oldMethod",
                    fileName: "usage.ts",
                    filePath: "/usage.ts",
                    line: 5,
                    character: 2,
                    kind: "usage",
                },
            ];
            const duration = 1500;
            const fileCount = 10;
            const scanId = await scanHistory.saveScan(results, duration, fileCount);
            expect(scanId).toBeTruthy();
            expect(typeof scanId).toBe("string");
            const history = await scanHistory.getHistory();
            expect(history).toHaveLength(1);
            expect(history[0].metadata.scanId).toBe(scanId);
            expect(history[0].metadata.totalItems).toBe(2);
            expect(history[0].metadata.declarationCount).toBe(1);
            expect(history[0].metadata.usageCount).toBe(1);
            expect(history[0].metadata.duration).toBe(duration);
            expect(history[0].metadata.fileCount).toBe(fileCount);
            expect(history[0].results).toEqual(results);
        });

        it("should generate unique scan IDs", async () => {
            const results: DeprecatedItem[] = [];
            const scanId1 = await scanHistory.saveScan(results, 100);
            const scanId2 = await scanHistory.saveScan(results, 100);
            expect(scanId1).not.toBe(scanId2);
        });

        it("should add scans in chronological order (newest first)", async () => {
            const results1: DeprecatedItem[] = [
                {
                    name: "method1",
                    fileName: "test.ts",
                    filePath: "/test.ts",
                    line: 1,
                    character: 1,
                    kind: "method",
                },
            ];
            const results2: DeprecatedItem[] = [
                {
                    name: "method2",
                    fileName: "test.ts",
                    filePath: "/test.ts",
                    line: 2,
                    character: 1,
                    kind: "method",
                },
            ];
            const scanId1 = await scanHistory.saveScan(results1, 100);
            const scanId2 = await scanHistory.saveScan(results2, 200);
            const history = await scanHistory.getHistory();
            expect(history).toHaveLength(2);
            expect(history[0].metadata.scanId).toBe(scanId2);
            expect(history[1].metadata.scanId).toBe(scanId1);
        });

        it("should handle empty results", async () => {
            const scanId = await scanHistory.saveScan([], 100);
            const history = await scanHistory.getHistory();
            expect(history).toHaveLength(1);
            expect(history[0].metadata.totalItems).toBe(0);
            expect(history[0].metadata.declarationCount).toBe(0);
            expect(history[0].metadata.usageCount).toBe(0);
        });

        it("should not save when disabled", async () => {
            scanHistory.updateConfig({ enabled: false });
            const results: DeprecatedItem[] = [
                {
                    name: "method",
                    fileName: "test.ts",
                    filePath: "/test.ts",
                    line: 1,
                    character: 1,
                    kind: "method",
                },
            ];
            const scanId = await scanHistory.saveScan(results, 100);
            expect(scanId).toBe("");
            const history = await scanHistory.getHistory();
            expect(history).toHaveLength(0);
        });
    });

    describe("getHistory", () => {
        it("should return empty array when no history exists", async () => {
            const history = await scanHistory.getHistory();
            expect(history).toEqual([]);
        });

        it("should return all history when no limit specified", async () => {
            await scanHistory.saveScan([], 100);
            await scanHistory.saveScan([], 200);
            await scanHistory.saveScan([], 300);
            const history = await scanHistory.getHistory();
            expect(history).toHaveLength(3);
        });

        it("should respect limit parameter", async () => {
            await scanHistory.saveScan([], 100);
            await scanHistory.saveScan([], 200);
            await scanHistory.saveScan([], 300);
            const history = await scanHistory.getHistory(2);
            expect(history).toHaveLength(2);
        });

        it("should return newest scans first when limited", async () => {
            const scanId1 = await scanHistory.saveScan([], 100);
            const scanId2 = await scanHistory.saveScan([], 200);
            await scanHistory.saveScan([], 300);
            const history = await scanHistory.getHistory(2);
            expect(history).toHaveLength(2);
            expect(history[1].metadata.scanId).toBe(scanId2);
            expect(history[0].metadata.scanId).not.toBe(scanId1);
        });
    });

    describe("getScanById", () => {
        it("should retrieve specific scan by ID", async () => {
            const results: DeprecatedItem[] = [
                {
                    name: "targetMethod",
                    fileName: "test.ts",
                    filePath: "/test.ts",
                    line: 1,
                    character: 1,
                    kind: "method",
                },
            ];
            const scanId = await scanHistory.saveScan(results, 100);
            const scan = await scanHistory.getScanById(scanId);
            expect(scan).not.toBeNull();
            expect(scan?.metadata.scanId).toBe(scanId);
            expect(scan?.results).toEqual(results);
        });

        it("should return null for non-existent scan ID", async () => {
            await scanHistory.saveScan([], 100);
            const scan = await scanHistory.getScanById("non-existent-id");
            expect(scan).toBeNull();
        });
    });

    describe("deleteScan", () => {
        it("should delete a scan by ID", async () => {
            const scanId1 = await scanHistory.saveScan([], 100);
            const scanId2 = await scanHistory.saveScan([], 200);
            const deleted = await scanHistory.deleteScan(scanId1);
            expect(deleted).toBe(true);
            const history = await scanHistory.getHistory();
            expect(history).toHaveLength(1);
            expect(history[0].metadata.scanId).toBe(scanId2);
        });

        it("should return false when scan ID not found", async () => {
            await scanHistory.saveScan([], 100);
            const deleted = await scanHistory.deleteScan("non-existent-id");
            expect(deleted).toBe(false);
            const history = await scanHistory.getHistory();
            expect(history).toHaveLength(1);
        });
    });

    describe("clearHistory", () => {
        it("should clear all history", async () => {
            await scanHistory.saveScan([], 100);
            await scanHistory.saveScan([], 200);
            await scanHistory.saveScan([], 300);
            await scanHistory.clearHistory();
            const history = await scanHistory.getHistory();
            expect(history).toEqual([]);
        });

        it("should handle clearing empty history", async () => {
            await scanHistory.clearHistory();
            const history = await scanHistory.getHistory();
            expect(history).toEqual([]);
        });
    });

    describe("cleanup", () => {
        it("should automatically remove old scans when exceeding maxScans", async () => {
            const customHistory = new ScanHistory(mockContext, { maxScans: 3 });
            await customHistory.saveScan([], 100);
            await customHistory.saveScan([], 200);
            await customHistory.saveScan([], 300);
            await customHistory.saveScan([], 400);
            const history = await customHistory.getHistory();
            expect(history).toHaveLength(3);
        });

        it("should keep newest scans after cleanup", async () => {
            const customHistory = new ScanHistory(mockContext, { maxScans: 2 });
            await customHistory.saveScan([], 100);
            await customHistory.saveScan([], 200);
            const scanId3 = await customHistory.saveScan([], 300);
            const history = await customHistory.getHistory();
            expect(history).toHaveLength(2);
            expect(history[0].metadata.scanId).toBe(scanId3);
        });

        it("should use default retention of 50 scans", async () => {
            const config = scanHistory.getConfig();
            expect(config.maxScans).toBe(DEFAULT_HISTORY_RETENTION);
        });
    });

    describe("getHistoryMetadata", () => {
        it("should return metadata only without results", async () => {
            const results: DeprecatedItem[] = [
                {
                    name: "method",
                    fileName: "test.ts",
                    filePath: "/test.ts",
                    line: 1,
                    character: 1,
                    kind: "method",
                },
            ];
            await scanHistory.saveScan(results, 100, 5);
            const metadata = await scanHistory.getHistoryMetadata();
            expect(metadata).toHaveLength(1);
            expect(metadata[0]).toHaveProperty("scanId");
            expect(metadata[0]).toHaveProperty("timestamp");
            expect(metadata[0]).toHaveProperty("totalItems");
            expect(metadata[0]).not.toHaveProperty("results");
        });

        it("should respect limit for metadata", async () => {
            await scanHistory.saveScan([], 100);
            await scanHistory.saveScan([], 200);
            await scanHistory.saveScan([], 300);
            const metadata = await scanHistory.getHistoryMetadata(2);
            expect(metadata).toHaveLength(2);
        });
    });

    describe("config management", () => {
        it("should get current config", () => {
            const config = scanHistory.getConfig();
            expect(config).toHaveProperty("maxScans");
            expect(config).toHaveProperty("enabled");
            expect(config.enabled).toBe(true);
        });

        it("should update config", () => {
            scanHistory.updateConfig({ maxScans: 100 });
            const config = scanHistory.getConfig();
            expect(config.maxScans).toBe(100);
        });

        it("should preserve existing config when partially updating", () => {
            scanHistory.updateConfig({ maxScans: 100 });
            scanHistory.updateConfig({ enabled: false });
            const config = scanHistory.getConfig();
            expect(config.maxScans).toBe(100);
            expect(config.enabled).toBe(false);
        });
    });

    describe("storage integration", () => {
        it("should persist data across instances", async () => {
            const scanId = await scanHistory.saveScan([], 100);
            const newInstance = new ScanHistory(mockContext);
            const history = await newInstance.getHistory();
            expect(history).toHaveLength(1);
            expect(history[0].metadata.scanId).toBe(scanId);
        });

        it("should call workspaceState.update when saving", async () => {
            await scanHistory.saveScan([], 100);
            expect(mockContext.workspaceState.update).toHaveBeenCalled();
        });

        it("should call workspaceState.get when retrieving", async () => {
            await scanHistory.getHistory();
            expect(mockContext.workspaceState.get).toHaveBeenCalled();
        });
    });
});